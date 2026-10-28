use serde::{Deserialize, Serialize};
use std::fs;
use std::path::Path;
use std::process::Command;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ShelfFileInfo {
    pub id: String,
    pub name: String,
    pub path: String,
    pub size: String,
    pub ext: String,
    pub color: String,
}

fn format_bytes(bytes: u64) -> String {
    if bytes >= 1_073_741_824 {
        format!("{:.1} GB", bytes as f64 / 1_073_741_824.0)
    } else if bytes >= 1_048_576 {
        format!("{:.1} MB", bytes as f64 / 1_048_576.0)
    } else if bytes >= 1_024 {
        format!("{:.1} KB", bytes as f64 / 1_024.0)
    } else {
        format!("{} B", bytes)
    }
}

fn pick_color_for_ext(ext: &str) -> &'static str {
    match ext.to_uppercase().as_str() {
        "PNG" | "JPG" | "JPEG" | "WEBP" | "GIF" | "SVG" | "FIG" => "#A8C4FF", // Soft Periwinkle
        "PDF" | "DOC" | "DOCX" | "TXT" | "MD" => "#FFBDBD",                   // Soft Coral
        "RS" | "TS" | "TSX" | "JS" | "JSX" | "PY" | "JSON" | "HTML" => "#A0DFBD", // Soft Sage
        "ZIP" | "RAR" | "7Z" | "TAR" | "GZ" => "#FDE2A7",                     // Soft Amber
        _ => "#C2D4FF",
    }
}

pub fn inspect_file(file_path: &str) -> Result<ShelfFileInfo, String> {
    let p = Path::new(file_path);
    if !p.exists() {
        return Err(format!("File does not exist: {}", file_path));
    }

    let meta = fs::metadata(p).map_err(|e| format!("{:?}", e))?;
    let size = format_bytes(meta.len());
    let name = p
        .file_name()
        .map(|n| n.to_string_lossy().to_string())
        .unwrap_or_else(|| "Unknown".to_string());

    let ext = p
        .extension()
        .map(|e| e.to_string_lossy().to_string().to_uppercase())
        .unwrap_or_else(|| "FILE".to_string());

    let color = pick_color_for_ext(&ext).to_string();
    let id = format!("f_{}_{}", name, meta.len());

    Ok(ShelfFileInfo {
        id,
        name,
        path: file_path.to_string(),
        size,
        ext,
        color,
    })
}

pub fn reveal_in_explorer(file_path: &str) -> Result<(), String> {
    Command::new("explorer")
        .args(["/select,", file_path])
        .spawn()
        .map_err(|e| format!("Failed to open Explorer: {:?}", e))?;
    Ok(())
}
