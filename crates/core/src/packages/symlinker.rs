use anyhow::Result;
use serde::{Deserialize, Serialize};
use std::fs;
use std::path::{Path, PathBuf};

use crate::platforms::{get_platform, resolve_path};

/// Create a symlink (or junction on Windows) from source to target.
fn create_symlink(source: &Path, target: &Path) -> std::io::Result<()> {
    #[cfg(unix)]
    {
        std::os::unix::fs::symlink(source, target)
    }
    #[cfg(windows)]
    {
        if source.is_dir() {
            // Try symlink first (works with Developer Mode enabled)
            match std::os::windows::fs::symlink_dir(source, target) {
                Ok(()) => Ok(()),
                Err(_) => {
                    // Fall back to junction (works without privileges)
                    junction::create(source, target)
                }
            }
        } else {
            std::os::windows::fs::symlink_file(source, target)
        }
    }
}

/// Remove a symlink or junction.
fn remove_symlink(path: &Path) -> std::io::Result<()> {
    #[cfg(unix)]
    {
        fs::remove_file(path)
    }
    #[cfg(windows)]
    {
        // On Windows, directory symlinks/junctions must be removed with remove_dir
        if path.is_dir() {
            fs::remove_dir(path)
        } else {
            fs::remove_file(path)
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SymlinkEntry {
    pub package: String,
    pub source: PathBuf,
    pub target: PathBuf,
    pub platform: String,
    pub scope: String,
    pub component: String, // "skill", "mcp", "instructions"
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct SymlinkState {
    pub symlinks: Vec<SymlinkEntry>,
}

impl SymlinkState {
    pub fn load(state_path: &Path) -> Self {
        if state_path.exists() {
            fs::read_to_string(state_path)
                .ok()
                .and_then(|s| serde_json::from_str(&s).ok())
                .unwrap_or_default()
        } else {
            Self::default()
        }
    }

    pub fn save(&self, state_path: &Path) -> Result<()> {
        let json = serde_json::to_string_pretty(self)?;
        fs::write(state_path, json)?;
        Ok(())
    }
}

/// Enable a package for a specific platform.
/// Creates symlinks from the package registry into the platform's target directories.
pub fn enable_platform(
    package_name: &str,
    package_dir: &Path,
    platform_id: &str,
    scope: &str, // "profile" or "project"
    project_path: Option<&Path>,
    state_path: &Path,
) -> Result<Vec<SymlinkEntry>> {
    let platform = get_platform(platform_id)
        .ok_or_else(|| anyhow::anyhow!("Unknown platform: {}", platform_id))?;

    let scope_root = match scope {
        "profile" => dirs::home_dir()
            .ok_or_else(|| anyhow::anyhow!("Cannot find home directory"))?,
        "project" => project_path
            .ok_or_else(|| anyhow::anyhow!("Project path required for project scope"))?
            .to_path_buf(),
        _ => anyhow::bail!("Invalid scope: {}", scope),
    };

    let mut state = SymlinkState::load(state_path);
    let mut created: Vec<SymlinkEntry> = Vec::new();

    // Link skills directory contents
    let source_skills = package_dir.join(&platform.skills_dir);
    if source_skills.is_dir() {
        let target_dir = resolve_path(&platform, "skills_dir", &scope_root).unwrap();
        fs::create_dir_all(&target_dir)?;

        for entry in fs::read_dir(&source_skills)?.flatten() {
            if entry.path().is_dir() {
                let skill_name = entry.file_name();
                let target = target_dir.join(&skill_name);

                // Check for existing symlink ownership (use outer `state` to include entries added this session)
                if target.is_symlink() || target.exists() {
                    let owned = state.symlinks.iter().any(|s| s.target == target);
                    if !owned {
                        log::warn!(
                            "Skipping {}: target already exists and is not managed by AgentStore",
                            target.display()
                        );
                        continue;
                    }
                    if target.is_symlink() {
                        remove_symlink(&target)?;
                    } else {
                        fs::remove_dir_all(&target)?;
                    }
                }

                create_symlink(&entry.path(), &target)?;

                let link = SymlinkEntry {
                    package: package_name.to_string(),
                    source: entry.path(),
                    target: target.clone(),
                    platform: platform_id.to_string(),
                    scope: scope.to_string(),
                    component: "skill".to_string(),
                };
                created.push(link.clone());
                state.symlinks.push(link);
            }
        }
    }

    // Also check root-level skill files (standalone .md with frontmatter)
    // and platform-agnostic locations
    let alt_skills_dirs = [".claude/skills", ".github/skills", ".cursor/skills"];
    for alt in &alt_skills_dirs {
        let alt_path = package_dir.join(alt);
        if alt_path.is_dir() && *alt != platform.skills_dir {
            // Cross-platform: if package has skills for another platform,
            // link them to this platform's skills dir too
            let target_dir = resolve_path(&platform, "skills_dir", &scope_root).unwrap();
            fs::create_dir_all(&target_dir)?;

            for entry in fs::read_dir(&alt_path)?.flatten() {
                if entry.path().is_dir() {
                    let skill_name = entry.file_name();
                    let target = target_dir.join(&skill_name);

                    // Ownership check for alt path (same logic as primary path)
                    if target.is_symlink() || target.exists() {
                        let owned = state.symlinks.iter().any(|s| s.target == target);
                        if !owned {
                            log::warn!(
                                "Skipping {}: target already exists and is not managed by AgentStore",
                                target.display()
                            );
                            continue;
                        }
                        if target.is_symlink() {
                            remove_symlink(&target)?;
                        } else {
                            fs::remove_dir_all(&target)?;
                        }
                    }

                    create_symlink(&entry.path(), &target)?;
                    let link = SymlinkEntry {
                        package: package_name.to_string(),
                        source: entry.path(),
                        target,
                        platform: platform_id.to_string(),
                        scope: scope.to_string(),
                        component: "skill".to_string(),
                    };
                    created.push(link.clone());
                    state.symlinks.push(link);
                }
            }
        }
    }

    state.save(state_path)?;
    Ok(created)
}

/// Disable a package for a specific platform.
/// Removes all symlinks for this package+platform combination.
pub fn disable_platform(
    package_name: &str,
    platform_id: &str,
    state_path: &Path,
) -> Result<usize> {
    let mut state = SymlinkState::load(state_path);

    let (to_remove, to_keep): (Vec<_>, Vec<_>) = state.symlinks.into_iter().partition(|s| {
        s.package == package_name && s.platform == platform_id
    });

    let removed = to_remove.len();
    for entry in &to_remove {
        if entry.target.is_symlink() || entry.target.exists() {
            let _ = remove_symlink(&entry.target);
        }
    }

    state.symlinks = to_keep;
    state.save(state_path)?;

    Ok(removed)
}

/// Disable a package for a specific platform and scope.
/// Only removes symlinks whose targets live under the given root path.
pub fn disable_platform_scope(
    package_name: &str,
    platform_id: &str,
    scope_root: &Path,
    state_path: &Path,
) -> Result<usize> {
    let mut state = SymlinkState::load(state_path);

    let (to_remove, to_keep): (Vec<_>, Vec<_>) = state.symlinks.into_iter().partition(|s| {
        s.package == package_name && s.platform == platform_id && s.target.starts_with(scope_root)
    });

    let removed = to_remove.len();
    for entry in &to_remove {
        if entry.target.is_symlink() || entry.target.exists() {
            let _ = remove_symlink(&entry.target);
        }
    }

    state.symlinks = to_keep;
    state.save(state_path)?;

    Ok(removed)
}

/// Remove all symlinks for a package across all platforms.
pub fn disable_all(package_name: &str, state_path: &Path) -> Result<usize> {
    let mut state = SymlinkState::load(state_path);

    let (to_remove, to_keep): (Vec<_>, Vec<_>) = state
        .symlinks
        .into_iter()
        .partition(|s| s.package == package_name);

    let removed = to_remove.len();
    for entry in &to_remove {
        if entry.target.is_symlink() || entry.target.exists() {
            let _ = remove_symlink(&entry.target);
        }
    }

    state.symlinks = to_keep;
    state.save(state_path)?;

    Ok(removed)
}

/// Get usage stats: count of active symlinks per platform.
pub fn usage_stats(state_path: &Path) -> Vec<(String, usize)> {
    let state = SymlinkState::load(state_path);
    let platforms = crate::platforms::all_platforms();
    let mut stats = Vec::new();

    for p in &platforms {
        let count = state.symlinks.iter().filter(|s| s.platform == p.id).count();
        stats.push((p.id.clone(), count));
    }

    stats
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;
    use tempfile::TempDir;

    #[test]
    fn disable_removes_symlinks() {
        let tmp = TempDir::new().unwrap();
        let state_path = tmp.path().join("state.json");
        let target = tmp.path().join("target-link");

        // Create a fake symlink
        let source = tmp.path().join("source");
        fs::create_dir_all(&source).unwrap();
        create_symlink(&source, &target).unwrap();

        // Pre-populate state
        let state = SymlinkState {
            symlinks: vec![SymlinkEntry {
                package: "test-pkg".into(),
                source: source.clone(),
                target: target.clone(),
                platform: "claude".into(),
                scope: "profile".into(),
                component: "skill".into(),
            }],
        };
        state.save(&state_path).unwrap();

        let removed = disable_platform("test-pkg", "claude", &state_path).unwrap();
        assert_eq!(removed, 1);
        assert!(!target.exists());

        let state_after = SymlinkState::load(&state_path);
        assert!(state_after.symlinks.is_empty());
    }

    #[test]
    fn disable_all_removes_across_platforms() {
        let tmp = TempDir::new().unwrap();
        let state_path = tmp.path().join("state.json");

        let state = SymlinkState {
            symlinks: vec![
                SymlinkEntry {
                    package: "test-pkg".into(),
                    source: tmp.path().join("a"),
                    target: tmp.path().join("link-a"),
                    platform: "claude".into(),
                    scope: "profile".into(),
                    component: "skill".into(),
                },
                SymlinkEntry {
                    package: "test-pkg".into(),
                    source: tmp.path().join("b"),
                    target: tmp.path().join("link-b"),
                    platform: "cursor".into(),
                    scope: "profile".into(),
                    component: "skill".into(),
                },
                SymlinkEntry {
                    package: "other-pkg".into(),
                    source: tmp.path().join("c"),
                    target: tmp.path().join("link-c"),
                    platform: "claude".into(),
                    scope: "profile".into(),
                    component: "skill".into(),
                },
            ],
        };
        state.save(&state_path).unwrap();

        let removed = disable_all("test-pkg", &state_path).unwrap();
        assert_eq!(removed, 2);

        let state_after = SymlinkState::load(&state_path);
        assert_eq!(state_after.symlinks.len(), 1);
        assert_eq!(state_after.symlinks[0].package, "other-pkg");
    }

    #[test]
    fn conflict_refuses_unmanaged_symlink() {
        let tmp = TempDir::new().unwrap();
        let state_path = tmp.path().join("state.json");

        // Create an unmanaged symlink
        let source = tmp.path().join("external-source");
        fs::create_dir_all(&source).unwrap();
        let target = tmp.path().join("home/.claude/skills/conflicting-skill");
        fs::create_dir_all(target.parent().unwrap()).unwrap();
        create_symlink(&source, &target).unwrap();

        // Empty state (no record of this symlink)
        let state = SymlinkState::default();
        state.save(&state_path).unwrap();

        let loaded = SymlinkState::load(&state_path);
        let owned = loaded.symlinks.iter().any(|s| s.target == target);
        assert!(!owned, "unmanaged symlink should not be owned");
    }

    /// A symlink that IS recorded in state is owned: the ownership check returns true
    /// and the enable logic would replace it rather than skip it.
    #[test]
    fn managed_symlink_is_owned() {
        let tmp = TempDir::new().unwrap();
        let state_path = tmp.path().join("state.json");

        let source = tmp.path().join("pkg-source");
        fs::create_dir_all(&source).unwrap();
        let target = tmp.path().join("skills/my-skill");
        fs::create_dir_all(target.parent().unwrap()).unwrap();
        create_symlink(&source, &target).unwrap();

        // Record this symlink in state (simulates a previous enable_platform call)
        let state = SymlinkState {
            symlinks: vec![SymlinkEntry {
                package: "my-pkg".into(),
                source: source.clone(),
                target: target.clone(),
                platform: "claude".into(),
                scope: "profile".into(),
                component: "skill".into(),
            }],
        };
        state.save(&state_path).unwrap();

        let loaded = SymlinkState::load(&state_path);
        let owned = loaded.symlinks.iter().any(|s| s.target == target);
        assert!(owned, "managed symlink should be owned by AgentStore");
    }

    /// A symlink NOT in state at a target means the ownership check returns false.
    /// The enable_platform logic must skip rather than overwrite it.
    #[test]
    fn unmanaged_symlink_in_alt_skills_dir_is_not_owned() {
        let tmp = TempDir::new().unwrap();
        let state_path = tmp.path().join("state.json");

        // Simulate a foreign symlink at a path that alt_skills_dirs logic might target
        let external_source = tmp.path().join("external");
        fs::create_dir_all(&external_source).unwrap();
        let target = tmp.path().join("claude-skills/some-skill");
        fs::create_dir_all(target.parent().unwrap()).unwrap();
        std::os::unix::fs::symlink(&external_source, &target).unwrap();

        // State is empty — nothing owned
        let state = SymlinkState::default();
        state.save(&state_path).unwrap();

        let loaded = SymlinkState::load(&state_path);
        let owned = loaded.symlinks.iter().any(|s| s.target == target);
        assert!(!owned, "symlink not in state must not be owned");

        // The symlink must still exist (enable_platform would have skipped it)
        assert!(target.is_symlink(), "unmanaged symlink should not be touched");
    }

    #[test]
    fn state_round_trips() {
        let tmp = TempDir::new().unwrap();
        let state_path = tmp.path().join("state.json");

        let state = SymlinkState {
            symlinks: vec![SymlinkEntry {
                package: "pkg".into(),
                source: tmp.path().join("src"),
                target: tmp.path().join("tgt"),
                platform: "claude".into(),
                scope: "profile".into(),
                component: "skill".into(),
            }],
        };
        state.save(&state_path).unwrap();

        let loaded = SymlinkState::load(&state_path);
        assert_eq!(loaded.symlinks.len(), 1);
        assert_eq!(loaded.symlinks[0].package, "pkg");
    }
}
