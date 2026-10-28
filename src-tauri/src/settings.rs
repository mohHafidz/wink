use serde::{Deserialize, Serialize};
use std::fs;
use std::path::PathBuf;
use tauri::{AppHandle, Manager};

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AppSettings {
    pub theme_mode: String,        // "dark" | "light" | "system"
    pub anim_duration: String,     // "450ms" | "580ms" | "750ms"
    pub vertical_offset: i32,      // e.g. 8
    pub auto_stealth: bool,        // true/false
    pub edge_wake: bool,           // true/false
    pub in_place_track: bool,      // true/false
    pub volume_hud_enabled: bool,  // true/false
    pub volume_duration: i32,      // e.g. 1400
    pub monitor_placement: String, // "auto" | "fixed"
    pub auto_start: bool,          // true/false
}

impl Default for AppSettings {
    fn default() -> Self {
        Self {
            theme_mode: "dark".to_string(),
            anim_duration: "580ms".to_string(),
            vertical_offset: 8,
            auto_stealth: true,
            edge_wake: true,
            in_place_track: true,
            volume_hud_enabled: true,
            volume_duration: 1400,
            monitor_placement: "auto".to_string(),
            auto_start: false,
        }
    }
}

pub fn get_settings_file_path(app: &AppHandle) -> PathBuf {
    if let Ok(dir) = app.path().app_data_dir() {
        let _ = fs::create_dir_all(&dir);
        dir.join("settings.json")
    } else {
        let mut p = std::env::var_os("APPDATA")
            .map(PathBuf::from)
            .unwrap_or_else(|| PathBuf::from("."));
        p.push("com.muham.wink");
        let _ = fs::create_dir_all(&p);
        p.join("settings.json")
    }
}

pub fn load_settings(app: &AppHandle) -> AppSettings {
    let path = get_settings_file_path(app);
    let mut settings = AppSettings::default();

    if path.exists() {
        if let Ok(content) = fs::read_to_string(&path) {
            if let Ok(parsed) = serde_json::from_str::<AppSettings>(&content) {
                settings = parsed;
            }
        }
    }

    // Pastikan status auto_start mencerminkan keadaan aktual di Registry Windows
    settings.auto_start = is_autostart_registered();
    settings
}

pub fn save_settings(app: &AppHandle, settings: &AppSettings) -> Result<(), String> {
    let path = get_settings_file_path(app);
    let json_str = serde_json::to_string_pretty(settings).map_err(|e| e.to_string())?;
    fs::write(&path, json_str).map_err(|e| e.to_string())?;

    // Perbarui Registry Run key Windows untuk startup
    set_autostart_registry(settings.auto_start)?;

    Ok(())
}

pub fn set_autostart_registry(enabled: bool) -> Result<(), String> {
    use std::os::windows::process::CommandExt;
    const CREATE_NO_WINDOW: u32 = 0x08000000;

    let app_path = std::env::current_exe().map_err(|e| e.to_string())?;
    let app_path_str = app_path.to_string_lossy().to_string();

    if enabled {
        let val_data = format!("\"{}\"", app_path_str);
        let status = std::process::Command::new("reg")
            .creation_flags(CREATE_NO_WINDOW)
            .args(&[
                "add",
                "HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Run",
                "/v",
                "Wink",
                "/t",
                "REG_SZ",
                "/d",
                &val_data,
                "/f",
            ])
            .status()
            .map_err(|e| e.to_string())?;

        if !status.success() {
            return Err("Gagal mendaftarkan aplikasi ke Windows Startup Registry".to_string());
        }
    } else {
        let _ = std::process::Command::new("reg")
            .creation_flags(CREATE_NO_WINDOW)
            .args(&[
                "delete",
                "HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Run",
                "/v",
                "Wink",
                "/f",
            ])
            .status();
    }

    Ok(())
}

pub fn is_autostart_registered() -> bool {
    use std::os::windows::process::CommandExt;
    const CREATE_NO_WINDOW: u32 = 0x08000000;

    let output = std::process::Command::new("reg")
        .creation_flags(CREATE_NO_WINDOW)
        .args(&[
            "query",
            "HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Run",
            "/v",
            "IslandWin",
        ])
        .output();

    if let Ok(out) = output {
        out.status.success()
    } else {
        false
    }
}
