use anyhow::Result;
use std::fs;
use std::path::Path;

const BEGIN_MARKER: &str = "<!-- agentstore:begin";
const END_MARKER: &str = "<!-- agentstore:end";

/// Inject a package's instruction fragment into a managed file (CLAUDE.md, AGENTS.md, etc.).
/// Preserves user content outside managed blocks.
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

    // If block already exists, replace it
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
        // Append new block
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

/// Remove a package's instruction block from a managed file.
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

    let result = format!("{}{}", before.trim_end(), if after.is_empty() { "" } else { "\n\n" }).to_string() + after;
    let trimmed = result.trim().to_string();

    if trimmed.is_empty() {
        fs::remove_file(target_file)?;
    } else {
        fs::write(target_file, trimmed)?;
    }

    Ok(())
}

/// Add an MCP server entry to a platform's MCP config file.
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

    // Add under mcpServers key (Claude Code format)
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

/// Remove an MCP server entry tagged with a specific package name.
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

        let content = std::fs::read_to_string(&target).unwrap();
        assert!(content.contains("<!-- agentstore:begin my-pkg -->"));
        assert!(content.contains("Do the thing."));
        assert!(content.contains("<!-- agentstore:end my-pkg -->"));
    }

    #[test]
    fn inject_into_file_with_existing_content() {
        let tmp = TempDir::new().unwrap();
        let target = tmp.path().join("CLAUDE.md");
        std::fs::write(&target, "# My existing notes\n\nKeep this.").unwrap();

        inject_instructions(&target, "my-pkg", "New instructions.").unwrap();

        let content = std::fs::read_to_string(&target).unwrap();
        assert!(content.contains("Keep this."));
        assert!(content.contains("<!-- agentstore:begin my-pkg -->"));
        assert!(content.contains("New instructions."));
    }

    #[test]
    fn inject_replaces_existing_block_for_same_package() {
        let tmp = TempDir::new().unwrap();
        let target = tmp.path().join("CLAUDE.md");

        inject_instructions(&target, "my-pkg", "Version 1.").unwrap();
        inject_instructions(&target, "my-pkg", "Version 2.").unwrap();

        let content = std::fs::read_to_string(&target).unwrap();
        assert!(!content.contains("Version 1."));
        assert!(content.contains("Version 2."));
        // Only one begin marker should be present
        assert_eq!(content.matches("<!-- agentstore:begin my-pkg -->").count(), 1);
    }

    #[test]
    fn remove_block_from_file() {
        let tmp = TempDir::new().unwrap();
        let target = tmp.path().join("CLAUDE.md");

        inject_instructions(&target, "my-pkg", "Should be removed.").unwrap();
        remove_instructions(&target, "my-pkg").unwrap();

        // File should be gone because it only contained the managed block
        assert!(!target.exists());
    }

    #[test]
    fn remove_block_leaves_other_content_intact() {
        let tmp = TempDir::new().unwrap();
        let target = tmp.path().join("CLAUDE.md");
        std::fs::write(&target, "# Preamble\n\nUser notes here.").unwrap();

        inject_instructions(&target, "my-pkg", "Package content.").unwrap();
        remove_instructions(&target, "my-pkg").unwrap();

        let content = std::fs::read_to_string(&target).unwrap();
        assert!(content.contains("User notes here."));
        assert!(!content.contains("Package content."));
        assert!(!content.contains("agentstore:begin my-pkg"));
    }

    #[test]
    fn remove_from_nonexistent_file_is_ok() {
        let tmp = TempDir::new().unwrap();
        let target = tmp.path().join("does-not-exist.md");

        let result = remove_instructions(&target, "my-pkg");
        assert!(result.is_ok());
    }
}
