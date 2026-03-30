// Copyright (C) 2026 AnalyseDeCircuit
// SPDX-License-Identifier: GPL-3.0-only

//! Platform Launcher Module
//!
//! Provides an in-app application launcher:
//! - **macOS**: Scans `/Applications` for `.app` bundles, extracts icons, launches apps
//! - **Windows**: Delegates to existing WSL distro listing (see `graphics::wsl`)
//! - **Linux**: Not supported (sidebar button hidden)

#[cfg(target_os = "macos")]
pub mod macos;

use serde::Serialize;

/// A single application entry returned to the frontend.
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AppEntry {
    /// Display name (CFBundleDisplayName or CFBundleName)
    pub name: String,
    /// Full path to the .app bundle
    pub path: String,
    /// Bundle identifier (e.g. com.apple.Safari)
    pub bundle_id: Option<String>,
    /// Cached PNG icon path (ready for asset protocol)
    pub icon_path: Option<String>,
}

/// Response from `launcher_list_apps` including the icon directory for asset URL construction.
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LauncherListResponse {
    /// All discovered application entries
    pub apps: Vec<AppEntry>,
    /// The icon cache directory path (already granted on the asset protocol scope).
    /// Frontend can use `convertFileSrc(iconPath)` directly for any icon_path.
    pub icon_dir: Option<String>,
}

// ── Tauri Commands ──────────────────────────────────────────────────────────

/// List all installed applications.
/// On macOS: scans /Applications, /System/Applications, ~/Applications.
/// The icon cache directory is granted on the asset protocol scope so the
/// frontend can construct `asset://` URLs directly without per-icon IPC.
/// On other platforms: returns an empty list (Windows uses WSL distro list instead).
#[tauri::command]
pub async fn launcher_list_apps(app: tauri::AppHandle) -> Result<LauncherListResponse, String> {
    #[cfg(target_os = "macos")]
    {
        use tauri::Manager;
        let (apps, icon_dir) = macos::list_applications(&app)
            .await
            .map_err(|e| e.to_string())?;

        // Grant the entire icon cache directory once on the asset protocol scope
        if let Some(ref dir) = icon_dir {
            let dir_path = std::path::Path::new(dir);
            app.asset_protocol_scope()
                .allow_directory(dir_path, false)
                .map_err(|e| format!("Failed to grant icon dir: {}", e))?;
        }

        Ok(LauncherListResponse { apps, icon_dir })
    }
    #[cfg(not(target_os = "macos"))]
    {
        let _ = app;
        Ok(LauncherListResponse {
            apps: vec![],
            icon_dir: None,
        })
    }
}

/// Launch an application by its path.
/// On macOS: `open -a <path>`.
/// On Windows: not used (WSL launch is separate).
#[tauri::command]
pub async fn launcher_launch_app(path: String) -> Result<(), String> {
    #[cfg(target_os = "macos")]
    {
        tokio::process::Command::new("open")
            .arg(&path)
            .spawn()
            .map_err(|e| format!("Failed to launch '{}': {}", path, e))?;
        Ok(())
    }
    #[cfg(not(target_os = "macos"))]
    {
        let _ = path;
        Err("Not supported on this platform".into())
    }
}

/// Launch a WSL distro (Windows only).
/// Opens the distro in its default shell.
#[tauri::command]
pub async fn launcher_wsl_launch(distro: String) -> Result<(), String> {
    #[cfg(target_os = "windows")]
    {
        tokio::process::Command::new("wsl")
            .args(["-d", &distro])
            .spawn()
            .map_err(|e| format!("Failed to launch WSL distro '{}': {}", distro, e))?;
        Ok(())
    }
    #[cfg(not(target_os = "windows"))]
    {
        let _ = distro;
        Err("WSL is only available on Windows".into())
    }
}

/// Clear the icon cache directory.
/// Called when the user disables the launcher.
///
/// NOTE: We intentionally do NOT call `forbid_directory()` here.
/// Tauri scope semantics give forbidden paths permanent precedence over later
/// `allow_directory()` calls in the same process, so a forbid would break
/// re-enabling the launcher until the app is restarted.
/// Deleting the files is sufficient — the directory grant becomes a no-op
/// when there are no files to serve.
#[tauri::command]
pub async fn launcher_clear_cache(app: tauri::AppHandle) -> Result<(), String> {
    #[cfg(target_os = "macos")]
    {
        let icon_cache_dir = macos::get_icon_cache_dir(&app)
            .map_err(|e| format!("Failed to get icon cache dir: {}", e))?;

        // Delete cached icons only — do NOT forbid the directory scope
        if icon_cache_dir.exists() {
            std::fs::remove_dir_all(&icon_cache_dir)
                .map_err(|e| format!("Failed to clear icon cache: {}", e))?;
        }
        Ok(())
    }
    #[cfg(not(target_os = "macos"))]
    {
        let _ = app;
        Ok(())
    }
}
