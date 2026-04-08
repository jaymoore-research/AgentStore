use serde::{Deserialize, Serialize};
use std::path::{Path, PathBuf};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Platform {
    pub id: String,
    pub name: String,
    pub skills_dir: String,
    pub instructions_file: Option<String>,
    pub mcp_config: Option<String>,
    pub settings_file: Option<String>,
    pub repo_markers: Vec<String>,
}

pub fn all_platforms() -> Vec<Platform> {
    vec![
        Platform {
            id: "claude".into(),
            name: "Claude Code".into(),
            skills_dir: ".claude/skills".into(),
            instructions_file: Some("CLAUDE.md".into()),
            mcp_config: Some(".claude/settings.json".into()),
            settings_file: Some(".claude/keybindings.json".into()),
            repo_markers: vec![
                "CLAUDE.md".into(),
                ".claude/skills".into(),
                ".claude".into(),
            ],
        },
        Platform {
            id: "cursor".into(),
            name: "Cursor".into(),
            skills_dir: ".cursor/skills".into(),
            instructions_file: Some(".cursor/rules/agentstore.mdc".into()),
            mcp_config: Some(".cursor/mcp.json".into()),
            settings_file: None,
            repo_markers: vec![
                ".cursor/skills".into(),
                ".cursor/rules".into(),
                ".cursorrules".into(),
            ],
        },
        Platform {
            id: "copilot".into(),
            name: "GitHub Copilot".into(),
            skills_dir: ".github/skills".into(),
            instructions_file: Some(".github/copilot-instructions.md".into()),
            mcp_config: None,
            settings_file: None,
            repo_markers: vec![
                ".github/skills".into(),
                ".github/copilot-instructions.md".into(),
                "AGENTS.md".into(),
            ],
        },
        Platform {
            id: "codex".into(),
            name: "Codex".into(),
            skills_dir: ".codex/skills".into(),
            instructions_file: Some("AGENTS.md".into()),
            mcp_config: None,
            settings_file: Some("codex.json".into()),
            repo_markers: vec![
                "AGENTS.md".into(),
                ".codex".into(),
            ],
        },
        Platform {
            id: "opencode".into(),
            name: "OpenCode".into(),
            skills_dir: ".opencode/skills".into(),
            instructions_file: Some("AGENTS.md".into()),
            mcp_config: Some("opencode.json".into()),
            settings_file: None,
            repo_markers: vec![
                "AGENTS.md".into(),
                ".opencode".into(),
                "opencode.json".into(),
            ],
        },
    ]
}

pub fn get_platform(id: &str) -> Option<Platform> {
    all_platforms().into_iter().find(|p| p.id == id)
}

pub fn resolve_path(platform: &Platform, field: &str, scope_root: &Path) -> Option<PathBuf> {
    let rel = match field {
        "skills_dir" => Some(&platform.skills_dir),
        "instructions_file" => platform.instructions_file.as_ref(),
        "mcp_config" => platform.mcp_config.as_ref(),
        "settings_file" => platform.settings_file.as_ref(),
        _ => None,
    };
    rel.map(|r| scope_root.join(r))
}
