# AgentStore Lite Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Create a new repo `agentstore-lite` with a shared Rust core library, a CLI binary, and a stripped Tauri GUI: no server, no registry, no telemetry, no auto-updates.

**Architecture:** Cargo workspace with three crates (`core`, `cli`, `gui`). Core contains all business logic extracted from the current `src-tauri/src/` modules with Tauri types removed. CLI wraps core with `clap`. GUI wraps core with thin `#[tauri::command]` handlers. Stripped React frontend in `frontend/`.

**Tech Stack:** Rust (core + CLI + Tauri), clap 4, React 19, Vite, TypeScript

---

### Task 1: Scaffold the workspace and core crate

**Files:**
- Create: `agentstore-lite/Cargo.toml`
- Create: `agentstore-lite/crates/core/Cargo.toml`
- Create: `agentstore-lite/crates/core/src/lib.rs`
- Create: `agentstore-lite/crates/core/src/error.rs`

- [ ] **Step 1: Create the workspace root Cargo.toml**

```bash
mkdir -p /Users/jaymoore/Documents/projects/agentstore-lite
```

Write `agentstore-lite/Cargo.toml`:

```toml
[workspace]
members = [
    "crates/core",
    "crates/cli",
    "crates/gui",
]
resolver = "2"

[workspace.package]
version = "0.1.0"
edition = "2021"
license = "MIT"
authors = ["Jay Moore"]

[workspace.dependencies]
serde = { version = "1.0", features = ["derive"] }
serde_json = "1.0"
anyhow = "1"
thiserror = "2"
```

- [ ] **Step 2: Create the core crate Cargo.toml**

```bash
mkdir -p /Users/jaymoore/Documents/projects/agentstore-lite/crates/core/src
```

Write `crates/core/Cargo.toml`:

```toml
[package]
name = "agentstore-core"
version.workspace = true
edition.workspace = true
license.workspace = true

[dependencies]
serde = { workspace = true }
serde_json = { workspace = true }
anyhow = { workspace = true }
thiserror = { workspace = true }
regex = "1"
dirs = "6"
chrono = { version = "0.4", features = ["serde"] }
log = "0.4"

[target.'cfg(windows)'.dependencies]
junction = "1"

[dev-dependencies]
tempfile = "3"
```

- [ ] **Step 3: Create the error type**

Write `crates/core/src/error.rs`:

```rust
use thiserror::Error;

#[derive(Debug, Error)]
pub enum CoreError {
    #[error("{0}")]
    Io(#[from] std::io::Error),

    #[error("{0}")]
    Json(#[from] serde_json::Error),

    #[error("{0}")]
    Other(#[from] anyhow::Error),

    #[error("Validation failed: {0}")]
    Validation(String),

    #[error("Package not found: {0}")]
    NotFound(String),
}
```

- [ ] **Step 4: Create the core lib.rs**

Write `crates/core/src/lib.rs`:

```rust
pub mod error;
pub mod packages;
pub mod platforms;
pub mod storage;

pub use error::CoreError;
```

- [ ] **Step 5: Verify workspace compiles (will fail until modules exist, just check Cargo.toml is valid)**

```bash
cd /Users/jaymoore/Documents/projects/agentstore-lite && cargo check 2>&1 | head -5
```

Expected: errors about missing modules (not Cargo.toml parse errors)

- [ ] **Step 6: Commit**

```bash
cd /Users/jaymoore/Documents/projects/agentstore-lite
git init
git add Cargo.toml crates/core/
git commit -m "feat: scaffold workspace and core crate"
```

---

### Task 2: Extract platforms module into core

**Files:**
- Create: `crates/core/src/platforms.rs`
- Test: existing tests are in-code

The platforms module has zero Tauri dependencies. Copy it verbatim.

- [ ] **Step 1: Write the platforms module**

Write `crates/core/src/platforms.rs` with the exact content from `AgentStore/src-tauri/src/platforms/mod.rs`:

```rust
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
```

- [ ] **Step 2: Verify it compiles**

```bash
cd /Users/jaymoore/Documents/projects/agentstore-lite && cargo check -p agentstore-core
```

Expected: success (or only errors from missing sibling modules)

- [ ] **Step 3: Commit**

```bash
cd /Users/jaymoore/Documents/projects/agentstore-lite
git add crates/core/src/platforms.rs
git commit -m "feat: add platforms module to core"
```

---

### Task 3: Extract storage module into core

**Files:**
- Create: `crates/core/src/storage.rs`

Remove Tauri `State` wrappers. The storage commands (`get_config`, `set_config`, etc.) become plain functions. Cache is kept but stripped of search/readme/verification tables (those were for the GitHub service). Keep search_history and favourites.

- [ ] **Step 1: Write the storage module**

Write `crates/core/src/storage.rs`:

```rust
use anyhow::Result;
use serde::{Deserialize, Serialize};
use std::fs;
use std::path::PathBuf;

#[derive(Debug, Clone)]
pub struct AppPaths {
    pub base_dir: PathBuf,
    pub cache_dir: PathBuf,
    pub packages_dir: PathBuf,
    pub config_path: PathBuf,
}

impl AppPaths {
    pub fn init() -> Result<Self> {
        let base_dir = dirs::data_dir()
            .ok_or_else(|| anyhow::anyhow!("Cannot determine application data directory"))?
            .join("AgentStore");

        let paths = Self {
            cache_dir: base_dir.join("cache"),
            packages_dir: base_dir.join("packages"),
            config_path: base_dir.join("config.json"),
            base_dir,
        };

        fs::create_dir_all(&paths.cache_dir)?;
        fs::create_dir_all(&paths.packages_dir)?;

        if !paths.config_path.exists() {
            let default_config = AppConfig::default();
            let json = serde_json::to_string_pretty(&default_config)?;
            fs::write(&paths.config_path, json)?;
        }

        Ok(paths)
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AppConfig {
    pub github_token: Option<String>,
    pub first_run: bool,
}

impl Default for AppConfig {
    fn default() -> Self {
        Self {
            github_token: None,
            first_run: true,
        }
    }
}

pub fn read_config(paths: &AppPaths) -> Result<AppConfig> {
    let data = fs::read_to_string(&paths.config_path)?;
    let mut config: AppConfig = serde_json::from_str(&data)?;

    if let Ok(token) = std::env::var("GITHUB_TOKEN") {
        if !token.is_empty() {
            config.github_token = Some(token);
        }
    }

    Ok(config)
}

pub fn write_config(paths: &AppPaths, config: &AppConfig) -> Result<()> {
    let json = serde_json::to_string_pretty(config)?;
    fs::write(&paths.config_path, json)?;
    Ok(())
}
```

