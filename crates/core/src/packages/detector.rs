use crate::platforms::all_platforms;
use serde::{Deserialize, Serialize};
use std::path::Path;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DetectedComponents {
    /// Platform IDs this package supports
    pub platforms: Vec<String>,
    /// Skill directory names found
    pub skills: Vec<String>,
    /// MCP server definitions found
    pub mcp_servers: Vec<String>,
    /// Whether instruction files exist (CLAUDE.md, AGENTS.md, etc.)
    pub has_instructions: bool,
    /// Whether the repo has apm.yml for compilation
    pub is_apm: bool,
}

/// Scan a cloned repo directory and detect what agent components it contains.
pub fn detect_components(repo_dir: &Path) -> DetectedComponents {
    let platforms = all_platforms();
    let mut supported: Vec<String> = Vec::new();
    let mut skills: Vec<String> = Vec::new();
    let mut mcp_servers: Vec<String> = Vec::new();
    let mut has_instructions = false;
    let is_apm = repo_dir.join("apm.yml").exists() || repo_dir.join(".apm").is_dir();

    for platform in &platforms {
        let mut matches = false;

        // Check repo markers
        for marker in &platform.repo_markers {
            if repo_dir.join(marker).exists() {
                matches = true;
                break;
            }
        }

        // Check for skills directory
        let skills_path = repo_dir.join(&platform.skills_dir);
        if skills_path.is_dir() {
            matches = true;
            if let Ok(entries) = std::fs::read_dir(&skills_path) {
                for entry in entries.flatten() {
                    if entry.path().is_dir() {
                        let name = entry.file_name().to_string_lossy().to_string();
                        if !skills.contains(&name) {
                            skills.push(name);
                        }
                    }
                }
            }
        }

        // Check for instruction files
        if let Some(ref instr_file) = platform.instructions_file {
            if repo_dir.join(instr_file).exists() {
                matches = true;
                has_instructions = true;
            }
        }

        // Check for MCP config
        if let Some(ref mcp_file) = platform.mcp_config {
            if repo_dir.join(mcp_file).exists() {
                matches = true;
            }
        }

        if matches {
            supported.push(platform.id.clone());
        }
    }

    // Check for root-level skills/ directory (anthropics/skills pattern)
    let root_skills = repo_dir.join("skills");
    if root_skills.is_dir() {
        if let Ok(entries) = std::fs::read_dir(&root_skills) {
            for entry in entries.flatten() {
                if entry.path().is_dir() {
                    let name = entry.file_name().to_string_lossy().to_string();
                    if !skills.contains(&name) {
                        skills.push(name);
                    }
                }
            }
        }
        // Root skills/ is usable by all platforms
        if supported.is_empty() {
            for p in &platforms {
                supported.push(p.id.clone());
            }
        }
    }

    // Check for .claude-plugin directory (marketplace packages)
    if repo_dir.join(".claude-plugin").is_dir() {
        if !supported.contains(&"claude".to_string()) {
            supported.push("claude".to_string());
        }
    }

    // Check for .cursorrules file (single-file cursor config)
    if repo_dir.join(".cursorrules").exists() {
        if !supported.contains(&"cursor".to_string()) {
            supported.push("cursor".to_string());
            has_instructions = true;
        }
    }

    // Scan for MCP server definitions in package.json or standalone configs
    if repo_dir.join("package.json").exists() {
        if let Ok(content) = std::fs::read_to_string(repo_dir.join("package.json")) {
            let lower = content.to_lowercase();
            if lower.contains("mcp") || lower.contains("model-context-protocol") {
                mcp_servers.push("package.json".to_string());
            }
        }
    }

    // Scan for standalone skill files with frontmatter
    if skills.is_empty() && !is_apm {
        if let Ok(entries) = std::fs::read_dir(repo_dir) {
            for entry in entries.flatten() {
                let path = entry.path();
                if path.extension().map_or(false, |e| e == "md") {
                    if let Ok(content) = std::fs::read_to_string(&path) {
                        if content.starts_with("---\n") && content.contains("\nname:") {
                            skills.push(
                                path.file_stem()
                                    .unwrap_or_default()
                                    .to_string_lossy()
                                    .to_string(),
                            );
                            // If we found skill files at root, all platforms could use them
                            if supported.is_empty() {
                                for p in &platforms {
                                    supported.push(p.id.clone());
                                }
                            }
                        }
                    }
                }
            }
        }
    }

    // If APM package, assume all platforms
    if is_apm && supported.is_empty() {
        for p in &platforms {
            supported.push(p.id.clone());
        }
    }

    DetectedComponents {
        platforms: supported,
        skills,
        mcp_servers,
        has_instructions,
        is_apm,
    }
}

/// Quick check via GitHub API tree paths (no clone needed).
/// Returns list of platform IDs the repo likely supports.
pub fn detect_from_paths(paths: &[&str]) -> Vec<String> {
    let platforms = all_platforms();
    let mut supported: Vec<String> = Vec::new();

    for platform in &platforms {
        for marker in &platform.repo_markers {
            if paths.iter().any(|p| p.starts_with(marker.as_str()) || *p == marker.as_str()) {
                if !supported.contains(&platform.id) {
                    supported.push(platform.id.clone());
                }
                break;
            }
        }
    }

    // Check for APM package marker
    if supported.is_empty() {
        let has_apm = paths.iter().any(|p| *p == "apm.yml" || p.starts_with(".apm/"));
        if has_apm {
            for p in &platforms {
                supported.push(p.id.clone());
            }
        }
    }

    supported
}
