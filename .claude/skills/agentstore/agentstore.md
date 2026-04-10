---
name: agentstore
description: Manage AI agent packages via the AgentStore CLI. Install, uninstall, update, scan, enable/disable packages across Claude Code, Cursor, Copilot, Codex, and OpenCode.
---

# AgentStore CLI

Package manager for AI agent skills. Installs GitHub repos as packages, creates symlinks into each platform's skill directory, and tracks ownership so packages can be cleanly updated or removed.

## Commands

```bash
# Install a package from GitHub
agentstore install <owner/repo>
agentstore install <owner/repo> --platform claude,cursor
agentstore install <owner/repo> --scope project --project .

# List installed packages
agentstore list
agentstore list --platform claude

# Scan all skills on the system (managed and unmanaged)
agentstore scan
agentstore scan --project /path/to/project

# Update a package
agentstore update <name>

# Uninstall
agentstore uninstall <name>

# Show detected platforms
agentstore platforms

# Config
agentstore config set github_token <token>
agentstore config get github_token

# JSON output (any command)
agentstore --json list
agentstore --json scan
```

## How It Works

1. **Install**: clones the repo to `~/Library/Application Support/AgentStore/packages/<name>/repo/`
2. **Detect**: scans for `.claude/skills/`, `.cursor/skills/`, `.github/skills/`, `CLAUDE.md`, `AGENTS.md`, MCP configs, and `apm.yml`
3. **Symlink**: creates symlinks from the package into each platform's skill directory (e.g. `~/.claude/skills/<skill>` -> AgentStore package)
4. **Inject**: appends instruction blocks to platform files (`CLAUDE.md`, `AGENTS.md`) wrapped in `<!-- agentstore:begin/end -->` markers
5. **Track**: records all symlinks in `packages/state.json` so they can be cleanly removed

## Supported Platforms

| Platform | Skills Dir | Instructions | MCP Config |
|----------|-----------|-------------|------------|
| Claude Code | `.claude/skills` | `CLAUDE.md` | `.claude/settings.json` |
| Cursor | `.cursor/skills` | `.cursor/rules/agentstore.mdc` | `.cursor/mcp.json` |
| GitHub Copilot | `.github/skills` | `.github/copilot-instructions.md` | - |
| Codex | `.codex/skills` | `AGENTS.md` | - |
| OpenCode | `.opencode/skills` | `AGENTS.md` | `opencode.json` |

## Scopes

- **profile** (default): installs to `~/` so skills are available globally
- **project**: installs to a specific project directory

## Safety

- AgentStore tracks symlink ownership. It will not overwrite symlinks it didn't create.
- Uninstall cleanly removes all symlinks and injected instruction blocks.
- Packages are shallow-cloned (`--depth 1`) to minimise disk usage.

## Building from Source

```bash
# From the AgentStore repo root
cargo build -p agentstore-cli --release

# Binary at target/release/agentstore
# Symlink it to your PATH:
ln -s "$(pwd)/target/release/agentstore" /usr/local/bin/agentstore
```

## When to Use

- Installing shared skill packs (e.g. `obra/superpowers`, `garrytan/gstack`)
- Scanning the system to audit what skills are installed and whether they're managed
- Enabling/disabling a package for specific platforms without reinstalling
- Updating packages to pick up upstream changes