- [ ] **Step 2: Verify it compiles**

```bash
cd /Users/jaymoore/Documents/projects/agentstore-lite && cargo check -p agentstore-core
```

Expected: success (or only errors from missing packages module)

- [ ] **Step 3: Commit**

```bash
cd /Users/jaymoore/Documents/projects/agentstore-lite
git add crates/core/src/storage.rs
git commit -m "feat: add storage module to core"
```

---

### Task 4: Extract packages module into core

**Files:**
- Create: `crates/core/src/packages/mod.rs`
- Create: `crates/core/src/packages/symlinker.rs`
- Create: `crates/core/src/packages/injector.rs`
- Create: `crates/core/src/packages/detector.rs`
- Create: `crates/core/src/packages/scanner.rs`
- Create: `crates/core/src/packages/analyser.rs`

This is the biggest task. The key refactor: replace `AppHandle`/`State<AppPaths>` with plain `&AppPaths` and a progress callback.

- [ ] **Step 1: Create the packages directory**

```bash
mkdir -p /Users/jaymoore/Documents/projects/agentstore-lite/crates/core/src/packages
```

- [ ] **Step 2: Write symlinker.rs**

Copy from `AgentStore/src-tauri/src/packages/symlinker.rs` verbatim. It has no Tauri dependencies. The only import to change is the crate path for `get_platform`/`resolve_path`.

Write `crates/core/src/packages/symlinker.rs`:

```rust
use anyhow::Result;
use serde::{Deserialize, Serialize};
use std::fs;
use std::path::{Path, PathBuf};

use crate::platforms::{get_platform, resolve_path};

fn create_symlink(source: &Path, target: &Path) -> std::io::Result<()> {
    #[cfg(unix)]
    {
        std::os::unix::fs::symlink(source, target)
    }
    #[cfg(windows)]
    {
        if source.is_dir() {
            match std::os::windows::fs::symlink_dir(source, target) {
                Ok(()) => Ok(()),
                Err(_) => junction::create(source, target),
            }
        } else {
            std::os::windows::fs::symlink_file(source, target)
        }
    }
}

fn remove_symlink(path: &Path) -> std::io::Result<()> {
    #[cfg(unix)]
    {
        fs::remove_file(path)
    }
    #[cfg(windows)]
    {
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
    pub component: String,
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

pub fn enable_platform(
    package_name: &str,
    package_dir: &Path,
    platform_id: &str,
    scope: &str,
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

    // Cross-platform: link skills from alt directories
    let alt_skills_dirs = [".claude/skills", ".github/skills", ".cursor/skills"];
    for alt in &alt_skills_dirs {
        let alt_path = package_dir.join(alt);
        if alt_path.is_dir() && *alt != platform.skills_dir {
            let target_dir = resolve_path(&platform, "skills_dir", &scope_root).unwrap();
            fs::create_dir_all(&target_dir)?;

            for entry in fs::read_dir(&alt_path)?.flatten() {
                if entry.path().is_dir() {
                    let skill_name = entry.file_name();
                    let target = target_dir.join(&skill_name);

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

#[cfg(test)]
mod tests {
    use super::*;
    use tempfile::TempDir;

    #[test]
    fn disable_removes_symlinks() {
        let tmp = TempDir::new().unwrap();
        let state_path = tmp.path().join("state.json");
        let target = tmp.path().join("target-link");

        let source = tmp.path().join("source");
        fs::create_dir_all(&source).unwrap();
        create_symlink(&source, &target).unwrap();

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
```

- [ ] **Step 3: Write injector.rs**

Copy from `AgentStore/src-tauri/src/packages/injector.rs` verbatim. No Tauri dependencies.

Write `crates/core/src/packages/injector.rs`:

