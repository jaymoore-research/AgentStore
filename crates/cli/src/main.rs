use agentstore_core::packages;
use agentstore_core::packages::scanner;
use agentstore_core::storage::{self, AppPaths};
use anyhow::Result;
use clap::{Parser, Subcommand};

#[derive(Parser)]
#[command(name = "agentstore", version, about = "Install and manage agent packages across AI coding tools")]
struct Cli {
    /// Output results as JSON
    #[arg(long, global = true)]
    json: bool,

    #[command(subcommand)]
    command: Commands,
}

#[derive(Subcommand)]
enum Commands {
    /// Install a package from GitHub
    Install {
        /// GitHub repo in owner/repo format
        repo: String,

        /// Comma-separated list of platforms to enable (auto-detected if omitted)
        #[arg(long)]
        platform: Option<String>,

        /// Scope: "profile" (default) or "project"
        #[arg(long, default_value = "profile")]
        scope: String,

        /// Project path (required for --scope project)
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
        /// Filter by platform id
        #[arg(long)]
        platform: Option<String>,
    },

    /// Update an installed package
    Update {
        /// Package name
        name: String,
    },

    /// Scan for installed skills on this machine
    Scan {
        /// Project directory to also scan
        #[arg(long)]
        project: Option<String>,
    },

    /// Show detected platforms on this machine
    Platforms,

    /// Get or set config values
    Config {
        #[command(subcommand)]
        action: ConfigAction,
    },
}

#[derive(Subcommand)]
enum ConfigAction {
    /// Set a config key
    Set {
        key: String,
        value: String,
    },
    /// Get a config key
    Get {
        key: String,
    },
}

fn main() -> Result<()> {
    env_logger::init();

    let cli = Cli::parse();

    match cli.command {
        Commands::Install { repo, platform, scope, project } => {
            cmd_install(&repo, platform.as_deref(), &scope, project.as_deref(), cli.json)?;
        }
        Commands::Uninstall { name } => {
            cmd_uninstall(&name, cli.json)?;
        }
        Commands::List { platform } => {
            cmd_list(platform.as_deref(), cli.json)?;
        }
        Commands::Update { name } => {
            cmd_update(&name, cli.json)?;
        }
        Commands::Scan { project } => {
            cmd_scan(project.as_deref(), cli.json)?;
        }
        Commands::Platforms => {
            cmd_platforms(cli.json)?;
        }
        Commands::Config { action } => {
            cmd_config(action, cli.json)?;
        }
    }

    Ok(())
}

fn cmd_install(
    repo: &str,
    platform: Option<&str>,
    scope: &str,
    project: Option<&str>,
    json: bool,
) -> Result<()> {
    let parts: Vec<&str> = repo.splitn(2, '/').collect();
    if parts.len() != 2 {
        anyhow::bail!("repo must be in owner/repo format, got: {}", repo);
    }
    let owner = parts[0];
    let name = parts[1];

    let paths = AppPaths::init()?;

    // Determine which platforms to enable
    let platforms_to_enable: Vec<String> = if let Some(p) = platform {
        p.split(',').map(|s| s.trim().to_string()).collect()
    } else {
        detect_active_platforms()
    };

    if platforms_to_enable.is_empty() {
        anyhow::bail!("No platforms detected. Use --platform to specify one explicitly.");
    }

    eprintln!("[Installing] {}/{} for platforms: {}", owner, name, platforms_to_enable.join(", "));

    let manifest = packages::install_package(
        &paths,
        owner,
        name,
        None,
        0,
        &platforms_to_enable,
        scope,
        project,
        |step, detail, _fraction| {
            eprintln!("[{}] {}", step, detail);
        },
    )?;

    if json {
        println!("{}", serde_json::to_string_pretty(&manifest)?);
    } else {
        println!("Installed: {}", manifest.name);
        println!("  Repo:     {}", manifest.repo);
        println!("  Enabled:  {}", manifest.enabled.keys().cloned().collect::<Vec<_>>().join(", "));
        println!("  Skills:   {}", manifest.components.skills.len());
    }

    Ok(())
}

fn cmd_uninstall(name: &str, json: bool) -> Result<()> {
    let paths = AppPaths::init()?;
    eprintln!("[Uninstalling] {}", name);
    packages::uninstall_package(&paths, name)?;

    if json {
        println!("{}", serde_json::json!({ "uninstalled": name }));
    } else {
        println!("Uninstalled: {}", name);
    }

    Ok(())
}

fn cmd_list(platform: Option<&str>, json: bool) -> Result<()> {
    let paths = AppPaths::init()?;
    let mut pkgs = packages::list_packages(&paths)?;

    if let Some(plat) = platform {
        pkgs.retain(|p| p.enabled.contains_key(plat) || p.supports.contains(&plat.to_string()));
    }

    if json {
        println!("{}", serde_json::to_string_pretty(&pkgs)?);
    } else if pkgs.is_empty() {
        println!("No packages installed.");
    } else {
        for pkg in &pkgs {
            let enabled: Vec<&str> = pkg.enabled.keys().map(|s| s.as_str()).collect();
            println!(
                "{} ({})\n  skills: {}  enabled: {}",
                pkg.name,
                pkg.repo,
                pkg.components.skills.len(),
                if enabled.is_empty() { "none".to_string() } else { enabled.join(", ") }
            );
        }
    }

    Ok(())
}

