use serde::{Deserialize, Serialize};
use std::sync::Mutex;
use std::thread;
use std::time::Duration;
use windows::Win32::Foundation::{HGLOBAL, HANDLE};
use windows::Win32::System::DataExchange::{
    CloseClipboard, EmptyClipboard, GetClipboardData, GetClipboardSequenceNumber, OpenClipboard,
    SetClipboardData,
};
use windows::Win32::System::Memory::{GlobalAlloc, GlobalLock, GlobalUnlock, GMEM_MOVEABLE};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ClipboardItem {
    pub id: String,
    pub item_type: String,
    pub content: String,
    pub time: String,
}

static CLIPBOARD_HISTORY: Mutex<Vec<ClipboardItem>> = Mutex::new(Vec::new());
static LAST_SEQUENCE: Mutex<u32> = Mutex::new(0);

fn detect_type(text: &str) -> &'static str {
    let trimmed = text.trim();
    if trimmed.starts_with("http://") || trimmed.starts_with("https://") || trimmed.starts_with("www.") {
        "URL"
    } else if (trimmed.starts_with('#') && (trimmed.len() == 4 || trimmed.len() == 7 || trimmed.len() == 9))
        && trimmed[1..].chars().all(|c| c.is_ascii_hexdigit())
    {
        "COLOR"
    } else if trimmed.contains("function")
        || trimmed.contains("const ")
        || trimmed.contains("let ")
        || trimmed.contains("var ")
        || trimmed.contains("class ")
        || trimmed.contains("import ")
        || trimmed.contains("export ")
        || trimmed.contains("=>")
        || trimmed.contains("pub fn ")
        || (trimmed.contains('{') && trimmed.contains('}'))
        || (trimmed.lines().count() > 1 && trimmed.contains("    "))
    {
        "CODE"
    } else {
        "TEXT"
    }
}

pub fn read_clipboard_text() -> Option<String> {
    unsafe {
        if OpenClipboard(None).is_err() {
            return None;
        }

        // 13 = CF_UNICODETEXT
        let handle = match GetClipboardData(13) {
            Ok(h) => h,
            Err(_) => {
                let _ = CloseClipboard();
                return None;
            }
        };

        let ptr = GlobalLock(HGLOBAL(handle.0));
        if ptr.is_null() {
            let _ = CloseClipboard();
            return None;
        }

        let mut len = 0;
        let mut curr = ptr as *const u16;
        while *curr != 0 {
            len += 1;
            curr = curr.add(1);
        }

        let wide_slice = std::slice::from_raw_parts(ptr as *const u16, len);
        let text = String::from_utf16_lossy(wide_slice);

        let _ = GlobalUnlock(HGLOBAL(handle.0));
        let _ = CloseClipboard();

        Some(text)
    }
}

pub fn write_clipboard_text(text: &str) -> Result<(), String> {
    unsafe {
        OpenClipboard(None).map_err(|e| format!("OpenClipboard failed: {:?}", e))?;
        let _ = EmptyClipboard();

        let wide: Vec<u16> = text.encode_utf16().chain(std::iter::once(0)).collect();
        let bytes_size = wide.len() * 2;

        let hglobal = GlobalAlloc(GMEM_MOVEABLE, bytes_size)
            .map_err(|e| format!("GlobalAlloc failed: {:?}", e))?;

        let ptr = GlobalLock(hglobal);
        if ptr.is_null() {
            let _ = CloseClipboard();
            return Err("GlobalLock failed".to_string());
        }

        std::ptr::copy_nonoverlapping(wide.as_ptr() as *const u8, ptr as *mut u8, bytes_size);
        let _ = GlobalUnlock(hglobal);

        let _ = SetClipboardData(13, Some(HANDLE(hglobal.0)));
        let _ = CloseClipboard();

        // Update sequence so we don't duplicate on our own write
        let current_seq = GetClipboardSequenceNumber();
        let mut seq_lock = LAST_SEQUENCE.lock().unwrap();
        *seq_lock = current_seq;

        Ok(())
    }
}

pub fn init_clipboard_listener() {
    // Initial read
    if let Some(text) = read_clipboard_text() {
        let trimmed = text.trim();
        if !trimmed.is_empty() {
            let item = ClipboardItem {
                id: format!("c_{}", std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).unwrap().as_millis()),
                item_type: detect_type(trimmed).to_string(),
                content: text,
                time: "Baru saja".to_string(),
            };
            let mut hist = CLIPBOARD_HISTORY.lock().unwrap();
            hist.push(item);
        }
    }

    unsafe {
        let current_seq = GetClipboardSequenceNumber();
        let mut seq_lock = LAST_SEQUENCE.lock().unwrap();
        *seq_lock = current_seq;
    }

    thread::spawn(move || {
        loop {
            thread::sleep(Duration::from_millis(500));

            unsafe {
                let current_seq = GetClipboardSequenceNumber();
                let mut seq_lock = LAST_SEQUENCE.lock().unwrap();
                if current_seq != *seq_lock {
                    *seq_lock = current_seq;
                    drop(seq_lock);

                    if let Some(text) = read_clipboard_text() {
                        let trimmed = text.trim();
                        if !trimmed.is_empty() {
                            let mut hist = CLIPBOARD_HISTORY.lock().unwrap();
                            // Deduplicate if identical to top item
                            if hist.first().map(|f| f.content.as_str()) != Some(&text) {
                                let item = ClipboardItem {
                                    id: format!("c_{}", std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).unwrap().as_millis()),
                                    item_type: detect_type(trimmed).to_string(),
                                    content: text,
                                    time: "Baru saja".to_string(),
                                };
                                hist.insert(0, item);
                                if hist.len() > 30 {
                                    hist.truncate(30);
                                }
                            }
                        }
                    }
                }
            }
        }
    });
}

pub fn get_history() -> Vec<ClipboardItem> {
    let hist = CLIPBOARD_HISTORY.lock().unwrap();
    hist.clone()
}

pub fn clear_history() {
    let mut hist = CLIPBOARD_HISTORY.lock().unwrap();
    hist.clear();
}

pub fn remove_item(id: &str) {
    let mut hist = CLIPBOARD_HISTORY.lock().unwrap();
    hist.retain(|i| i.id != id);
}