```rust
use anyhow::Result;
use std::fs;
use std::path::Path;

const BEGIN_MARKER: &str = "<!-- agentstore:begin";
const END_MARKER: &str = "<!-- agentstore:end";

pub fn inject_instructions(
    target_file: &Path,
    package_name: &str,
    content: &str,
) -> Result<()> {
    let existing = if target_file.exists() {
        fs::read_to_string(target_file)?
    } else {
        String::new()
    };

    let block_start = format!("{} {} -->", BEGIN_MARKER, package_name);
    let block_end = format!("{} {} -->", END_MARKER, package_name);
    let new_block = format!("{}\n{}\n{}", block_start, content.trim(), block_end);

    if existing.contains(&block_start) {
        let before = existing.split(&block_start).next().unwrap_or("");
        let after = existing
            .split(&block_end)
            .nth(1)
            .map(|s| s.trim_start_matches('\n'))
            .unwrap_or("");
        let result = format!("{}{}\n{}", before, new_block, after);
        fs::write(target_file, result.trim())?;
    } else {
        let result = if existing.is_empty() {
            new_block
        } else {
            format!("{}\n\n{}", existing.trim(), new_block)
        };
        if let Some(parent) = target_file.parent() {
            fs::create_dir_all(parent)?;
        }
        fs::write(target_file, result)?;
    }

    Ok(())
}

pub fn remove_instructions(target_file: &Path, package_name: &str) -> Result<()> {
    if !target_file.exists() {
        return Ok(());
    }

    let content = fs::read_to_string(target_file)?;
    let block_start = format!("{} {} -->", BEGIN_MARKER, package_name);
    let block_end = format!("{} {} -->", END_MARKER, package_name);

    if !content.contains(&block_start) {
        return Ok(());
    }

    let before = content.split(&block_start).next().unwrap_or("");
    let after = content
        .split(&block_end)
        .nth(1)
        .map(|s| s.trim_start_matches('\n'))
        .unwrap_or("");

    let result = format!(
        "{}{}",
        before.trim_end(),
        if after.is_empty() { "" } else { "\n\n" }
    )
    .to_string()
        + after;
    let trimmed = result.trim().to_string();

    if trimmed.is_empty() {
        fs::remove_file(target_file)?;
    } else {
        fs::write(target_file, trimmed)?;
    }

    Ok(())
}

pub fn inject_mcp_server(
    config_file: &Path,
    package_name: &str,
    server_name: &str,
    server_config: &serde_json::Value,
) -> Result<()> {
    let mut config: serde_json::Value = if config_file.exists() {
        let content = fs::read_to_string(config_file)?;
        serde_json::from_str(&content).unwrap_or(serde_json::json!({}))
    } else {
        serde_json::json!({})
    };

    let servers = config
        .as_object_mut()
        .ok_or_else(|| anyhow::anyhow!("Config is not a JSON object"))?
        .entry("mcpServers")
        .or_insert(serde_json::json!({}));

    let mut entry = server_config.clone();
    entry["_agentstore"] = serde_json::json!(package_name);

    servers[server_name] = entry;

    if let Some(parent) = config_file.parent() {
        fs::create_dir_all(parent)?;
    }
    fs::write(config_file, serde_json::to_string_pretty(&config)?)?;

    Ok(())
}

pub fn remove_mcp_server(config_file: &Path, package_name: &str) -> Result<()> {
    if !config_file.exists() {
        return Ok(());
    }

    let content = fs::read_to_string(config_file)?;
    let mut config: serde_json::Value = serde_json::from_str(&content)?;

    if let Some(servers) = config.get_mut("mcpServers").and_then(|s| s.as_object_mut()) {
        let keys_to_remove: Vec<String> = servers
            .iter()
            .filter(|(_, v)| v.get("_agentstore").and_then(|a| a.as_str()) == Some(package_name))
            .map(|(k, _)| k.clone())
            .collect();

        for key in keys_to_remove {
            servers.remove(&key);
        }
    }

    fs::write(config_file, serde_json::to_string_pretty(&config)?)?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use tempfile::TempDir;

    #[test]
    fn inject_into_empty_file() {
        let tmp = TempDir::new().unwrap();
        let target = tmp.path().join("CLAUDE.md");

        inject_instructions(&target, "my-pkg", "Do the thing.").unwrap();

        let content = fs::read_to_string(&target).unwrap();
        assert!(content.contains("<!-- agentstore:begin my-pkg -->"));
        assert!(content.contains("Do the thing."));
        assert!(content.contains("<!-- agentstore:end my-pkg -->"));
    }

    #[test]
    fn inject_replaces_existing_block() {
        let tmp = TempDir::new().unwrap();
        let target = tmp.path().join("CLAUDE.md");

        inject_instructions(&target, "my-pkg", "Version 1.").unwrap();
        inject_instructions(&target, "my-pkg", "Version 2.").unwrap();

        let content = fs::read_to_string(&target).unwrap();
        assert!(!content.contains("Version 1."));
        assert!(content.contains("Version 2."));
        assert_eq!(
            content
                .matches("<!-- agentstore:begin my-pkg -->")
                .count(),
            1
        );
    }

    #[test]
    fn remove_block_from_file() {
        let tmp = TempDir::new().unwrap();
        let target = tmp.path().join("CLAUDE.md");

        inject_instructions(&target, "my-pkg", "Should be removed.").unwrap();
        remove_instructions(&target, "my-pkg").unwrap();

        assert!(!target.exists());
    }

    #[test]
    fn remove_from_nonexistent_file_is_ok() {
        let tmp = TempDir::new().unwrap();
        let target = tmp.path().join("does-not-exist.md");

        let result = remove_instructions(&target, "my-pkg");
        assert!(result.is_ok());
    }
}
```

- [ ] **Step 4: Write detector.rs**

Copy from `AgentStore/src-tauri/src/packages/detector.rs`. Change `crate::platforms` import.

Write `crates/core/src/packages/detector.rs`:

```rust
use crate::platforms::all_platforms;
use serde::{Deserialize, Serialize};
use std::path::Path;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DetectedComponents {
    pub platforms: Vec<String>,
    pub skills: Vec<String>,
    pub mcp_servers: Vec<String>,
    pub has_instructions: bool,
    pub is_apm: bool,
}

pub fn detect_components(repo_dir: &Path) -> DetectedComponents {
    let platforms = all_platforms();
    let mut supported: Vec<String> = Vec::new();
    let mut skills: Vec<String> = Vec::new();
    let mut mcp_servers: Vec<String> = Vec::new();
    let mut has_instructions = false;
    let is_apm = repo_dir.join("apm.yml").exists() || repo_dir.join(".apm").is_dir();

    for platform in &platforms {
        let mut matches = false;

        for marker in &platform.repo_markers {
            if repo_dir.join(marker).exists() {
                matches = true;
                break;
            }
        }

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

        if let Some(ref instr_file) = platform.instructions_file {
            if repo_dir.join(instr_file).exists() {
                matches = true;
                has_instructions = true;
            }
        }

        if let Some(ref mcp_file) = platform.mcp_config {
            if repo_dir.join(mcp_file).exists() {
                matches = true;
            }
        }

        if matches {
            supported.push(platform.id.clone());
        }
    }

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
        if supported.is_empty() {
            for p in &platforms {
                supported.push(p.id.clone());
            }
        }
    }

    if repo_dir.join(".claude-plugin").is_dir() {
        if !supported.contains(&"claude".to_string()) {
            supported.push("claude".to_string());
        }
    }

    if repo_dir.join(".cursorrules").exists() {
        if !supported.contains(&"cursor".to_string()) {
            supported.push("cursor".to_string());
            has_instructions = true;
        }
    }

    if repo_dir.join("package.json").exists() {
        if let Ok(content) = std::fs::read_to_string(repo_dir.join("package.json")) {
            let lower = content.to_lowercase();
            if lower.contains("mcp") || lower.contains("model-context-protocol") {
                mcp_servers.push("package.json".to_string());
            }
        }
    }

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
```

- [ ] **Step 5: Write scanner.rs**

Copy from `AgentStore/src-tauri/src/packages/scanner.rs`. Change `crate::platforms` import.

