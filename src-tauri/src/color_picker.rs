use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::mpsc::channel;
use std::sync::{Arc, Mutex};
use std::thread;
use tauri::{AppHandle, Emitter};
use windows::Win32::Foundation::{LPARAM, POINT, WPARAM};
use windows::Win32::Graphics::Gdi::{GetDC, GetPixel, ReleaseDC};
use windows::Win32::UI::Input::KeyboardAndMouse::{
    RegisterHotKey, UnregisterHotKey, HOT_KEY_MODIFIERS, MOD_ALT, MOD_CONTROL, MOD_NOREPEAT,
    MOD_SHIFT, MOD_WIN,
};
use windows::Win32::UI::WindowsAndMessaging::{
    DispatchMessageW, GetCursorPos, GetMessageW, PostThreadMessageW, TranslateMessage, MSG,
    WM_HOTKEY, WM_USER,
};

const HOTKEY_ID: i32 = 0x574B; // "WK" (Wink)
const WM_RELOAD_HOTKEY: u32 = WM_USER + 101;

pub fn sample_color_at_cursor() -> Result<String, String> {
    unsafe {
        let mut pt = POINT { x: 0, y: 0 };
        if GetCursorPos(&mut pt).is_err() {
            return Err("Gagal membaca posisi kursor".to_string());
        }

        let hdc = GetDC(None);
        if hdc.is_invalid() {
            return Err("Gagal mengakses Device Context layar".to_string());
        }

        let color = GetPixel(hdc, pt.x, pt.y);
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
            } else if msg.message == WM_HOTKEY && msg.wParam.0 as i32 == HOTKEY_ID {
                if let Ok(hex) = sample_color_at_cursor() {
                    // Copy directly to Windows clipboard
                    let _ = crate::clipboard::write_clipboard_text(&hex);

                    // Broadcast event to frontend
                    let _ = app.emit("palette-color-picked", serde_json::json!({ "hex": hex }));
                }
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
