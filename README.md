# AgentStore

A local package manager for AI coding agent skills. No server, no registry, no telemetry.

Installs skill packages from GitHub repositories and manages symlinks across Claude Code, Cursor, GitHub Copilot, Codex, and OpenCode. Runs entirely offline with zero external dependencies.

## What it is

**AgentStore** provides two interfaces:

- **CLI binary** for scripted and command-line installation
- **GUI desktop app** (Tauri) for graphical management

Install packages from GitHub, update them, and manage symlinks to the right locations on your system.

## CLI usage

```bash
agentstore install owner/repo [--platform claude,cursor] [--scope profile|project]
agentstore uninstall <name>
agentstore list [--platform claude]
agentstore update <name>
agentstore scan
agentstore platforms
agentstore config set github_token <token>
agentstore config get github_token
```

All commands support `--json` for machine-readable output. Platforms are auto-detected if `--platform` is omitted.

## Building

### Prerequisites

- Rust toolchain
- Node.js 20+
- git

### CLI only

```bash
cargo build --release -p agentstore-cli
# Binary at target/release/agentstore
```

### GUI (requires Tauri prerequisites)

Ensure you have Tauri prerequisites installed, then:

```bash
cd frontend && npm install && npm run build && cd ..
cd crates/gui && cargo tauri build
```

The built app goes to `src-tauri/target/release/bundle/`.

## Platform-specific notes

### macOS

No code signing. To run the app:

- Right-click > Open in Finder, or
- Run `xattr -cr /path/to/AgentStore.app` to remove quarantine attributes

### Windows

No code signing. Click "Run anyway" on the SmartScreen warning.

### Linux

No signing needed. The AppImage works directly.

## Project structure

- `crates/core`: Shared business logic (packages, platforms, storage)
- `crates/cli`: CLI binary entry point
- `crates/gui`: Tauri desktop app wrapper
- `frontend`: React UI and Tauri bindings