Write `crates/core/src/packages/scanner.rs` with the full content from the original file, replacing `use crate::platforms::all_platforms;` (already correct as a crate-relative path within the core crate).

The file is identical to the original `scanner.rs` (lines 1-345 from the source). No Tauri types to remove.

- [ ] **Step 6: Write analyser.rs**

Copy from `AgentStore/src-tauri/src/packages/analyser.rs` verbatim. No Tauri dependencies.

Write `crates/core/src/packages/analyser.rs` with the full content from the original file (lines 1-378). No changes needed.

- [ ] **Step 7: Write packages/mod.rs with refactored core functions**

This is where the Tauri decoupling happens. Replace `AppHandle`/`State<AppPaths>` with plain references and a progress callback.

Write `crates/core/src/packages/mod.rs`:

```rust
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
    pub scope: String,
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

fn validate_name(value: &str, label: &str) -> Result<()> {
    let re = Regex::new(r"^[a-zA-Z0-9._-]+$").unwrap();
    if value.is_empty() || !re.is_match(value) || value == "." || value == ".." {
        anyhow::bail!(
            "Invalid {}: '{}'. Only alphanumeric, dot, hyphen, and underscore are allowed.",
            label,
            value
        );
    }
    Ok(())
}

fn clone_repo(repo_url: &str, dest: &Path) -> Result<()> {
    let status = Command::new("git")
        .args(["clone", "--depth", "1", repo_url])
        .arg(dest)
        .status()?;

    if !status.success() {
        anyhow::bail!("git clone failed for {}", repo_url);
    }
    Ok(())
}

/// Install a package. Progress is reported via the `on_progress` callback:
/// `on_progress(step_name, detail_message, progress_fraction_0_to_1)`.
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

    on_progress("Cloning", &format!("Cloning {}/{}...", owner, name), 0.2);
    let repo_url = format!("https://github.com/{}/{}.git", owner, name);
    let temp_dir = paths.packages_dir.join(format!(".tmp-{}", name));
    if temp_dir.exists() {
        fs::remove_dir_all(&temp_dir)?;
    }
    fs::create_dir_all(&temp_dir)?;
    let repo_dir = temp_dir.join("repo");
    if let Err(e) = clone_repo(&repo_url, &repo_dir) {
        let _ = fs::remove_dir_all(&temp_dir);
        return Err(e);
    }

    if package_dir.exists() {
        fs::remove_dir_all(&package_dir)?;
    }
    fs::rename(&temp_dir, &package_dir)?;
    let repo_dir = package_dir.join("repo");

    on_progress("Detecting", "Scanning for agent components...", 0.4);
    let detected = detector::detect_components(&repo_dir);

    if detected.platforms.is_empty() && detected.skills.is_empty() && !detected.is_apm {
        let _ = fs::remove_dir_all(&package_dir);
        anyhow::bail!("This repo doesn't contain agent package components (no skills, instructions, or MCP configs found).");
    }

    if detected.is_apm {
        on_progress("Compiling", "Compiling agent package...", 0.5);
        let _ = std::process::Command::new("apm")
            .args(["compile", "--target", "all"])
            .current_dir(&repo_dir)
            .status();
    }

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
                            project_path: project_path.map(String::from),
                        },
                    );
                }
                Err(e) => {
                    log::warn!("Failed to enable {} for {}: {}", platform_id, name, e);
                }
            }

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

    on_progress("Finalising", "Writing manifest...", 0.9);
    let manifest = PackageManifest {
        name: name.to_string(),
        repo: format!("{}/{}", owner, name),
        description: description.map(String::from),
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

pub fn uninstall_package(paths: &AppPaths, name: &str) -> Result<()> {
    validate_name(name, "name")?;
    let package_dir = paths.packages_dir.join(name);
    let state_path = paths.packages_dir.join("state.json");

    symlinker::disable_all(name, &state_path)?;

    for platform in platforms::all_platforms() {
        if let Some(ref instr_file) = platform.instructions_file {
            let home = dirs::home_dir()
                .ok_or_else(|| anyhow::anyhow!("Cannot determine home directory"))?;
            let target = home.join(instr_file);
            let _ = injector::remove_instructions(&target, name);
        }
    }

    if package_dir.exists() {
        fs::remove_dir_all(&package_dir)?;
    }

    Ok(())
}

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
                project_path: project_path.map(String::from),
            },
        );

        if let Some(platform) = platforms::get_platform(platform_id) {
            if let Some(ref instr_file) = platform.instructions_file {
                let source = repo_dir.join(instr_file);
                if source.exists() {
                    let scope_root = if scope == "profile" {
                        dirs::home_dir()
                            .ok_or_else(|| anyhow::anyhow!("Cannot determine home directory"))?
                    } else {
                        proj_path
                            .ok_or_else(|| anyhow::anyhow!("Project path required"))?
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

        if let Some(platform) = platforms::get_platform(platform_id) {
            if let Some(ref instr_file) = platform.instructions_file {
                let home = dirs::home_dir()
                    .ok_or_else(|| anyhow::anyhow!("Cannot determine home directory"))?;
                let target = home.join(instr_file);
                let _ = injector::remove_instructions(&target, name);
            }
        }
    }

    let json = serde_json::to_string_pretty(&manifest)?;
    fs::write(&manifest_path, json)?;

    Ok(())
}

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

    let data = fs::read_to_string(&manifest_path)?;
    let old_manifest: PackageManifest = serde_json::from_str(&data)?;

    let state_path = paths.packages_dir.join("state.json");
    symlinker::disable_all(name, &state_path)?;

    let repo_dir = package_dir.join("repo");
    if repo_dir.exists() {
        fs::remove_dir_all(&repo_dir)?;
    }

    on_progress("Updating", &format!("Pulling latest {}...", name), 0.3);
    let repo_url = format!("https://github.com/{}.git", old_manifest.repo);
    clone_repo(&repo_url, &repo_dir)?;

    on_progress("Detecting", "Scanning for changes...", 0.5);
    let detected = detector::detect_components(&repo_dir);

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

pub fn get_package_info(paths: &AppPaths, name: &str) -> Result<PackageManifest> {
    validate_name(name, "name")?;

    let manifest_path = paths.packages_dir.join(name).join("manifest.json");
    if !manifest_path.exists() {
        anyhow::bail!("Package not found");
    }

    let data = fs::read_to_string(&manifest_path)?;
    Ok(serde_json::from_str(&data)?)
}

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
    }

    #[test]
    fn path_traversal_rejected() {
        assert!(validate_name("../etc", "name").is_err());
        assert!(validate_name("foo/../bar", "name").is_err());
        assert!(validate_name("", "name").is_err());
        assert!(validate_name("foo bar", "name").is_err());
        assert!(validate_name(".", "name").is_err());
        assert!(validate_name("..", "name").is_err());
    }
}
```