fn cmd_update(name: &str, json: bool) -> Result<()> {
    let paths = AppPaths::init()?;
    eprintln!("[Updating] {}", name);

    let manifest = packages::update_package(&paths, name, |step, detail, _fraction| {
        eprintln!("[{}] {}", step, detail);
    })?;

    if json {
        println!("{}", serde_json::to_string_pretty(&manifest)?);
    } else {
        println!("Updated: {}", manifest.name);
    }

    Ok(())
}

fn cmd_scan(project: Option<&str>, json: bool) -> Result<()> {
    let project_path = project.map(std::path::Path::new);
    let skills = scanner::scan_installed_skills(project_path);

    if json {
        println!("{}", serde_json::to_string_pretty(&skills)?);
    } else if skills.is_empty() {
        println!("No skills found.");
    } else {
        for skill in &skills {
            let link_tag = if skill.is_symlink { " [symlink]" } else { "" };
            println!("[{}] {}{}", skill.platform_name, skill.name, link_tag);
            if !skill.description.is_empty() {
                println!("  {}", skill.description);
            }
        }
    }

    Ok(())
}

fn cmd_platforms(json: bool) -> Result<()> {
    let home = dirs::home_dir().ok_or_else(|| anyhow::anyhow!("Cannot determine home directory"))?;
    let config_dir = dirs::config_dir().unwrap_or_else(|| home.join(".config"));

    let checks: Vec<(&str, &str, std::path::PathBuf)> = vec![
        ("claude", "Claude Code", home.join(".claude")),
        ("codex", "Codex", home.join(".codex")),
        ("copilot", "GitHub Copilot", config_dir.join("github-copilot")),
        ("gemini", "Gemini CLI", home.join(".gemini")),
        ("cursor", "Cursor", home.join(".cursor")),
        ("opencode", "OpenCode", config_dir.join("opencode")),
        ("vscode", "VS Code", home.join(".vscode")),
    ];

    #[derive(serde::Serialize)]
    struct PlatformStatus {
        id: String,
        name: String,
        detected: bool,
        path: String,
    }

    let statuses: Vec<PlatformStatus> = checks
        .iter()
        .map(|(id, name, path)| PlatformStatus {
            id: id.to_string(),
            name: name.to_string(),
            detected: path.exists(),
            path: path.to_string_lossy().to_string(),
        })
        .collect();

    if json {
        println!("{}", serde_json::to_string_pretty(&statuses)?);
    } else {
        println!("Detected platforms:");
        for s in &statuses {
            let marker = if s.detected { "[x]" } else { "[ ]" };
            println!("  {} {} ({})", marker, s.name, s.path);
        }
    }

    Ok(())
}

fn cmd_config(action: ConfigAction, json: bool) -> Result<()> {
    let paths = AppPaths::init()?;
    let mut config = storage::read_config(&paths)?;

    match action {
        ConfigAction::Set { key, value } => {
            match key.as_str() {
                "github_token" => {
                    config.github_token = Some(value.clone());
                    storage::write_config(&paths, &config)?;
                    if json {
                        println!("{}", serde_json::json!({ "set": key, "ok": true }));
                    } else {
                        println!("Set {}", key);
                    }
                }
                _ => anyhow::bail!("Unknown config key: {}", key),
            }
        }
        ConfigAction::Get { key } => {
            match key.as_str() {
                "github_token" => {
                    let val = config.github_token.as_deref().unwrap_or("<not set>");
                    if json {
                        println!("{}", serde_json::json!({ "key": key, "value": val }));
                    } else {
                        println!("{}: {}", key, val);
                    }
                }
                _ => anyhow::bail!("Unknown config key: {}", key),
            }
        }
    }

    Ok(())
}

/// Auto-detect which platforms are active by checking their config directories.
fn detect_active_platforms() -> Vec<String> {
    let home = match dirs::home_dir() {
        Some(h) => h,
        None => return vec![],
    };
    let config_dir = dirs::config_dir().unwrap_or_else(|| home.join(".config"));

    let checks: &[(&str, std::path::PathBuf)] = &[
        ("claude", home.join(".claude")),
        ("codex", home.join(".codex")),
        ("copilot", config_dir.join("github-copilot")),
        ("gemini", home.join(".gemini")),
        ("cursor", home.join(".cursor")),
        ("opencode", config_dir.join("opencode")),
        ("vscode", home.join(".vscode")),
    ];

    checks
        .iter()
        .filter(|(_, path)| path.exists())
        .map(|(id, _)| id.to_string())
        .collect()
}
