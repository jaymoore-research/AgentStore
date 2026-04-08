use crate::platforms::all_platforms;
use serde::{Deserialize, Serialize};
use std::collections::HashSet;
use std::path::{Path, PathBuf};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DiscoveredSkill {
    /// Skill directory or file name
    pub name: String,
    /// Description extracted from frontmatter or first paragraph
    pub description: String,
    /// Which platform owns this skill directory
    pub platform: String,
    /// Human-readable platform name
    pub platform_name: String,
    /// Absolute path on disk
    pub path: String,
    /// Whether this skill is a symlink (likely managed by AgentStore or similar)
    pub is_symlink: bool,
    /// Symlink target if is_symlink is true
    pub symlink_target: Option<String>,
}

/// Scan all platform skill directories on the user's machine and return
/// every skill found, across both profile (home) scope and an optional
/// project directory.
pub fn scan_installed_skills(project_path: Option<&Path>) -> Vec<DiscoveredSkill> {
    let home = match dirs::home_dir() {
        Some(h) => h,
        None => return Vec::new(),
    };

    let platforms = all_platforms();
    let mut results: Vec<DiscoveredSkill> = Vec::new();
    let mut seen_paths: HashSet<PathBuf> = HashSet::new();

    for platform in &platforms {
        // Scan profile-scope skills (~/.<platform>/skills)
        let profile_skills = home.join(&platform.skills_dir);
        scan_dir(
            &profile_skills,
            platform.id.as_str(),
            platform.name.as_str(),
            &mut results,
            &mut seen_paths,
        );

        // Scan project-scope skills if a project path was given
        if let Some(proj) = project_path {
            let project_skills = proj.join(&platform.skills_dir);
            scan_dir(
                &project_skills,
                platform.id.as_str(),
                platform.name.as_str(),
                &mut results,
                &mut seen_paths,
            );
        }
    }

    // Also check the generic "skills/" directory at profile root (rare but possible)
    let generic_skills = home.join("skills");
    scan_dir(
        &generic_skills,
        "generic",
        "Shared",
        &mut results,
        &mut seen_paths,
    );

    results.sort_by(|a, b| {
        a.platform
            .cmp(&b.platform)
            .then_with(|| a.name.cmp(&b.name))
    });
    results
}

fn scan_dir(
    dir: &Path,
    platform_id: &str,
    platform_name: &str,
    out: &mut Vec<DiscoveredSkill>,
    seen: &mut HashSet<PathBuf>,
) {
    if !dir.is_dir() {
        return;
    }

    let entries = match std::fs::read_dir(dir) {
        Ok(e) => e,
        Err(_) => return,
    };

    for entry in entries.flatten() {
        let path = entry.path();

        // Deduplicate by canonical path
        let canonical = path.canonicalize().unwrap_or_else(|_| path.clone());
        if seen.contains(&canonical) {
            continue;
        }
        seen.insert(canonical);

        let name = entry.file_name().to_string_lossy().to_string();

        // Skip hidden directories
        if name.starts_with('.') {
            continue;
        }

        let is_symlink = path.is_symlink();
        let symlink_target = if is_symlink {
            std::fs::read_link(&path)
                .ok()
                .map(|t| t.to_string_lossy().to_string())
        } else {
            None
        };

        if path.is_dir() {
            // Skill is a directory — look for a main file to extract description
            let description = extract_description_from_dir(&path);

            out.push(DiscoveredSkill {
                name,
                description,
                platform: platform_id.to_string(),
                platform_name: platform_name.to_string(),
                path: path.to_string_lossy().to_string(),
                is_symlink,
                symlink_target,
            });
        } else if path.extension().map_or(false, |e| e == "md") {
            // Standalone skill file
            let content = std::fs::read_to_string(&path).unwrap_or_default();
            let (parsed_name, description) = extract_meta_from_content(&content, &name);

            out.push(DiscoveredSkill {
                name: parsed_name,
                description,
                platform: platform_id.to_string(),
                platform_name: platform_name.to_string(),
                path: path.to_string_lossy().to_string(),
                is_symlink,
                symlink_target,
            });
        }
    }
}

/// Try to find a main file inside a skill directory and extract its description.
fn extract_description_from_dir(skill_dir: &Path) -> String {
    let dir_name = skill_dir
        .file_name()
        .unwrap_or_default()
        .to_string_lossy()
        .to_string();

    // Priority: <name>.md, then any .md, then any file
    let candidates: Vec<PathBuf> = vec![skill_dir.join(format!("{}.md", dir_name))];

    let main_file = candidates.into_iter().find(|p| p.exists()).or_else(|| {
        std::fs::read_dir(skill_dir).ok().and_then(|entries| {
            entries
                .flatten()
                .map(|e| e.path())
                .find(|p| p.extension().map_or(false, |ext| ext == "md"))
        })
    });

    if let Some(file) = main_file {
        if let Ok(content) = std::fs::read_to_string(&file) {
            return extract_meta_from_content(&content, &dir_name).1;
        }
    }

    String::new()
}

