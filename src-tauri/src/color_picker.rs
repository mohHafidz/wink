use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::mpsc::channel;
use std::sync::{Arc, Mutex};
use std::thread;
use tauri::{AppHandle, Emitter};
use windows::Win32::Foundation::{LPARAM, LRESULT, POINT, WPARAM};
use windows::Win32::Graphics::Gdi::{GetDC, GetPixel, ReleaseDC};
use windows::Win32::UI::Input::KeyboardAndMouse::{
    RegisterHotKey, UnregisterHotKey, HOT_KEY_MODIFIERS, MOD_ALT, MOD_CONTROL, MOD_NOREPEAT,
    MOD_SHIFT, MOD_WIN, VK_ESCAPE,
};
use windows::Win32::UI::WindowsAndMessaging::{
    CallNextHookEx, DispatchMessageW, GetCursorPos, GetMessageW, LoadCursorW, PostThreadMessageW,
    SetCursor, SetWindowsHookExW, TranslateMessage, UnhookWindowsHookEx, HHOOK, IDC_CROSS,
    KBDLLHOOKSTRUCT, MSG, MSLLHOOKSTRUCT, WH_KEYBOARD_LL, WH_MOUSE_LL, WM_HOTKEY, WM_KEYDOWN,
    WM_LBUTTONDOWN, WM_MOUSEMOVE, WM_RBUTTONDOWN, WM_USER,
};

const HOTKEY_ID: i32 = 0x574B; // "WK" (Wink)
const WM_RELOAD_HOTKEY: u32 = WM_USER + 101;
const WM_START_PICKER: u32 = WM_USER + 102;

#[derive(Clone, Copy)]
struct SyncHHook(HHOOK);
unsafe impl Send for SyncHHook {}
unsafe impl Sync for SyncHHook {}

static IS_PICKING: AtomicBool = AtomicBool::new(false);
static MOUSE_HOOK: Mutex<Option<SyncHHook>> = Mutex::new(None);
static KBD_HOOK: Mutex<Option<SyncHHook>> = Mutex::new(None);
static APP_HANDLE: Mutex<Option<AppHandle>> = Mutex::new(None);

pub fn sample_color_at_point(x: i32, y: i32) -> Result<String, String> {
    unsafe {
        let hdc = GetDC(None);
        if hdc.is_invalid() {
            return Err("Gagal mengakses Device Context layar".to_string());
        }

        let color = GetPixel(hdc, x, y);
        ReleaseDC(None, hdc);

        if color.0 == 0xFFFFFFFF {
            return Err("Gagal membaca piksel pada koordinat".to_string());
        }

        // COLORREF: 0x00bbggrr
        let r = (color.0 & 0xFF) as u8;
        let g = ((color.0 >> 8) & 0xFF) as u8;
        let b = ((color.0 >> 16) & 0xFF) as u8;

        Ok(format!("#{:02X}{:02X}{:02X}", r, g, b))
    }
}

pub fn sample_color_at_cursor() -> Result<String, String> {
    unsafe {
        let mut pt = POINT { x: 0, y: 0 };
        if GetCursorPos(&mut pt).is_err() {
            return Err("Gagal membaca posisi kursor".to_string());
        }
        sample_color_at_point(pt.x, pt.y)
    }
}