- [ ] **Step 8: Run tests**

```bash
cd /Users/jaymoore/Documents/projects/agentstore-lite && cargo test -p agentstore-core
```

Expected: all tests pass

- [ ] **Step 9: Commit**

```bash
cd /Users/jaymoore/Documents/projects/agentstore-lite
git add crates/core/src/packages/
git commit -m "feat: extract packages module into core with Tauri decoupled"
```

---

### Task 5: Create the CLI crate

**Files:**
- Create: `crates/cli/Cargo.toml`
- Create: `crates/cli/src/main.rs`

- [ ] **Step 1: Create the CLI Cargo.toml**

```bash
mkdir -p /Users/jaymoore/Documents/projects/agentstore-lite/crates/cli/src
```

Write `crates/cli/Cargo.toml`:

```toml
[package]
name = "agentstore-cli"
version.workspace = true
edition.workspace = true
license.workspace = true

[[bin]]
name = "agentstore"
path = "src/main.rs"

[dependencies]
agentstore-core = { path = "../core" }
clap = { version = "4", features = ["derive"] }
serde_json = { workspace = true }
anyhow = { workspace = true }
env_logger = "0.11"
```

- [ ] **Step 2: Write the CLI main.rs**

Write `crates/cli/src/main.rs`:

```rust
use agentstore_core::packages;
use agentstore_core::packages::scanner;
use agentstore_core::platforms;
use agentstore_core::storage::{self, AppPaths};
use clap::{Parser, Subcommand};

#[derive(Parser)]
#[command(name = "agentstore", about = "AI agent skill package manager")]
struct Cli {
    #[command(subcommand)]
    command: Commands,

    /// Output as JSON
    #[arg(long, global = true)]
    json: bool,
}

#[derive(Subcommand)]
enum Commands {
    /// Install a package from GitHub (owner/repo)
    Install {
        /// GitHub repository (owner/repo)
        repo: String,
        /// Platforms to enable (comma-separated: claude,cursor,copilot,codex,opencode)
        #[arg(long, value_delimiter = ',')]
        platform: Option<Vec<String>>,
        /// Scope: global or project
        #[arg(long, default_value = "profile")]
        scope: String,
        /// Project path (required for project scope)
        #[arg(long)]
        project: Option<String>,
    },
    /// Uninstall a package
    Uninstall {
        /// Package name
        name: String,
    },
    /// List installed packages
    List {
        /// Filter by platform
        #[arg(long)]
        platform: Option<String>,
    },
    /// Update an installed package
    Update {
        /// Package name
        name: String,
    },
    /// Scan for locally installed skills
    Scan {
        /// Project path to scan
        #[arg(long)]
        project: Option<String>,
    },
    /// Show detected platforms
    Platforms,
    /// Manage configuration
    Config {
        #[command(subcommand)]
        action: ConfigAction,
    },
}

#[derive(Subcommand)]
enum ConfigAction {
    /// Set a config value
    Set {
        key: String,
        value: String,
    },
    /// Get a config value
    Get {
        key: String,
    },
}

fn main() -> anyhow::Result<()> {
    env_logger::init();
    let cli = Cli::parse();
    let paths = AppPaths::init()?;

    match cli.command {
        Commands::Install {
            repo,
            platform,
            scope,
            project,
        } => {
            let parts: Vec<&str> = repo.splitn(2, '/').collect();
            if parts.len() != 2 {
                anyhow::bail!("Invalid repo format. Use owner/repo");
            }
            let (owner, name) = (parts[0], parts[1]);

            let enable_platforms = platform.unwrap_or_else(|| {
                // Auto-detect: enable all platforms that have their directory present
                platforms::all_platforms()
                    .into_iter()
                    .filter(|p| {
                        let home = dirs::home_dir().unwrap_or_default();
                        let config = dirs::config_dir().unwrap_or_else(|| home.join(".config"));
                        let path = match p.id.as_str() {
                            "claude" => home.join(".claude"),
                            "cursor" => home.join(".cursor"),
                            "copilot" => config.join("github-copilot"),
                            "codex" => home.join(".codex"),
                            "opencode" => config.join("opencode"),
                            _ => return false,
                        };
                        path.exists()
                    })
                    .map(|p| p.id)
                    .collect()
            });

            if enable_platforms.is_empty() {
                eprintln!("Warning: no supported platforms detected. Install will proceed but no symlinks will be created.");
                eprintln!("Use --platform to specify platforms manually.");
            }

            let manifest = packages::install_package(
                &paths,
                owner,
                name,
                None,
                0,
                &enable_platforms,
                &scope,
                project.as_deref(),
                |step, detail, _progress| {
                    eprintln!("[{}] {}", step, detail);
                },
            )?;

            if cli.json {
                println!("{}", serde_json::to_string_pretty(&manifest)?);
            } else {
                println!("Installed {} ({} platforms enabled)", manifest.name, manifest.enabled.len());
                for (pid, _) in &manifest.enabled {
                    println!("  - {}", pid);
                }
            }
        }

        Commands::Uninstall { name } => {
            packages::uninstall_package(&paths, &name)?;
            if cli.json {
                println!(r#"{{"uninstalled": "{}"}}"#, name);
            } else {
                println!("Uninstalled {}", name);
            }
        }

        Commands::List { platform } => {
            let mut pkgs = packages::list_packages(&paths)?;

            if let Some(ref pid) = platform {
                pkgs.retain(|p| p.enabled.contains_key(pid));
            }

            if cli.json {
                println!("{}", serde_json::to_string_pretty(&pkgs)?);
            } else if pkgs.is_empty() {
                println!("No packages installed.");
            } else {
                for pkg in &pkgs {
                    let platforms: Vec<&str> = pkg.enabled.keys().map(|s| s.as_str()).collect();
                    println!(
                        "  {} ({}) [{}]",
                        pkg.name,
                        pkg.repo,
                        platforms.join(", ")
                    );
                }
            }
        }

        Commands::Update { name } => {
            let manifest = packages::update_package(&paths, &name, |step, detail, _| {
                eprintln!("[{}] {}", step, detail);
            })?;

            if cli.json {
                println!("{}", serde_json::to_string_pretty(&manifest)?);
            } else {
                println!("Updated {}", manifest.name);
            }
        }

        Commands::Scan { project } => {
            let proj = project.as_ref().map(|p| std::path::PathBuf::from(p));
            let skills = scanner::scan_installed_skills(proj.as_deref());

            if cli.json {
                println!("{}", serde_json::to_string_pretty(&skills)?);
            } else if skills.is_empty() {
                println!("No skills found.");
            } else {
                for skill in &skills {
                    let sym = if skill.is_symlink { " (symlink)" } else { "" };
                    println!(
                        "  [{}] {}{} - {}",
                        skill.platform, skill.name, sym, skill.description
                    );
                }
            }
        }

        Commands::Platforms => {
            let home = dirs::home_dir().unwrap_or_default();
            let config = dirs::config_dir().unwrap_or_else(|| home.join(".config"));

            let detected: Vec<_> = platforms::all_platforms()
                .into_iter()
                .map(|p| {
                    let path = match p.id.as_str() {
                        "claude" => home.join(".claude"),
                        "cursor" => home.join(".cursor"),
                        "copilot" => config.join("github-copilot"),
                        "codex" => home.join(".codex"),
                        "opencode" => config.join("opencode"),
                        _ => home.join("nonexistent"),
                    };
                    let present = path.exists();
                    (p.id, p.name, present)
                })
                .collect();

            if cli.json {
                let json: Vec<serde_json::Value> = detected
                    .iter()
                    .map(|(id, name, present)| {
                        serde_json::json!({"id": id, "name": name, "detected": present})
                    })
                    .collect();
                println!("{}", serde_json::to_string_pretty(&json)?);
            } else {
                for (id, name, present) in &detected {
                    let status = if *present { "detected" } else { "not found" };
                    println!("  {} ({}) - {}", name, id, status);
                }
            }
        }

        Commands::Config { action } => {
            match action {
                ConfigAction::Set { key, value } => {
                    let mut config = storage::read_config(&paths)?;
                    match key.as_str() {
                        "github_token" => config.github_token = Some(value),
                        _ => anyhow::bail!("Unknown config key: {}", key),
                    }
                    storage::write_config(&paths, &config)?;
                    if !cli.json {
                        println!("Set {}", key);
                    }
                }
                ConfigAction::Get { key } => {
                    let config = storage::read_config(&paths)?;
                    let value = match key.as_str() {
                        "github_token" => config
                            .github_token
                            .as_deref()
                            .unwrap_or("<not set>")
                            .to_string(),
                        _ => anyhow::bail!("Unknown config key: {}", key),
                    };
                    if cli.json {
                        println!(r#"{{"{}": "{}"}}"#, key, value);
                    } else {
                        println!("{}: {}", key, value);
                    }
                }
            }
        }
    }

    Ok(())
}
```