/// Extract (name, description) from file content, handling optional YAML frontmatter.
fn extract_meta_from_content(content: &str, fallback_name: &str) -> (String, String) {
    if content.starts_with("---\n") || content.starts_with("---\r\n") {
        let after_opener = &content[4..];
        if let Some(close_pos) = after_opener.find("\n---") {
            let frontmatter = &after_opener[..close_pos];
            let name = fm_value(frontmatter, "name").unwrap_or_else(|| fallback_name.to_string());
            let description = fm_value(frontmatter, "description").unwrap_or_default();

            if !description.is_empty() {
                return (name, description);
            }

            // Fall through to first paragraph from body
            let body_start = 4 + close_pos + 4;
            let body = &content[body_start.min(content.len())..];
            return (name, first_paragraph(body));
        }
    }

    (fallback_name.to_string(), first_paragraph(content))
}

fn fm_value(frontmatter: &str, key: &str) -> Option<String> {
    for line in frontmatter.lines() {
        let trimmed = line.trim();
        if let Some(rest) = trimmed.strip_prefix(&format!("{}:", key)) {
            let val = rest.trim().trim_matches('"').trim_matches('\'').to_string();
            if !val.is_empty() && !matches!(val.as_str(), ">" | ">-" | "|" | "|-") {
                return Some(val);
            }
        }
    }
    None
}

fn first_paragraph(content: &str) -> String {
    let mut para = String::new();
    for line in content.lines() {
        let trimmed = line.trim();
        if trimmed.is_empty() {
            if !para.is_empty() {
                break;
            }
            continue;
        }
        if trimmed.starts_with('#') {
            continue;
        }
        if !para.is_empty() {
            para.push(' ');
        }
        para.push_str(trimmed);
    }
    // Truncate long descriptions
    if para.len() > 300 {
        let cut = &para[..300];
        let last_space = cut.rfind(' ').unwrap_or(300);
        para = format!("{}...", &cut[..last_space]);
    }
    para
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;
    use tempfile::TempDir;

    #[test]
    fn scan_finds_skill_directories() {
        let tmp = TempDir::new().unwrap();
        let skills_dir = tmp.path().join(".claude/skills");
        fs::create_dir_all(&skills_dir).unwrap();

        let skill = skills_dir.join("my-skill");
        fs::create_dir_all(&skill).unwrap();
        fs::write(
            skill.join("my-skill.md"),
            "---\nname: My Skill\ndescription: Does something cool\n---\n# My Skill\n",
        )
        .unwrap();

        let mut results = Vec::new();
        let mut seen = HashSet::new();
        scan_dir(
            &skills_dir,
            "claude",
            "Claude Code",
            &mut results,
            &mut seen,
        );

        assert_eq!(results.len(), 1);
        assert_eq!(results[0].name, "my-skill");
        assert_eq!(results[0].description, "Does something cool");
        assert_eq!(results[0].platform, "claude");
        assert!(!results[0].is_symlink);
    }

    #[test]
    fn scan_detects_symlinks() {
        let tmp = TempDir::new().unwrap();
        let skills_dir = tmp.path().join("skills");
        fs::create_dir_all(&skills_dir).unwrap();

        let real_dir = tmp.path().join("real-skill");
        fs::create_dir_all(&real_dir).unwrap();

        let link = skills_dir.join("linked-skill");
        std::os::unix::fs::symlink(&real_dir, &link).unwrap();

        let mut results = Vec::new();
        let mut seen = HashSet::new();
        scan_dir(
            &skills_dir,
            "claude",
            "Claude Code",
            &mut results,
            &mut seen,
        );

        assert_eq!(results.len(), 1);
        assert!(results[0].is_symlink);
        assert!(results[0].symlink_target.is_some());
    }

    #[test]
    fn extract_meta_with_frontmatter() {
        let content =
            "---\nname: Test Skill\ndescription: A test skill\n---\n# Heading\nBody text\n";
        let (name, desc) = extract_meta_from_content(content, "fallback");
        assert_eq!(name, "Test Skill");
        assert_eq!(desc, "A test skill");
    }

    #[test]
    fn extract_meta_without_frontmatter() {
        let content = "# My Skill\nThis does something useful.\n";
        let (name, desc) = extract_meta_from_content(content, "my-skill");
        assert_eq!(name, "my-skill");
        assert_eq!(desc, "This does something useful.");
    }

    #[test]
    fn hidden_dirs_skipped() {
        let tmp = TempDir::new().unwrap();
        let skills_dir = tmp.path().join("skills");
        fs::create_dir_all(skills_dir.join(".hidden")).unwrap();
        fs::create_dir_all(skills_dir.join("visible")).unwrap();

        let mut results = Vec::new();
        let mut seen = HashSet::new();
        scan_dir(
            &skills_dir,
            "claude",
            "Claude Code",
            &mut results,
            &mut seen,
        );

        assert_eq!(results.len(), 1);
        assert_eq!(results[0].name, "visible");
    }
}