unsafe extern "system" fn mouse_proc(code: i32, wparam: WPARAM, lparam: LPARAM) -> LRESULT {
    if code >= 0 && IS_PICKING.load(Ordering::SeqCst) {
        let msg = wparam.0 as u32;

        if msg == WM_LBUTTONDOWN {
            // User clicked: Capture pixel at this exact position!
            let info = unsafe { *(lparam.0 as *const MSLLHOOKSTRUCT) };
            let hex = sample_color_at_point(info.pt.x, info.pt.y).unwrap_or_else(|_| "#000000".to_string());

            let _ = crate::clipboard::write_clipboard_text(&hex);

            if let Ok(guard) = APP_HANDLE.lock() {
                if let Some(app) = guard.as_ref() {
                    let _ = app.emit("palette-color-picked", serde_json::json!({ "hex": hex }));
                }
            }

            stop_picking_internal();
            return LRESULT(1); // Consume the click so apps underneath don't react
        } else if msg == WM_RBUTTONDOWN {
            // Right-click: Cancel selection
            if let Ok(guard) = APP_HANDLE.lock() {
                if let Some(app) = guard.as_ref() {
                    let _ = app.emit("color-picker-cancelled", ());
                }
            }
            stop_picking_internal();
            return LRESULT(1);
        } else if msg == WM_MOUSEMOVE {
            let info = unsafe { *(lparam.0 as *const MSLLHOOKSTRUCT) };
            if let Ok(hex) = sample_color_at_point(info.pt.x, info.pt.y) {
                if let Ok(guard) = APP_HANDLE.lock() {
                    if let Some(app) = guard.as_ref() {
                        let _ = app.emit(
                            "color-picker-preview",
                            serde_json::json!({ "hex": hex, "x": info.pt.x, "y": info.pt.y }),
                        );
                    }
                }
            }
            // Keep crosshair cursor during interactive picker
            unsafe {
                if let Ok(cursor) = LoadCursorW(None, IDC_CROSS) {
                    let _ = SetCursor(Some(cursor));
                }
            }
        }
    }
    unsafe { CallNextHookEx(None, code, wparam, lparam) }
}

unsafe extern "system" fn kbd_proc(code: i32, wparam: WPARAM, lparam: LPARAM) -> LRESULT {
    if code >= 0 && IS_PICKING.load(Ordering::SeqCst) {
        let msg = wparam.0 as u32;
        if msg == WM_KEYDOWN {
            let kbd = unsafe { *(lparam.0 as *const KBDLLHOOKSTRUCT) };
            if kbd.vkCode == VK_ESCAPE.0 as u32 {
                // ESC key: Cancel selection
                if let Ok(guard) = APP_HANDLE.lock() {
                    if let Some(app) = guard.as_ref() {
                        let _ = app.emit("color-picker-cancelled", ());
                    }
                }
                stop_picking_internal();
                return LRESULT(1); // Consume escape key
            }
        }
    }
    unsafe { CallNextHookEx(None, code, wparam, lparam) }
}

fn stop_picking_internal() {
    IS_PICKING.store(false, Ordering::SeqCst);
    unsafe {
        if let Ok(mut lock) = MOUSE_HOOK.lock() {
            if let Some(hook) = lock.take() {
                let _ = UnhookWindowsHookEx(hook.0);
            }
        }
        if let Ok(mut lock) = KBD_HOOK.lock() {
            if let Some(hook) = lock.take() {
                let _ = UnhookWindowsHookEx(hook.0);
            }
        }
    }
}

pub fn start_interactive_picker(app: AppHandle) {
    if IS_PICKING.load(Ordering::SeqCst) {
        return; // Already in picking mode
    }

    IS_PICKING.store(true, Ordering::SeqCst);

    if let Ok(mut guard) = APP_HANDLE.lock() {
        *guard = Some(app.clone());
    }

    let _ = app.emit("color-picker-started", ());

    unsafe {
        // Set crosshair cursor immediately
        if let Ok(cursor) = LoadCursorW(None, IDC_CROSS) {
            let _ = SetCursor(Some(cursor));
        }

        // Install Low-Level Mouse & Keyboard hooks
        if let Ok(hook) = SetWindowsHookExW(WH_MOUSE_LL, Some(mouse_proc), None, 0) {
            let mut lock = MOUSE_HOOK.lock().unwrap();
            *lock = Some(SyncHHook(hook));
        }

        if let Ok(hook) = SetWindowsHookExW(WH_KEYBOARD_LL, Some(kbd_proc), None, 0) {
            let mut lock = KBD_HOOK.lock().unwrap();
            *lock = Some(SyncHHook(hook));
        }
    }
}

pub fn cancel_interactive_picker() {
    stop_picking_internal();
}

