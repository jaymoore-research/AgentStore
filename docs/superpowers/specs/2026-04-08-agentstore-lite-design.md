# AgentStore Lite: Stripped Fork + CLI

**Date:** 2026-04-08
**Status:** Approved

## Goal

Create a separate, minimal repo (`agentstore-lite`) that strips AgentStore down to its core: install, manage, and uninstall AI agent skill packages from GitHub repos. No registry, no hosting, no auto-updates, no telemetry, no CI/CD.

Two distribution targets:
- **CLI binary** (`agentstore`): standalone Rust executable, no runtime dependencies
- **Stripped GUI** (`agentstore-gui`): Tauri app with minimal React frontend

Both share a single Rust core library crate.

## Repository structure

```
agentstore-lite/
├── crates/
│   ├── core/              # Shared library: all business logic
│   │   ├── src/
│   │   │   ├── lib.rs
│   │   │   ├── packages/  # clone, symlink, inject, detect, scan, analyse
│   │   │   ├── platforms/ # platform definitions (Claude, Cursor, Copilot, Codex, OpenCode)
│   │   │   └── storage/   # AppPaths, AppConfig, cache (local SQLite)
│   │   └── Cargo.toml
│   ├── cli/               # CLI binary
│   │   ├── src/main.rs    # clap-based CLI
│   │   └── Cargo.toml     # depends on core
│   └── gui/               # Tauri binary (stripped)
│       ├── src/
│       │   ├── main.rs
│       │   ├── lib.rs     # thin Tauri command wrappers over core
│       │   └── build.rs
│       ├── tauri.conf.json
│       ├── icons/
│       └── Cargo.toml     # depends on core + tauri
├── frontend/              # React app (stripped)
│   ├── src/
│   │   ├── App.tsx
│   │   ├── views/         # InstalledView, SettingsView only
│   │   ├── components/    # Sidebar (simplified), Onboarding, InstallDialog
│   │   └── config.ts      # no telemetry, no REGISTRY_URL
│   ├── package.json
│   └── vite.config.ts
├── Cargo.toml             # workspace
└── README.md
```

## What gets stripped

### Removed entirely

- `server/` directory (Fly.io API, crawler, DB, Dockerfile, fly.toml)
- `.github/workflows/` (CI/CD pipeline)
- Auto-updater plugin (`tauri-plugin-updater`, updater config in tauri.conf.json, update check in App.tsx)
- Telemetry (`trackEvent`, `/api/events` calls, config.ts tracking)
- Registry views (`SearchView`, `RegistryView`, `AboutView`)
- `reqwest` dependency from core (no HTTP calls; git clone via shell)
- GitHub service module (`github_service/`) for repo search/verification
- Landing page (`landing/`)
- Test harness results

### Kept

- `packages/` modules: symlinker, injector, detector, scanner, analyser
- `platforms/` module: platform definitions
- `storage/` module: AppPaths, AppConfig, local cache
- `InstalledView`, `SettingsView`, `PreviewView` (installed package details)
- Onboarding flow (platform detection, GitHub token setup)

## Core crate refactor

Decouple from Tauri types. Current functions take `State<AppPaths>` and `AppHandle`. The core crate takes plain `&AppPaths` and returns `Result<T, CoreError>`.

Progress reporting uses a callback instead of Tauri events:

```rust
// crates/core/src/packages/mod.rs
pub fn install_package(
    paths: &AppPaths,
    owner: &str,
    name: &str,
    enable_platforms: &[String],
    scope: &str,
    project_path: Option<&str>,
    on_progress: impl Fn(&str, &str, f64),
) -> Result<PackageManifest, CoreError> { ... }
```

The GUI crate wraps these with `#[tauri::command]` handlers that bridge `State<AppPaths>` and emit Tauri events. The CLI calls them directly with a terminal progress callback.

## CLI interface

```
agentstore install owner/repo [--platform claude,cursor] [--scope global|project]
agentstore uninstall <name>
agentstore list [--platform claude]
agentstore update <name>
agentstore scan                    # discover locally installed skills
agentstore platforms               # show detected platforms
agentstore config set github_token <token>
agentstore config get github_token
```

- Argument parsing via `clap`
- Plain text output by default, `--json` flag for machine-readable output

## GUI changes

Three views:
- **Installed** (home): list of installed packages with platform toggles
- **Package detail**: README preview, platform toggles, uninstall button
- **Settings**: GitHub token, detected platforms, install path

New: **Install dialog** (text input for `owner/repo`, platform checkboxes, install button). Replaces the entire search/registry flow.

Sidebar: Installed, Settings. No search bar.

## Cross-platform builds

No CI/CD. Users build locally:

```bash
# CLI (any platform)
cargo build --release -p agentstore-cli

# GUI (any platform with Tauri prerequisites)
cd crates/gui && cargo tauri build
```

Optional `Makefile` or `justfile` with convenience targets. GitHub Releases for manually uploaded binaries.

### Platform-specific notes

- **macOS:** No code signing. Users right-click > Open or run `xattr -cr`. Documented in README.
- **Windows:** No code signing. SmartScreen "Run anyway" warning. Documented in README.
- **Linux:** No signing needed. AppImage works out of the box.

## Dependencies

### Core crate (`crates/core`)

- `serde`, `serde_json`: serialisation
- `rusqlite` (bundled): local package database
- `dirs`: platform-specific paths
- `chrono`: timestamps
- `anyhow`, `thiserror`: error handling
- `regex`: pattern matching
- `junction` (Windows only): symlink support

### CLI crate (`crates/cli`)

- `clap`: argument parsing
- `core` (workspace dependency)

### GUI crate (`crates/gui`)

- `tauri` (without updater plugin)
- `tauri-plugin-shell`, `tauri-plugin-dialog`, `tauri-plugin-log`
- `core` (workspace dependency)

### Frontend

- React 19, Vite, TypeScript
- `@tauri-apps/api` (core invoke only, no updater plugin)
