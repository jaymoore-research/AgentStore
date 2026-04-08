pub mod analyser;
pub mod detector;
pub mod injector;
pub mod scanner;
pub mod symlinker;

use anyhow::Result;
use regex::Regex;
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::fs;
use std::path::Path;
use std::process::Command;

use crate::platforms;
use crate::storage::AppPaths;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PackageManifest {
    pub name: String,
    pub repo: String,
    pub description: Option<String>,
    pub stars: u32,
    pub installed_at: String,
    pub supports: Vec<String>,
    pub enabled: HashMap<String, PlatformState>,
    pub components: PackageComponents,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PlatformState {
    pub scope: String, // "profile" or "project"
    pub project_path: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PackageComponents {
    pub skills: Vec<String>,
    pub mcp_servers: Vec<String>,
    pub instructions: bool,
    pub hooks: Vec<String>,
    pub keybindings: Vec<String>,
}

/// Validate that a GitHub owner or repo name contains only safe characters.
/// Prevents path traversal attacks (e.g. `../` in name).
pub fn validate_name(value: &str, label: &str) -> Result<()> {
    let re = Regex::new(r"^[a-zA-Z0-9._-]+$").unwrap();
    if value.is_empty() || !re.is_match(value) || value == "." || value == ".." {
        anyhow::bail!("Invalid {}: '{}'. Only alphanumeric, dot, hyphen, and underscore are allowed.", label, value);
    }
    Ok(())
}

/// Clone a repo with shallow depth.
pub fn clone_repo(repo_url: &str, dest: &Path) -> Result<()> {
    let status = Command::new("git")
        .args(["clone", "--depth", "1", repo_url])
        .arg(dest)
        .status()?;

    if !status.success() {
        anyhow::bail!("git clone failed for {}", repo_url);
    }
    Ok(())
}

/// Install a package from GitHub.
///
/// `on_progress(step, detail, fraction)` is called at key points so callers
/// can surface progress to a UI or CLI.
pub fn install_package(
    paths: &AppPaths,
    owner: &str,
    name: &str,
    description: Option<&str>,
    stars: u32,
    enable_platforms: &[String],
    scope: &str,
    project_path: Option<&str>,
    on_progress: impl Fn(&str, &str, f32),
) -> Result<PackageManifest> {
    validate_name(owner, "owner")?;
    validate_name(name, "name")?;
    for pid in enable_platforms {
        validate_name(pid, "platform")?;
    }

    let package_dir = paths.packages_dir.join(name);

    // Step 1: Clone to temp dir first (preserves existing install on failure)
    on_progress("Cloning", &format!("Cloning {}/{}...", owner, name), 0.2);
    let repo_url = format!("https://github.com/{}/{}.git", owner, name);
    let temp_dir = paths.packages_dir.join(format!(".tmp-{}", name));
    if temp_dir.exists() {
        fs::remove_dir_all(&temp_dir)?;
    }
    fs::create_dir_all(&temp_dir)?;
    let repo_dir = temp_dir.join("repo");
    clone_repo(&repo_url, &repo_dir).map_err(|e| {
        let _ = fs::remove_dir_all(&temp_dir);
        anyhow::anyhow!("Clone failed: {}", e)
    })?;

    // Clone succeeded: swap temp dir into place
    if package_dir.exists() {
        fs::remove_dir_all(&package_dir)?;
    }
    fs::rename(&temp_dir, &package_dir)?;
    let repo_dir = package_dir.join("repo");

    // Step 2: Detect components
    on_progress("Detecting", "Scanning for agent components...", 0.4);
    let detected = detector::detect_components(&repo_dir);

    if detected.platforms.is_empty() && detected.skills.is_empty() && !detected.is_apm {
        let _ = fs::remove_dir_all(&package_dir);
        anyhow::bail!("This repo doesn't contain agent package components (no skills, instructions, or MCP configs found).");
    }

    // Step 3: If APM, compile
    if detected.is_apm {
        on_progress("Compiling", "Compiling agent package...", 0.5);
        let apm_result = std::process::Command::new("apm")
            .args(["compile", "--target", "all"])
            .current_dir(&repo_dir)
            .status();

        if apm_result.is_err() {
            log::warn!("apm not available, skipping compilation for {}", name);
        }
    }

    // Step 4: Enable for selected platforms
    on_progress("Enabling", "Creating symlinks...", 0.7);
    let state_path = paths.packages_dir.join("state.json");
    let mut enabled: HashMap<String, PlatformState> = HashMap::new();

    let proj_path = project_path.map(std::path::PathBuf::from);

    for platform_id in enable_platforms {
        if detected.platforms.contains(platform_id) || detected.is_apm {
            let result = symlinker::enable_platform(
                name,
                &repo_dir,
                platform_id,
                scope,
                proj_path.as_deref(),
                &state_path,
            );

            match result {
                Ok(_links) => {
                    enabled.insert(
                        platform_id.clone(),
                        PlatformState {
                            scope: scope.to_string(),
                            project_path: project_path.map(|s| s.to_string()),
                        },
                    );
                }
                Err(e) => {
                    log::warn!("Failed to enable {} for {}: {}", platform_id, name, e);
                }
            }

            // Inject instructions if available
            if let Some(ref instr_file) = platforms::get_platform(platform_id)
                .and_then(|p| p.instructions_file.clone())
            {
                let source_instr = repo_dir.join(instr_file);
                if source_instr.exists() {
                    let scope_root = if scope == "profile" {
                        dirs::home_dir()
                            .ok_or_else(|| anyhow::anyhow!("Cannot determine home directory"))?
                    } else {
                        proj_path
                            .clone()
                            .ok_or_else(|| anyhow::anyhow!("Project path required for project scope"))?
                    };
                    let target = scope_root.join(instr_file);
                    if let Ok(content) = fs::read_to_string(&source_instr) {
                        let _ = injector::inject_instructions(&target, name, &content);
                    }
                }
            }
        }
    }

    // Step 5: Write manifest
    on_progress("Finalising", "Writing manifest...", 0.9);
    let manifest = PackageManifest {
        name: name.to_string(),
        repo: format!("{}/{}", owner, name),
        description: description.map(|s| s.to_string()),
        stars,
        installed_at: chrono::Utc::now().to_rfc3339(),
        supports: detected.platforms,
        enabled,
        components: PackageComponents {
            skills: detected.skills,
            mcp_servers: detected.mcp_servers,
            instructions: detected.has_instructions,
            hooks: vec![],
            keybindings: vec![],
        },
    };

    let manifest_json = serde_json::to_string_pretty(&manifest)?;
    fs::write(package_dir.join("manifest.json"), manifest_json)?;

    on_progress("Done", "Package installed!", 1.0);
    Ok(manifest)
}

/// Uninstall a package: remove symlinks, instruction injections, and the package directory.
pub fn uninstall_package(paths: &AppPaths, name: &str) -> Result<()> {
    validate_name(name, "name")?;
    let package_dir = paths.packages_dir.join(name);
    let state_path = paths.packages_dir.join("state.json");

    // Remove all symlinks
    symlinker::disable_all(name, &state_path)?;

    // Remove instruction injections across all platforms
    for platform in platforms::all_platforms() {
        if let Some(ref instr_file) = platform.instructions_file {
            if let Some(home) = dirs::home_dir() {
                let target = home.join(instr_file);
                let _ = injector::remove_instructions(&target, name);
            }
        }
    }

    // Remove package directory
    if package_dir.exists() {
        fs::remove_dir_all(&package_dir)?;
    }

    Ok(())
}

/// List all installed packages.
pub fn list_packages(paths: &AppPaths) -> Result<Vec<PackageManifest>> {
    let mut packages = Vec::new();

    if !paths.packages_dir.exists() {
        return Ok(packages);
    }

    let entries = fs::read_dir(&paths.packages_dir)?;
    for entry in entries.flatten() {
        let manifest_path = entry.path().join("manifest.json");
        if manifest_path.exists() {
            if let Ok(data) = fs::read_to_string(&manifest_path) {
                if let Ok(manifest) = serde_json::from_str::<PackageManifest>(&data) {
                    packages.push(manifest);
                }
            }
        }
    }

    packages.sort_by(|a, b| b.installed_at.cmp(&a.installed_at));
    Ok(packages)
}

/// Enable or disable a platform for an installed package.
pub fn toggle_platform(
    paths: &AppPaths,
    name: &str,
    platform_id: &str,
    enable: bool,
    scope: &str,
    project_path: Option<&str>,
) -> Result<()> {
    validate_name(name, "name")?;
    validate_name(platform_id, "platform")?;
    let package_dir = paths.packages_dir.join(name);
    let state_path = paths.packages_dir.join("state.json");
    let repo_dir = package_dir.join("repo");
    let manifest_path = package_dir.join("manifest.json");

    if !manifest_path.exists() {
        anyhow::bail!("Package not found");
    }

    let mut manifest: PackageManifest =
        serde_json::from_str(&fs::read_to_string(&manifest_path)?)?;

    if enable {
        let proj_path = project_path.map(std::path::PathBuf::from);
        symlinker::enable_platform(
            name,
            &repo_dir,
            platform_id,
            scope,
            proj_path.as_deref(),
            &state_path,
        )?;

        manifest.enabled.insert(
            platform_id.to_string(),
            PlatformState {
                scope: scope.to_string(),
                project_path: project_path.map(|s| s.to_string()),
            },
        );

        // Inject instructions
        if let Some(platform) = platforms::get_platform(platform_id) {
            if let Some(ref instr_file) = platform.instructions_file {
                let source = repo_dir.join(instr_file);
                if source.exists() {
                    let scope_root = if manifest.enabled[platform_id].scope == "profile" {
                        dirs::home_dir()
                            .ok_or_else(|| anyhow::anyhow!("Cannot determine home directory"))?
                    } else {
                        std::path::PathBuf::from(
                            manifest.enabled[platform_id]
                                .project_path
                                .as_deref()
                                .unwrap_or("."),
                        )
                    };
                    let target = scope_root.join(instr_file);
                    if let Ok(content) = fs::read_to_string(&source) {
                        let _ = injector::inject_instructions(&target, name, &content);
                    }
                }
            }
        }
    } else {
        symlinker::disable_platform(name, platform_id, &state_path)?;
        manifest.enabled.remove(platform_id);

        // Remove instructions
        if let Some(platform) = platforms::get_platform(platform_id) {
            if let Some(ref instr_file) = platform.instructions_file {
                if let Some(home) = dirs::home_dir() {
                    let target = home.join(instr_file);
                    let _ = injector::remove_instructions(&target, name);
                }
            }
        }
    }

    let json = serde_json::to_string_pretty(&manifest)?;
    fs::write(&manifest_path, json)?;

    Ok(())
}

/// Update an installed package by re-cloning and re-enabling previously enabled platforms.
pub fn update_package(
    paths: &AppPaths,
    name: &str,
    on_progress: impl Fn(&str, &str, f32),
) -> Result<PackageManifest> {
    validate_name(name, "name")?;

    let package_dir = paths.packages_dir.join(name);
    let manifest_path = package_dir.join("manifest.json");

    if !manifest_path.exists() {
        anyhow::bail!("Package not found");
    }

    // Read existing manifest to preserve repo info and enabled state
    let data = fs::read_to_string(&manifest_path)?;
    let old_manifest: PackageManifest = serde_json::from_str(&data)?;

    let state_path = paths.packages_dir.join("state.json");

    // Disable all platforms (remove symlinks)
    symlinker::disable_all(name, &state_path)?;

    // Remove old repo
    let repo_dir = package_dir.join("repo");
    if repo_dir.exists() {
        fs::remove_dir_all(&repo_dir)?;
    }

    // Re-clone
    on_progress("Updating", &format!("Pulling latest {}...", name), 0.3);
    let repo_url = format!("https://github.com/{}.git", old_manifest.repo);
    clone_repo(&repo_url, &repo_dir).map_err(|e| anyhow::anyhow!("Clone failed: {}", e))?;

    // Re-detect
    on_progress("Detecting", "Scanning for changes...", 0.5);
    let detected = detector::detect_components(&repo_dir);

    // Re-enable for previously enabled platforms
    on_progress("Enabling", "Updating symlinks...", 0.7);
    for (platform_id, state) in &old_manifest.enabled {
        let proj_path = state
            .project_path
            .as_ref()
            .map(|p| std::path::PathBuf::from(p));
        let _ = symlinker::enable_platform(
            name,
            &repo_dir,
            platform_id,
            &state.scope,
            proj_path.as_deref(),
            &state_path,
        );
    }

    // Write updated manifest
    on_progress("Finalising", "Writing manifest...", 0.9);
    let manifest = PackageManifest {
        name: name.to_string(),
        repo: old_manifest.repo,
        description: old_manifest.description,
        stars: old_manifest.stars,
        installed_at: old_manifest.installed_at,
        supports: detected.platforms,
        enabled: old_manifest.enabled,
        components: PackageComponents {
            skills: detected.skills,
            mcp_servers: detected.mcp_servers,
            instructions: detected.has_instructions,
            hooks: vec![],
            keybindings: vec![],
        },
    };

    let json = serde_json::to_string_pretty(&manifest)?;
    fs::write(&manifest_path, json)?;

    on_progress("Done", "Package updated!", 1.0);
    Ok(manifest)
}

/// Read the manifest for a single installed package.
pub fn get_package_info(paths: &AppPaths, name: &str) -> Result<PackageManifest> {
    validate_name(name, "name")?;

    let manifest_path = paths.packages_dir.join(name).join("manifest.json");
    if !manifest_path.exists() {
        anyhow::bail!("Package not found");
    }

    let data = fs::read_to_string(&manifest_path)?;
    Ok(serde_json::from_str(&data)?)
}

/// Analyse a cloned package repo and return structured metadata.
pub fn analyse_package(paths: &AppPaths, name: &str) -> Result<analyser::RepoAnalysis> {
    validate_name(name, "name")?;

    let repo_dir = paths.packages_dir.join(name).join("repo");
    if !repo_dir.exists() {
        anyhow::bail!("Package not found");
    }
    Ok(analyser::analyse_repo(&repo_dir))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn valid_names_pass() {
        assert!(validate_name("my-repo", "name").is_ok());
        assert!(validate_name("owner.name", "owner").is_ok());
        assert!(validate_name("repo_v2", "name").is_ok());
        assert!(validate_name("a", "name").is_ok());
    }

    #[test]
    fn path_traversal_rejected() {
        assert!(validate_name("../etc", "name").is_err());
        assert!(validate_name("foo/../bar", "name").is_err());
        assert!(validate_name("", "name").is_err());
        assert!(validate_name("foo bar", "name").is_err());
        assert!(validate_name("foo/bar", "name").is_err());
        assert!(validate_name(".", "name").is_err());
        assert!(validate_name("..", "name").is_err());
    }

    #[test]
    fn single_dot_rejected() {
        assert!(validate_name(".", "name").is_err());
    }

    #[test]
    fn double_dot_rejected() {
        assert!(validate_name("..", "name").is_err());
    }

    #[test]
    fn names_starting_or_ending_with_dots_or_hyphens_pass() {
        // GitHub permits names like ".hidden" and "repo-" — validate_name only blocks
        // characters outside [a-zA-Z0-9._-], so these must be accepted.
        assert!(validate_name(".hidden", "name").is_ok());
        assert!(validate_name("repo.", "name").is_ok());
        assert!(validate_name("-leading", "name").is_ok());
        assert!(validate_name("trailing-", "name").is_ok());
        assert!(validate_name(".dotfile-", "name").is_ok());
    }

    #[test]
    fn very_long_name_with_valid_chars_passes() {
        let long = "a".repeat(500);
        assert!(validate_name(&long, "name").is_ok());
    }

    #[test]
    fn unicode_characters_rejected() {
        assert!(validate_name("rëpo", "name").is_err());
        assert!(validate_name("名前", "name").is_err());
        assert!(validate_name("repo\u{200B}", "name").is_err()); // zero-width space
    }
}