fn parse_shortcut(shortcut_str: &str) -> (HOT_KEY_MODIFIERS, u32) {
    let mut mods = MOD_NOREPEAT;
    let mut key_code: u32 = 0x43; // Default 'C'

    let parts: Vec<&str> = shortcut_str.split('+').map(|s| s.trim()).collect();
    for part in parts {
        let upper = part.to_uppercase();
        match upper.as_str() {
            "CTRL" | "CONTROL" => mods |= MOD_CONTROL,
            "SHIFT" => mods |= MOD_SHIFT,
            "ALT" => mods |= MOD_ALT,
            "WIN" | "WINDOWS" => mods |= MOD_WIN,
            k if k.len() == 1 => {
                let ch = k.chars().next().unwrap();
                key_code = ch as u32;
            }
            "F1" => key_code = 0x70,
            "F2" => key_code = 0x71,
            "F3" => key_code = 0x72,
            "F4" => key_code = 0x73,
            "F5" => key_code = 0x74,
            "F6" => key_code = 0x75,
            "F7" => key_code = 0x76,
            "F8" => key_code = 0x77,
            "F9" => key_code = 0x78,
            "F10" => key_code = 0x79,
            "F11" => key_code = 0x7A,
            "F12" => key_code = 0x7B,
            _ => {}
        }
    }

    (mods, key_code)
}

struct HotkeyState {
    thread_id: u32,
    enabled: Arc<AtomicBool>,
    shortcut: Arc<Mutex<String>>,
}

static HOTKEY_MANAGER: Mutex<Option<HotkeyState>> = Mutex::new(None);

pub fn start_color_picker_hotkey(app: AppHandle, initial_enabled: bool, initial_shortcut: String) {
    let enabled_flag = Arc::new(AtomicBool::new(initial_enabled));
    let shortcut_str = Arc::new(Mutex::new(initial_shortcut));

    let enabled_clone = enabled_flag.clone();
    let shortcut_clone = shortcut_str.clone();

    let (tx, rx) = channel::<u32>();
    let app_clone = app.clone();

    thread::spawn(move || {
        let thread_id = unsafe { windows::Win32::System::Threading::GetCurrentThreadId() };
        let _ = tx.send(thread_id);

        let mut current_registered = false;

        let register = |shortcut: &str| -> bool {
            let (mods, vk) = parse_shortcut(shortcut);
            unsafe { RegisterHotKey(None, HOTKEY_ID, mods, vk).is_ok() }
        };

        let unregister = || {
            unsafe {
                let _ = UnregisterHotKey(None, HOTKEY_ID);
            }
        };

        if enabled_clone.load(Ordering::SeqCst) {
            let sc = shortcut_clone.lock().unwrap().clone();
            current_registered = register(&sc);
        }

        let mut msg = MSG::default();
        loop {
            let status = unsafe { GetMessageW(&mut msg, None, 0, 0) };
            if status.0 <= 0 {
                break;
            }

            if msg.message == WM_RELOAD_HOTKEY {
                if current_registered {
                    unregister();
                    current_registered = false;
                }
                if enabled_clone.load(Ordering::SeqCst) {
                    let sc = shortcut_clone.lock().unwrap().clone();
                    current_registered = register(&sc);
                }
            } else if msg.message == WM_START_PICKER {
                start_interactive_picker(app_clone.clone());
            } else if msg.message == WM_HOTKEY && msg.wParam.0 as i32 == HOTKEY_ID {
                // When global shortcut is pressed: Enter interactive selection mode!
                start_interactive_picker(app_clone.clone());
            }

            unsafe {
                let _ = TranslateMessage(&msg);
                DispatchMessageW(&msg);
            }
        }

        if current_registered {
            unregister();
        }
    });

    if let Ok(tid) = rx.recv() {
        let mut guard = HOTKEY_MANAGER.lock().unwrap();
        *guard = Some(HotkeyState {
            thread_id: tid,
            enabled: enabled_flag,
            shortcut: shortcut_str,
        });
    }
}

pub fn update_hotkey_settings(enabled: bool, shortcut: String) {
    if let Ok(guard) = HOTKEY_MANAGER.lock() {
        if let Some(state) = guard.as_ref() {
            state.enabled.store(enabled, Ordering::SeqCst);
            if let Ok(mut sc) = state.shortcut.lock() {
                *sc = shortcut;
            }
            unsafe {
                let _ = PostThreadMessageW(state.thread_id, WM_RELOAD_HOTKEY, WPARAM(0), LPARAM(0));
            }
        }
    }
}

#[allow(dead_code)]
pub fn trigger_interactive_picker_from_thread() {
    if let Ok(guard) = HOTKEY_MANAGER.lock() {
        if let Some(state) = guard.as_ref() {
            unsafe {
                let _ = PostThreadMessageW(state.thread_id, WM_START_PICKER, WPARAM(0), LPARAM(0));
            }
        }
    }
}