- [ ] **Step 3: Verify it compiles**

```bash
cd /Users/jaymoore/Documents/projects/agentstore-lite && cargo build -p agentstore-cli
```

Expected: successful build

- [ ] **Step 4: Test basic commands**

```bash
cd /Users/jaymoore/Documents/projects/agentstore-lite && cargo run -p agentstore-cli -- --help
```

Expected: help output showing all subcommands

```bash
cargo run -p agentstore-cli -- platforms
```

Expected: list of platforms with detected/not found status

- [ ] **Step 5: Commit**

```bash
cd /Users/jaymoore/Documents/projects/agentstore-lite
git add crates/cli/
git commit -m "feat: add CLI binary with clap"
```

---

### Task 6: Create the GUI crate (Tauri shell)

**Files:**
- Create: `crates/gui/Cargo.toml`
- Create: `crates/gui/src/main.rs`
- Create: `crates/gui/src/lib.rs`
- Create: `crates/gui/src/build.rs`
- Create: `crates/gui/tauri.conf.json`
- Create: `crates/gui/icons/` (copy from AgentStore)

This wraps the core library with thin `#[tauri::command]` handlers.

- [ ] **Step 1: Create directory structure**

```bash
mkdir -p /Users/jaymoore/Documents/projects/agentstore-lite/crates/gui/src
mkdir -p /Users/jaymoore/Documents/projects/agentstore-lite/crates/gui/icons
cp /Users/jaymoore/Documents/projects/AgentStore/src-tauri/icons/* /Users/jaymoore/Documents/projects/agentstore-lite/crates/gui/icons/
```

- [ ] **Step 2: Write Cargo.toml**

Write `crates/gui/Cargo.toml`:

```toml
[package]
name = "agentstore-gui"
version.workspace = true
edition.workspace = true
license.workspace = true

[lib]
name = "agentstore_gui_lib"
crate-type = ["staticlib", "cdylib", "rlib"]

[build-dependencies]
tauri-build = { version = "2.5.6", features = [] }

[dependencies]
agentstore-core = { path = "../core" }
serde = { workspace = true }
serde_json = { workspace = true }
anyhow = { workspace = true }
log = "0.4"
tauri = { version = "2.10.3", features = [] }
tauri-plugin-log = "2"
tauri-plugin-shell = "2"
tauri-plugin-dialog = "2"
dirs = "6"
dotenvy = "0.15.7"
```

- [ ] **Step 3: Write build.rs**

Write `crates/gui/src/build.rs` at `crates/gui/build.rs`:

```rust
fn main() {
    tauri_build::build()
}
```

- [ ] **Step 4: Write main.rs**

Write `crates/gui/src/main.rs`:

```rust
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
    agentstore_gui_lib::run()
}
```

