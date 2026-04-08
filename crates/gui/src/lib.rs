use agentstore_core::packages;
use agentstore_core::packages::scanner::DiscoveredSkill;
use agentstore_core::packages::PackageManifest;
use agentstore_core::storage::{self, AppConfig, AppPaths};
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
    use agentstore_core::platforms::get_platform;
    if let Some(platform) = get_platform(&platform_id) {
        if let Some(home) = dirs::home_dir() {
            return home.join(&platform.skills_dir).exists();
        }
    }
    false
}

#[tauri::command]
fn check_symlink_support() -> bool {
    #[cfg(unix)]
    {
        true
    }
    #[cfg(windows)]
    {
        // Test symlink support by attempting to create a temp symlink
        use std::env;
        let tmp = env::temp_dir().join("agentstore_symlink_test");
        let target = env::temp_dir().join("agentstore_symlink_target");
        let _ = std::fs::create_dir_all(&target);
        let result = std::os::windows::fs::symlink_dir(&target, &tmp);
        let _ = std::fs::remove_dir(&tmp);
        let _ = std::fs::remove_dir(&target);
        result.is_ok()
    }
}

#[tauri::command]
fn get_config(paths: State<AppPaths>) -> Result<AppConfig, String> {
    storage::read_config(&paths).map_err(|e| e.to_string())
}

#[tauri::command]
fn set_config(paths: State<AppPaths>, config: AppConfig) -> Result<(), String> {
    storage::write_config(&paths, &config).map_err(|e| e.to_string())
}

#[tauri::command]
fn install_package(
    app: AppHandle,
    owner: String,
    name: String,
    enable_platforms: Vec<String>,
    scope: String,
    project_path: Option<String>,
    paths: State<AppPaths>,
) -> Result<PackageManifest, String> {
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
fn uninstall_package(name: String, paths: State<AppPaths>) -> Result<(), String> {
    packages::uninstall_package(&paths, &name).map_err(|e| e.to_string())
}

#[tauri::command]
fn list_packages(paths: State<AppPaths>) -> Result<Vec<PackageManifest>, String> {
    packages::list_packages(&paths).map_err(|e| e.to_string())
}

#[tauri::command]
fn toggle_platform(
    name: String,
    platform_id: String,
    enable: bool,
    scope: String,
    project_path: Option<String>,
    paths: State<AppPaths>,
) -> Result<(), String> {
    packages::toggle_platform(&paths, &name, &platform_id, enable, &scope, project_path.as_deref())
        .map_err(|e| e.to_string())
}

#[tauri::command]
fn update_package(
    app: AppHandle,
    name: String,
    paths: State<AppPaths>,
) -> Result<PackageManifest, String> {
    let app_clone = app.clone();
    packages::update_package(&paths, &name, move |step, detail, progress| {
        emit_progress(&app_clone, step, detail, progress);
    })
    .map_err(|e| e.to_string())
}

#[tauri::command]
fn get_package_info(name: String, paths: State<AppPaths>) -> Result<PackageManifest, String> {
    packages::get_package_info(&paths, &name).map_err(|e| e.to_string())
}

#[tauri::command]
fn scan_installed_skills(project_path: Option<String>) -> Result<Vec<DiscoveredSkill>, String> {
    let path = project_path.as_deref().map(std::path::Path::new);
    Ok(packages::scanner::scan_installed_skills(path))
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let _ = dotenvy::dotenv();

    tauri::Builder::default()
        .plugin(tauri_plugin_log::Builder::new().build())
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
        .expect("error while running tauri application");
}
