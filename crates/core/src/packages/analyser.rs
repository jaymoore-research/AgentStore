use serde::{Deserialize, Serialize};
use std::path::Path;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RepoAnalysis {
    pub summary: String,
    pub skill_count: usize,
    pub skills: Vec<SkillInfo>,
    pub tags: Vec<String>,
    pub has_instructions: bool,
    pub has_mcp: bool,
    pub platforms: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SkillInfo {
    pub name: String,
    pub description: String,
    pub file_path: String,
    pub size_bytes: u64,
    pub has_frontmatter: bool,
}

/// Candidate skill directories, in priority order.
static SKILL_DIRS: &[&str] = &[
    ".claude/skills",
    ".codex/skills",
    ".github/skills",
    ".gemini/skills",
    ".cursor/skills",
    ".opencode/skills",
    ".vscode/skills",
    "skills",
];

/// Scan a cloned repo and produce a `RepoAnalysis`.
pub fn analyse_repo(repo_dir: &Path) -> RepoAnalysis {
    let mut skills: Vec<SkillInfo> = Vec::new();

    for dir_name in SKILL_DIRS {
        let skills_path = repo_dir.join(dir_name);
        if skills_path.is_dir() {
            scan_skills_dir(&skills_path, dir_name, &mut skills);
        }
    }

    let has_instructions = has_instruction_files(repo_dir);
    let has_mcp = has_mcp_config(repo_dir);
    let platforms = detect_platforms(repo_dir);
    let tags = generate_tags(&skills, has_mcp, has_instructions, &platforms);
    let summary = generate_summary(&skills, &tags, &platforms);

    RepoAnalysis {
        summary,
        skill_count: skills.len(),
        skills,
        tags,
        has_instructions,
        has_mcp,
        platforms,
    }
}

// ---------------------------------------------------------------------------
// Scanning helpers
// ---------------------------------------------------------------------------

fn scan_skills_dir(dir: &Path, prefix: &str, out: &mut Vec<SkillInfo>) {
    let entries = match std::fs::read_dir(dir) {
        Ok(e) => e,
        Err(_) => return,
    };

    for entry in entries.flatten() {
        let path = entry.path();
        if !path.is_dir() {
            continue;
        }

        let skill_name = path.file_name().unwrap_or_default().to_string_lossy().to_string();

        // Find the main file: prefer a .md matching the dir name, else first .md, else any file
        let main_file = find_main_file(&path);

        if let Some(file_path) = main_file {
            let size_bytes = std::fs::metadata(&file_path).map(|m| m.len()).unwrap_or(0);
            let content = std::fs::read_to_string(&file_path).unwrap_or_default();
            let (name, description, has_frontmatter) = extract_skill_meta(&content, &skill_name);

            let rel_path = format!("{}/{}/{}", prefix, skill_name, file_path.file_name().unwrap_or_default().to_string_lossy());

            out.push(SkillInfo {
                name,
                description,
                file_path: rel_path,
                size_bytes,
                has_frontmatter,
            });
        } else {
            // Directory exists but no recognisable file — record a stub
            out.push(SkillInfo {
                name: skill_name.clone(),
                description: String::new(),
                file_path: format!("{}/{}", prefix, skill_name),
                size_bytes: 0,
                has_frontmatter: false,
            });
        }
    }
}

fn find_main_file(skill_dir: &Path) -> Option<std::path::PathBuf> {
    let dir_name = skill_dir.file_name()?.to_string_lossy().to_string();

    // 1. <dir>/<dir-name>.md
    let named_md = skill_dir.join(format!("{}.md", dir_name));
    if named_md.exists() {
        return Some(named_md);
    }

    // 2. Any .md file
    if let Ok(entries) = std::fs::read_dir(skill_dir) {
        for e in entries.flatten() {
            let p = e.path();
            if p.extension().map_or(false, |ext| ext == "md") {
                return Some(p);
            }
        }
    }

    // 3. Any file at all
    if let Ok(entries) = std::fs::read_dir(skill_dir) {
        for e in entries.flatten() {
            let p = e.path();
            if p.is_file() {
                return Some(p);
            }
        }
    }

    None
}

// ---------------------------------------------------------------------------
// Frontmatter / content extraction
// ---------------------------------------------------------------------------

/// Parse a skill file and return (name, description, has_frontmatter).
fn extract_skill_meta(content: &str, fallback_name: &str) -> (String, String, bool) {
    if content.starts_with("---\n") || content.starts_with("---\r\n") {
        // Try to find closing ---
        let after_opener = &content[4..];
        if let Some(close_pos) = after_opener.find("\n---") {
            let frontmatter = &after_opener[..close_pos];
            let name = fm_value(frontmatter, "name").unwrap_or_else(|| fallback_name.to_string());
            let description = fm_value(frontmatter, "description").unwrap_or_default();

            // If no description in frontmatter, grab first non-empty content paragraph
            let description = if description.is_empty() {
                let body_start = 4 + close_pos + 4; // skip past closing ---\n
                first_paragraph(&content[body_start.min(content.len())..])
            } else {
                description
            };

            return (name, description, true);
        }
    }

    // No frontmatter — use dir name + first paragraph
    let name = fallback_name.to_string();
    let description = first_paragraph(content);
    (name, description, false)
}

fn fm_value(frontmatter: &str, key: &str) -> Option<String> {
    for line in frontmatter.lines() {
        let trimmed = line.trim();
        if let Some(rest) = trimmed.strip_prefix(&format!("{}:", key)) {
            let val = rest.trim().trim_matches('"').trim_matches('\'').to_string();
            // Skip YAML block scalar indicators (>, >-, |, |-)
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
        // Skip heading lines
        if trimmed.starts_with('#') {
            continue;
        }
        if !para.is_empty() {
            para.push(' ');
        }
        para.push_str(trimmed);
    }
    para
}

// ---------------------------------------------------------------------------
// Platform / component detection helpers
// ---------------------------------------------------------------------------

fn has_instruction_files(repo_dir: &Path) -> bool {
    let files = ["CLAUDE.md", "AGENTS.md", ".cursorrules", "COPILOT.md", "GEMINI.md"];
    files.iter().any(|f| repo_dir.join(f).exists())
}

fn has_mcp_config(repo_dir: &Path) -> bool {
    // Common MCP config locations
    let paths = [
        ".claude/mcp.json",
        ".cursor/mcp.json",
        "mcp.json",
        ".mcp.json",
    ];
    if paths.iter().any(|p| repo_dir.join(p).exists()) {
        return true;
    }
    // Check package.json for mcp keyword
    if let Ok(content) = std::fs::read_to_string(repo_dir.join("package.json")) {
        let lower = content.to_lowercase();
        if lower.contains("\"mcp\"") || lower.contains("model-context-protocol") {
            return true;
        }
    }
    false
}

fn detect_platforms(repo_dir: &Path) -> Vec<String> {
    let mut platforms: Vec<String> = Vec::new();

    if repo_dir.join(".claude").is_dir() || repo_dir.join("CLAUDE.md").exists() {
        platforms.push("Claude Code".to_string());
    }
    if repo_dir.join(".codex").is_dir() || repo_dir.join("AGENTS.md").exists() {
        platforms.push("Codex".to_string());
    }
    if repo_dir.join(".github/copilot").is_dir() || repo_dir.join("COPILOT.md").exists() {
        platforms.push("Copilot".to_string());
    }
    if repo_dir.join(".gemini").is_dir() || repo_dir.join("GEMINI.md").exists() {
        platforms.push("Gemini CLI".to_string());
    }
    if repo_dir.join(".cursor").is_dir() || repo_dir.join(".cursorrules").exists() {
        platforms.push("Cursor".to_string());
    }
    if repo_dir.join(".opencode").is_dir() || repo_dir.join("opencode.json").exists() {
        platforms.push("OpenCode".to_string());
    }
    if repo_dir.join(".vscode").is_dir() {
        platforms.push("VS Code".to_string());
    }

    // Generic: if skills/ root exists and nothing else matched, note it's platform-agnostic
    if platforms.is_empty() && repo_dir.join("skills").is_dir() {
        platforms.push("Claude Code".to_string());
    }

    platforms
}

// ---------------------------------------------------------------------------
// Tag generation
// ---------------------------------------------------------------------------

static TAG_RULES: &[(&str, &str)] = &[
    ("debug", "debugging"),
    ("test", "testing"),
    ("review", "code-review"),
    ("deploy", "deployment"),
    ("design", "design"),
    ("mcp", "mcp-server"),
    ("docker", "docker"),
    ("kubernetes", "kubernetes"),
    ("k8s", "kubernetes"),
    ("ci", "ci-cd"),
    ("pipeline", "ci-cd"),
    ("github", "github"),
    ("git", "git"),
    ("lint", "linting"),
    ("format", "formatting"),
    ("refactor", "refactoring"),
    ("security", "security"),
    ("auth", "authentication"),
    ("api", "api"),
    ("database", "database"),
    ("db", "database"),
    ("sql", "database"),
    ("migrate", "migrations"),
    ("log", "logging"),
    ("monitor", "monitoring"),
    ("perf", "performance"),
    ("profile", "performance"),
    ("bench", "performance"),
    ("doc", "documentation"),
    ("readme", "documentation"),
    ("plan", "planning"),
    ("architect", "architecture"),
    ("scaffold", "scaffolding"),
    ("generate", "code-generation"),
    ("agent", "agents"),
    ("llm", "ai"),
    ("ai", "ai"),
    ("ml", "machine-learning"),
];

fn generate_tags(skills: &[SkillInfo], has_mcp: bool, _has_instructions: bool, _platforms: &[String]) -> Vec<String> {
    let mut tag_set: std::collections::HashSet<String> = std::collections::HashSet::new();

    if has_mcp {
        tag_set.insert("mcp-server".to_string());
    }

    for skill in skills {
        let haystack = format!("{} {}", skill.name.to_lowercase(), skill.description.to_lowercase());
        for (keyword, tag) in TAG_RULES {
            if haystack.contains(keyword) {
                tag_set.insert(tag.to_string());
            }
        }
    }

    let mut tags: Vec<String> = tag_set.into_iter().collect();
    tags.sort();
    tags
}

// ---------------------------------------------------------------------------
// Summary generation
// ---------------------------------------------------------------------------

fn generate_summary(skills: &[SkillInfo], tags: &[String], platforms: &[String]) -> String {
    let count = skills.len();

    // Platform string
    let platform_str = match platforms.len() {
        0 => String::new(),
        1 => format!(" Compatible with {}.", platforms[0]),
        2 => format!(" Compatible with {} and {}.", platforms[0], platforms[1]),
        _ => {
            let (last, rest) = platforms.split_last().unwrap();
            format!(" Compatible with {}, and {}.", rest.join(", "), last)
        }
    };

    if count == 0 {
        return format!("No skills found.{}", platform_str);
    }

    // Tag summary (pick up to 4 most interesting tags)
    let shown_tags: Vec<&str> = tags.iter()
        .filter(|t| *t != "mcp-server") // shown separately if needed
        .take(4)
        .map(|s| s.as_str())
        .collect();

    if count >= 100 {
        // Large collection — truncated listing
        let tag_str = if shown_tags.is_empty() {
            String::new()
        } else {
            format!(" covering {}", shown_tags.join(", "))
        };
        return format!("Large skill collection with {} skills{}.{}", count, tag_str, platform_str);
    }

    match shown_tags.len() {
        0 => format!("{} skill{}{}.", count, if count == 1 { "" } else { "s" }, platform_str),
        1 => format!("{} skill{} covering {}.{}", count, if count == 1 { "" } else { "s" }, shown_tags[0], platform_str),
        2 => format!("{} skills covering {} and {}.{}", count, shown_tags[0], shown_tags[1], platform_str),
        3 => format!("{} skills covering {}, {}, and {}.{}", count, shown_tags[0], shown_tags[1], shown_tags[2], platform_str),
        _ => format!("{} skills covering {}, {}, {}, and {}.{}", count, shown_tags[0], shown_tags[1], shown_tags[2], shown_tags[3], platform_str),
    }
}