- [ ] **Step 5: Write lib.rs (thin Tauri wrappers over core)**

Write `crates/gui/src/lib.rs`:

```rust
use agentstore_core::packages;
use agentstore_core::packages::scanner::DiscoveredSkill;
use agentstore_core::storage::{self, AppPaths};
use serde::Serialize;
use tauri::{AppHandle, Emitter, Manager, State};

#[derive(Debug, Clone, Serialize)]
struct InstallProgress {
    step: String,
    detail: String,
    progress: f32,
}

fn emit_progress(app: &AppHandle, step: &str, detail: &str, progress: f32) {
    let _ = app.emit(
        "install-progress",
        InstallProgress {
            step: step.to_string(),
            detail: detail.to_string(),
            progress,
        },
    );
}

#[tauri::command]
fn check_platform_dir(platform_id: String) -> bool {
    let home = dirs::home_dir().unwrap_or_default();
    let config = dirs::config_dir().unwrap_or_else(|| home.join(".config"));
    let path = match platform_id.as_str() {
        "claude" => home.join(".claude"),
        "cursor" => home.join(".cursor"),
        "copilot" => config.join("github-copilot"),
        "codex" => home.join(".codex"),
        "opencode" => config.join("opencode"),
        _ => return false,
    };
    path.exists()
}

#[tauri::command]
fn check_symlink_support() -> bool {
    #[cfg(not(windows))]
    {
        true
    }
    #[cfg(windows)]
    {
        let tmp_target = std::env::temp_dir().join(".agentstore-symtest-src");
        let tmp_link = std::env::temp_dir().join(".agentstore-symtest-lnk");
        let _ = std::fs::create_dir_all(&tmp_target);
        let ok = std::os::windows::fs::symlink_dir(&tmp_target, &tmp_link).is_ok();
        let _ = std::fs::remove_dir(&tmp_link);
        let _ = std::fs::remove_dir(&tmp_target);
        ok
    }
}

#[tauri::command]
async fn get_config(paths: State<'_, AppPaths>) -> Result<storage::AppConfig, String> {
    storage::read_config(&paths).map_err(|e| e.to_string())
}

#[tauri::command]
async fn set_config(paths: State<'_, AppPaths>, config: storage::AppConfig) -> Result<(), String> {
    storage::write_config(&paths, &config).map_err(|e| e.to_string())
}

#[tauri::command]
async fn install_package(
    app: AppHandle,
    owner: String,
    name: String,
    enable_platforms: Vec<String>,
    scope: String,
    project_path: Option<String>,
    paths: State<'_, AppPaths>,
) -> Result<packages::PackageManifest, String> {
    let app_clone = app.clone();
    packages::install_package(
        &paths,
        &owner,
        &name,
        None,
        0,
        &enable_platforms,
        &scope,
        project_path.as_deref(),
        move |step, detail, progress| {
            emit_progress(&app_clone, step, detail, progress);
        },
    )
    .map_err(|e| e.to_string())
}

#[tauri::command]
async fn uninstall_package(name: String, paths: State<'_, AppPaths>) -> Result<(), String> {
    packages::uninstall_package(&paths, &name).map_err(|e| e.to_string())
}

#[tauri::command]
async fn list_packages(paths: State<'_, AppPaths>) -> Result<Vec<packages::PackageManifest>, String> {
    packages::list_packages(&paths).map_err(|e| e.to_string())
}

#[tauri::command]
async fn toggle_platform(
    name: String,
    platform_id: String,
    enable: bool,
    scope: String,
    project_path: Option<String>,
    paths: State<'_, AppPaths>,
) -> Result<(), String> {
    packages::toggle_platform(&paths, &name, &platform_id, enable, &scope, project_path.as_deref())
        .map_err(|e| e.to_string())
}

#[tauri::command]
async fn update_package(
    app: AppHandle,
    name: String,
    paths: State<'_, AppPaths>,
) -> Result<packages::PackageManifest, String> {
    let app_clone = app.clone();
    packages::update_package(&paths, &name, move |step, detail, progress| {
        emit_progress(&app_clone, step, detail, progress);
    })
    .map_err(|e| e.to_string())
}

#[tauri::command]
async fn get_package_info(
    name: String,
    paths: State<'_, AppPaths>,
) -> Result<packages::PackageManifest, String> {
    packages::get_package_info(&paths, &name).map_err(|e| e.to_string())
}

#[tauri::command]
async fn scan_installed_skills(project_path: Option<String>) -> Result<Vec<DiscoveredSkill>, String> {
    let proj = project_path.as_ref().map(|p| std::path::PathBuf::from(p));
    Ok(packages::scanner::scan_installed_skills(proj.as_deref()))
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let _ = dotenvy::dotenv();

    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_dialog::init())
        .setup(|app| {
            let paths = AppPaths::init().map_err(|e| e.to_string())?;
            app.manage(paths);
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            check_platform_dir,
            check_symlink_support,
            get_config,
            set_config,
            install_package,
            uninstall_package,
            list_packages,
            toggle_platform,
            update_package,
            get_package_info,
            scan_installed_skills,
        ])
        .run(tauri::generate_context!())
        .expect("error running AgentStore Lite");
}
```

Note: no updater plugin, no search history commands, no favourites commands, no GitHub service commands.

- [ ] **Step 6: Write tauri.conf.json**

Write `crates/gui/tauri.conf.json`:

```json
{
  "$schema": "https://schema.tauri.app/config/2",
  "productName": "AgentStore Lite",
  "version": "0.1.0",
  "identifier": "com.agentstore.lite",
  "build": {
    "frontendDist": "../../frontend/dist",
    "devUrl": "http://localhost:5173",
    "beforeDevCommand": "cd ../../frontend && npm run dev",
    "beforeBuildCommand": "cd ../../frontend && npm run build"
  },
  "app": {
    "windows": [
      {
        "title": "AgentStore Lite",
        "width": 900,
        "height": 650,
        "minWidth": 700,
        "minHeight": 500,
        "resizable": true,
        "fullscreen": false
      }
    ],
    "security": {
      "csp": null
    }
  },
  "bundle": {
    "active": true,
    "targets": "all",
    "icon": [
      "icons/32x32.png",
      "icons/128x128.png",
      "icons/128x128@2x.png",
      "icons/icon.icns",
      "icons/icon.ico"
    ],
    "macOS": {
      "minimumSystemVersion": "10.15",
      "signingIdentity": null,
      "entitlements": null
    },
    "windows": {
      "nsis": {
        "installMode": "currentUser"
      }
    }
  }
}
```

