mod clipboard;
mod media;
mod monitor;
mod settings;
mod shelf;
mod volume;

use tauri::Manager;

#[tauri::command]
fn get_media_info() -> Result<Option<media::MediaTrackInfo>, String> {
    media::fetch_media_track()
}

#[tauri::command]
fn media_toggle_play_pause() -> Result<(), String> {
    media::toggle_play_pause()
}

#[tauri::command]
fn media_skip_next() -> Result<(), String> {
    media::skip_next()
}

#[tauri::command]
fn media_skip_previous() -> Result<(), String> {
    media::skip_previous()
}

#[tauri::command]
fn media_seek(position_seconds: u64) -> Result<(), String> {
    media::seek(position_seconds)
}

#[tauri::command]
fn shelf_inspect_file(path: String) -> Result<shelf::ShelfFileInfo, String> {
    shelf::inspect_file(&path)
}

#[tauri::command]
fn shelf_reveal_in_explorer(path: String) -> Result<(), String> {
    shelf::reveal_in_explorer(&path)
}

#[tauri::command]
fn clipboard_get_history() -> Vec<clipboard::ClipboardItem> {
    clipboard::get_history()
}

#[tauri::command]
fn clipboard_copy(text: String) -> Result<(), String> {
    clipboard::write_clipboard_text(&text)
}

#[tauri::command]
fn clipboard_clear() -> Result<(), String> {
    clipboard::clear_history();
    Ok(())
}

#[tauri::command]
fn clipboard_remove(id: String) -> Result<(), String> {
    clipboard::remove_item(&id);
    Ok(())
}

#[tauri::command]
fn get_monitors(window: tauri::WebviewWindow) -> Vec<monitor::MonitorDetails> {
    monitor::get_available_monitors(&window)
}

#[tauri::command]
fn set_monitor_mode(window: tauri::WebviewWindow, mode: String) -> Result<(), String> {
    if mode == "auto" {
        monitor::set_mode(monitor::MonitorTargetMode::Auto, &window)
    } else if let Some(idx_str) = mode.strip_prefix("fixed:") {
        if let Ok(idx) = idx_str.parse::<usize>() {
            monitor::set_mode(monitor::MonitorTargetMode::Fixed(idx), &window)
        } else {
            Err("Invalid monitor index".to_string())
        }
    } else {
        Err("Unknown mode".to_string())
    }
}

#[tauri::command]
fn get_monitor_mode() -> String {
    monitor::get_mode()
}

#[tauri::command]
fn is_foreground_maximized() -> bool {
    monitor::get_foreground_maximized_status()
}

#[tauri::command]
fn update_capsule_bounds(x: i32, y: i32, width: i32, height: i32) {
    monitor::update_capsule_bounds(x, y, width, height);
}

#[tauri::command]
fn get_volume_status() -> (i32, bool) {
    (volume::get_master_volume_percent(), volume::has_volume_changed())
}

#[tauri::command]
fn open_settings_window(app: tauri::AppHandle) -> Result<(), String> {
    if let Some(window) = app.get_webview_window("settings") {
        let _ = window.show();
        let _ = window.unminimize();
        let _ = window.set_focus();
        Ok(())
    } else {
        Err("Window settings tidak ditemukan di tauri.conf.json".to_string())
    }
}

#[tauri::command]
fn get_app_settings(app: tauri::AppHandle) -> settings::AppSettings {
    settings::load_settings(&app)
}

#[tauri::command]
fn save_app_settings(app: tauri::AppHandle, settings: settings::AppSettings) -> Result<(), String> {
    settings::save_settings(&app, &settings)
}

#[tauri::command]
fn move_to_monitor(window: tauri::WebviewWindow, index: usize) -> Result<(), String> {
    monitor::move_window_to_monitor(&window, index)
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .setup(|app| {
            media::init_media_worker();
            clipboard::init_clipboard_listener();
            volume::start_volume_listener();

            // Initial positioning on primary screen or active screen
            if let Some(window) = app.get_webview_window("main") {
                let _ = monitor::move_window_to_monitor(&window, 0);
                if let Ok(hwnd) = window.hwnd() {
                    monitor::enforce_window_topmost(hwnd);
                }
            }

            // Start background monitor follower (Follow Cursor when multi-monitor)
            monitor::start_monitor_follower(app.handle().clone());

            // Ensure startup registry matches stored settings
            let initial_settings = settings::load_settings(app.handle());
            if initial_settings.auto_start {
                let _ = settings::set_autostart_registry(true);
            }

            // Intercept close button on settings window so it hides instead of destroys
            if let Some(settings_win) = app.get_webview_window("settings") {
                let win_clone = settings_win.clone();
                settings_win.on_window_event(move |event| {
                    if let tauri::WindowEvent::CloseRequested { api, .. } = event {
                        api.prevent_close();
                        let _ = win_clone.hide();
                    }
                });
            }

            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            get_media_info,
            media_toggle_play_pause,
            media_skip_next,
            media_skip_previous,
            media_seek,
            shelf_inspect_file,
            shelf_reveal_in_explorer,
            clipboard_get_history,
            clipboard_copy,
            clipboard_clear,
            clipboard_remove,
            get_monitors,
            set_monitor_mode,
            get_monitor_mode,
            is_foreground_maximized,
            update_capsule_bounds,
            get_volume_status,
            open_settings_window,
            move_to_monitor,
            get_app_settings,
            save_app_settings
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
