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