- [ ] **Step 7: Verify the GUI crate compiles (Rust only, frontend comes next)**

```bash
cd /Users/jaymoore/Documents/projects/agentstore-lite && cargo check -p agentstore-gui
```

Expected: success

- [ ] **Step 8: Commit**

```bash
cd /Users/jaymoore/Documents/projects/agentstore-lite
git add crates/gui/
git commit -m "feat: add Tauri GUI crate wrapping core library"
```

---

### Task 7: Create stripped frontend

**Files:**
- Create: `frontend/package.json`
- Create: `frontend/tsconfig.json`
- Create: `frontend/vite.config.ts`
- Create: `frontend/index.html`
- Create: `frontend/src/main.tsx`
- Create: `frontend/src/App.tsx`
- Create: `frontend/src/types.ts`
- Create: `frontend/src/views/InstalledView.tsx`
- Create: `frontend/src/views/SettingsView.tsx`
- Create: `frontend/src/components/Sidebar.tsx`
- Create: `frontend/src/components/InstallDialog.tsx`
- Create: `frontend/src/styles.css`

This task creates the stripped React frontend. No registry views, no telemetry, no updater. The frontend should be created by referencing and simplifying the existing AgentStore frontend code.

- [ ] **Step 1: Create package.json**

Write `frontend/package.json`:

```json
{
  "name": "agentstore-lite-frontend",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "tsc && vite build",
    "preview": "vite preview"
  },
  "dependencies": {
    "@tauri-apps/api": "^2.10.1",
    "@tauri-apps/plugin-dialog": "^2.6.0",
    "@tauri-apps/plugin-shell": "^2.3.5",
    "react": "^19.2.4",
    "react-dom": "^19.2.4",
    "react-router-dom": "^7.14.0"
  },
  "devDependencies": {
    "@tauri-apps/cli": "^2.10.1",
    "@types/react": "^19.2.14",
    "@types/react-dom": "^19.2.3",
    "@vitejs/plugin-react": "^6.0.1",
    "typescript": "^6.0.2",
    "vite": "^8.0.3"
  }
}
```

Note: removed `react-markdown`, `rehype-raw`, `liquid-glass-react`, `@tauri-apps/plugin-updater`, Playwright.

- [ ] **Step 2: Create tsconfig.json, vite.config.ts, index.html**

These are standard Tauri + Vite boilerplate. Copy from AgentStore with path adjustments.

- [ ] **Step 3: Create types.ts**

Write `frontend/src/types.ts` with the types used by InstalledView and SettingsView (PackageManifest, AppConfig, InstallProgress, etc.), derived from the Rust types.

- [ ] **Step 4: Create stripped App.tsx**

The App component with only two routes: `/` (InstalledView) and `/settings` (SettingsView). No update check, no telemetry, no registry routes.

- [ ] **Step 5: Create simplified Sidebar**

Two links: Installed, Settings. An "Install" button that opens InstallDialog.

- [ ] **Step 6: Create InstallDialog component**

Text input for `owner/repo`, platform checkboxes (auto-detected), scope selector, install button. Calls the `install_package` Tauri command.

- [ ] **Step 7: Create InstalledView**

List of installed packages with platform toggles, uninstall button, update button. Calls `list_packages`, `toggle_platform`, `uninstall_package`, `update_package`.

- [ ] **Step 8: Create SettingsView**

GitHub token input, detected platforms list. Calls `get_config`, `set_config`, `check_platform_dir`.

- [ ] **Step 9: Create minimal styles.css**

Clean, minimal stylesheet. No Liquid Glass dependency.

- [ ] **Step 10: Install dependencies and verify build**

```bash
cd /Users/jaymoore/Documents/projects/agentstore-lite/frontend && npm install && npm run build
```

Expected: successful build to `frontend/dist/`

- [ ] **Step 11: Commit**

```bash
cd /Users/jaymoore/Documents/projects/agentstore-lite
git add frontend/
git commit -m "feat: add stripped React frontend"
```

---

### Task 8: Create README and build instructions

**Files:**
- Create: `README.md`

- [ ] **Step 1: Write README**

Write `README.md` covering:
- What AgentStore Lite is (stripped-down package manager for AI agent skills)
- Supported platforms (Claude Code, Cursor, Copilot, Codex, OpenCode)
- CLI usage examples
- GUI build instructions
- macOS Gatekeeper workaround (`xattr -cr` or right-click > Open)
- Windows SmartScreen workaround
- Prerequisites (Rust, Node.js, git)

- [ ] **Step 2: Commit**

```bash
cd /Users/jaymoore/Documents/projects/agentstore-lite
git add README.md
git commit -m "docs: add README with build and usage instructions"
```

---

### Task 9: End-to-end verification

- [ ] **Step 1: Run all core tests**

```bash
cd /Users/jaymoore/Documents/projects/agentstore-lite && cargo test --workspace
```

Expected: all tests pass

- [ ] **Step 2: Build CLI release binary**

```bash
cd /Users/jaymoore/Documents/projects/agentstore-lite && cargo build --release -p agentstore-cli
```

Expected: binary at `target/release/agentstore`

- [ ] **Step 3: Test CLI install/list/uninstall cycle**

```bash
./target/release/agentstore platforms
./target/release/agentstore install anthropics/claude-code-skills --platform claude
./target/release/agentstore list
./target/release/agentstore uninstall claude-code-skills
```

Expected: install succeeds, list shows the package, uninstall removes it

- [ ] **Step 4: Build GUI**

```bash
cd /Users/jaymoore/Documents/projects/agentstore-lite/crates/gui && cargo tauri build
```

Expected: platform-appropriate bundle (.dmg on macOS, NSIS on Windows)

- [ ] **Step 5: Commit final state**

```bash
cd /Users/jaymoore/Documents/projects/agentstore-lite
git add -A
git commit -m "chore: end-to-end verification complete"
```
