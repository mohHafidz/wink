use serde::{Deserialize, Serialize};
use std::sync::atomic::{AtomicBool, AtomicUsize, Ordering};
use std::sync::Mutex;
use std::thread;
use std::time::Duration;
use tauri::{Manager, PhysicalPosition, Position, WebviewWindow};
use windows::Win32::Graphics::Gdi::{
    GetMonitorInfoW, MonitorFromWindow, MONITORINFO, MONITOR_DEFAULTTONEAREST,
};
use windows::Win32::UI::WindowsAndMessaging::{
    GetClassNameW, GetCursorPos, GetForegroundWindow, GetWindowPlacement, GetWindowRect,
    SetWindowPos, HWND_TOPMOST, SWP_NOACTIVATE, SWP_NOMOVE, SWP_NOSIZE,
    WINDOWPLACEMENT, SW_SHOWMAXIMIZED,
};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct MonitorDetails {
    pub index: usize,
    pub name: String,
    pub is_primary: bool,
    pub width: u32,
    pub height: u32,
    pub scale_factor: f64,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub enum MonitorTargetMode {
    Auto,
    Fixed(usize),
}

static TARGET_MODE: Mutex<MonitorTargetMode> = Mutex::new(MonitorTargetMode::Auto);
static CURRENT_MONITOR_IDX: AtomicUsize = AtomicUsize::new(0);
static FOREGROUND_MAXIMIZED: AtomicBool = AtomicBool::new(false);
static CAPSULE_RECT: Mutex<(i32, i32, i32, i32)> = Mutex::new((235, 8, 130, 34));

pub fn update_capsule_bounds(x: i32, y: i32, width: i32, height: i32) {
    let mut lock = CAPSULE_RECT.lock().unwrap();
    *lock = (x, y, width, height);
}

pub fn is_point_inside_capsule(px: i32, py: i32) -> bool {
    let lock = CAPSULE_RECT.lock().unwrap();
    let (x, y, w, h) = *lock;
    px >= x && px <= (x + w) && py >= y && py <= (y + h)
}

/// Checks if a window class belongs to Windows Shell (Taskbar, Start Menu, Search, Action Center)
fn is_windows_shell_window(hwnd: windows::Win32::Foundation::HWND) -> bool {
    let mut class_name = [0u16; 256];
    let len = unsafe { GetClassNameW(hwnd, &mut class_name) };
    if len > 0 {
        let name = String::from_utf16_lossy(&class_name[..len as usize]);
        // Common Windows Shell window classes:
        // Shell_TrayWnd: The Taskbar
        // Shell_SecondaryTrayWnd: Multi-monitor Taskbars
        // Windows.UI.Core.CoreWindow: Start menu, Action Center, Cortana/Search flyouts
        // Progman / WorkerW: Windows Desktop
        if name == "Shell_TrayWnd"
            || name == "Shell_SecondaryTrayWnd"
            || name == "Windows.UI.Core.CoreWindow"
            || name == "Progman"
            || name == "WorkerW"
            || name.starts_with("ApplicationFrameWindow") && name.contains("Shell")
        {
            return true;
        }
    }
    false
}

/// Checks if the currently active/focused Windows application is maximized OR true fullscreen (e.g. YouTube / VLC / Games)
pub fn is_foreground_window_maximized(our_hwnd: isize) -> bool {
    unsafe {
        let fg_hwnd = GetForegroundWindow();
        if fg_hwnd.0.is_null() {
            return false;
        }

        // If our island window is the foreground window, we maintain previous status
        if fg_hwnd.0 as isize == our_hwnd {
            return FOREGROUND_MAXIMIZED.load(Ordering::Relaxed);
        }

        // If the focused window is a temporary Windows Shell overlay (Taskbar, Start Menu flyout, Desktop),
        // we IGNORE the focus shift and PRESERVE our previous stealth/normal status!
        // This ensures the Island stays neatly tucked away in Stealth Micro-Pill when opening Start/Taskbar over maximized apps.
        if is_windows_shell_window(fg_hwnd) {
            return FOREGROUND_MAXIMIZED.load(Ordering::Relaxed);
        }

        // 1. Check Win32 standard maximized flag (SW_SHOWMAXIMIZED)
        let mut wp = WINDOWPLACEMENT::default();
        wp.length = std::mem::size_of::<WINDOWPLACEMENT>() as u32;

        if GetWindowPlacement(fg_hwnd, &mut wp).is_ok() {
            if wp.showCmd == SW_SHOWMAXIMIZED.0 as u32 {
                FOREGROUND_MAXIMIZED.store(true, Ordering::Relaxed);
                return true;
            }
        }

        // 2. Check true Fullscreen (HTML5 video full-screen, games, borderless full window)
        // When YouTube goes fullscreen, the window is NOT technically 'maximized' by showCmd,
        // but its window bounds cover or exceed the monitor's full rect.
        let mut rect = windows::Win32::Foundation::RECT::default();
        if GetWindowRect(fg_hwnd, &mut rect).is_ok() {
            let h_monitor = MonitorFromWindow(fg_hwnd, MONITOR_DEFAULTTONEAREST);
            let mut mi = MONITORINFO::default();
            mi.cbSize = std::mem::size_of::<MONITORINFO>() as u32;

            if GetMonitorInfoW(h_monitor, &mut mi).as_bool() {
                let mon_rect = mi.rcMonitor;
                // If window rectangle completely covers or exceeds the physical monitor bounds
                let is_fullscreen = rect.left <= mon_rect.left
                    && rect.top <= mon_rect.top
                    && rect.right >= mon_rect.right
                    && rect.bottom >= mon_rect.bottom;

                if is_fullscreen {
                    FOREGROUND_MAXIMIZED.store(true, Ordering::Relaxed);
                    return true;
                }
            }
        }

        // 3. The foreground window is an active user application (e.g. Spotify, Notepad) and it is NOT maximized!
        // Island naturally blooms back to Normal (Ambient / Pure-Idle)
        FOREGROUND_MAXIMIZED.store(false, Ordering::Relaxed);
        false
    }
}

pub fn get_foreground_maximized_status() -> bool {
    FOREGROUND_MAXIMIZED.load(Ordering::Relaxed)
}

pub fn get_available_monitors(window: &WebviewWindow) -> Vec<MonitorDetails> {
    let mut list = Vec::new();
    if let Ok(monitors) = window.available_monitors() {
        for (i, m) in monitors.into_iter().enumerate() {
            let is_primary = m.position().x == 0 && m.position().y == 0;
            let name = m.name().cloned().unwrap_or_else(|| {
                if is_primary {
                    "Layar Utama (Laptop)".to_string()
                } else {
                    format!("Layar Eksternal {}", i)
                }
            });
            list.push(MonitorDetails {
                index: i,
                name,
                is_primary,
                width: m.size().width,
                height: m.size().height,
                scale_factor: m.scale_factor(),
            });
        }
    }
    list
}

pub fn move_window_to_monitor(window: &WebviewWindow, monitor_index: usize) -> Result<(), String> {
    let monitors = window.available_monitors().map_err(|e| format!("{:?}", e))?;
    if let Some(target) = monitors.get(monitor_index) {
        let pos = target.position();
        let size = target.size();
        let scale = target.scale_factor();
        let win_width = (600.0 * scale) as i32;

        let x = pos.x + (size.width as i32 - win_width) / 2;
        let y = pos.y; // At top of the target monitor

        window
            .set_position(Position::Physical(PhysicalPosition { x, y }))
            .map_err(|e| format!("{:?}", e))?;

        CURRENT_MONITOR_IDX.store(monitor_index, Ordering::SeqCst);
    }
    Ok(())
}

pub fn set_mode(mode: MonitorTargetMode, window: &WebviewWindow) -> Result<(), String> {
    {
        let mut lock = TARGET_MODE.lock().unwrap();
        *lock = mode.clone();
    }
    if let MonitorTargetMode::Fixed(idx) = mode {
        move_window_to_monitor(window, idx)?;
    }
    Ok(())
}

pub fn get_mode() -> String {
    let lock = TARGET_MODE.lock().unwrap();
    match *lock {
        MonitorTargetMode::Auto => "auto".to_string(),
        MonitorTargetMode::Fixed(idx) => format!("fixed:{}", idx),
    }
}

pub fn enforce_window_topmost(hwnd: windows::Win32::Foundation::HWND) {
    unsafe {
        let _ = SetWindowPos(
            hwnd,
            Some(HWND_TOPMOST),
            0,
            0,
            0,
            0,
            SWP_NOMOVE | SWP_NOSIZE | SWP_NOACTIVATE,
        );
    }
}

pub fn start_monitor_follower(app: tauri::AppHandle) {
    thread::spawn(move || {
        let mut was_inside_capsule = true;
        let mut zorder_tick = 0u32;

        loop {
            thread::sleep(Duration::from_millis(50));
            zorder_tick = zorder_tick.wrapping_add(1);

            if let Some(window) = app.get_webview_window("main") {
                // Periodic Z-Order enforcement (every 500ms / 10 ticks):
                // Guarantees Island-Win never sinks beneath newly opened maximized or fullscreen apps
                if zorder_tick % 10 == 0 {
                    if let Ok(raw_hwnd) = window.hwnd() {
                        enforce_window_topmost(raw_hwnd);
                    }
                }

                // Check if global cursor is inside the capsule bounding box relative to our window
                let mut pt = windows::Win32::Foundation::POINT::default();
                if unsafe { GetCursorPos(&mut pt) }.is_ok() {
                    if let Ok(win_pos) = window.outer_position() {
                        let scale = window.scale_factor().unwrap_or(1.0);
                        // Convert physical screen coordinates to logical client coordinates of our window
                        let client_x = ((pt.x - win_pos.x) as f64 / scale).round() as i32;
                        let client_y = ((pt.y - win_pos.y) as f64 / scale).round() as i32;

                        let is_inside = is_point_inside_capsule(client_x, client_y);
                        if is_inside != was_inside_capsule {
                            was_inside_capsule = is_inside;
                            // When outside: mouse passes 100% through to Spotify / browser tabs!
                            // When inside: window catches cursor events immediately (hover & clicks work 100%)!
                            let _ = window.set_ignore_cursor_events(!is_inside);
                        }
                    }
                }

                // Check if foreground app is maximized
                let our_hwnd = window.hwnd().map(|h| h.0 as isize).unwrap_or(0);
                is_foreground_window_maximized(our_hwnd);

                let mode = {
                    let lock = TARGET_MODE.lock().unwrap();
                    lock.clone()
                };

                if mode != MonitorTargetMode::Auto {
                    continue;
                }

                if let Ok(cursor) = window.cursor_position() {
                    let cx = cursor.x as i32;
                    let cy = cursor.y as i32;

                    if let Ok(monitors) = window.available_monitors() {
                        let target_idx = monitors.iter().position(|m| {
                            let pos = m.position();
                            let size = m.size();
                            cx >= pos.x
                                && cx < (pos.x + size.width as i32)
                                && cy >= pos.y
                                && cy < (pos.y + size.height as i32)
                        });

                        if let Some(idx) = target_idx {
                            let current = CURRENT_MONITOR_IDX.load(Ordering::SeqCst);
                            if idx != current {
                                let _ = move_window_to_monitor(&window, idx);
                            }
                        }
                    }
                }
            }
        }
    });
}
