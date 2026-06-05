//! Workspace filesystem commands. Plain `std::fs` (no extra plugins) so the
//! IDE has full, explicit control over reads/writes inside the user's folder.

use serde::Serialize;
use std::fs;
use std::path::Path;

/// One entry in a directory listing.
#[derive(Serialize)]
pub struct FsEntry {
    name: String,
    path: String,
    is_dir: bool,
}

/// Hard cap for opening a file as text (2 MB).
const MAX_FILE_BYTES: u64 = 2 * 1024 * 1024;

/// List a single directory level (lazy tree expansion). Directories first,
/// then files, each alphabetically (case-insensitive).
#[tauri::command]
pub fn read_dir(path: String) -> Result<Vec<FsEntry>, String> {
    let mut entries: Vec<FsEntry> = Vec::new();
    let rd = fs::read_dir(&path).map_err(|e| e.to_string())?;
    for item in rd {
        let item = item.map_err(|e| e.to_string())?;
        let p = item.path();
        let is_dir = p.is_dir();
        entries.push(FsEntry {
            name: item.file_name().to_string_lossy().to_string(),
            path: p.to_string_lossy().to_string(),
            is_dir,
        });
    }
    entries.sort_by(|a, b| match (a.is_dir, b.is_dir) {
        (true, false) => std::cmp::Ordering::Less,
        (false, true) => std::cmp::Ordering::Greater,
        _ => a.name.to_lowercase().cmp(&b.name.to_lowercase()),
    });
    Ok(entries)
}

/// Read a file as UTF-8 text, rejecting oversized or binary files.
#[tauri::command]
pub fn read_text_file(path: String) -> Result<String, String> {
    let meta = fs::metadata(&path).map_err(|e| e.to_string())?;
    if meta.len() > MAX_FILE_BYTES {
        return Err(format!(
            "Файл слишком большой ({} КБ). Лимит — 2 МБ.",
            meta.len() / 1024
        ));
    }
    let bytes = fs::read(&path).map_err(|e| e.to_string())?;
    if bytes.iter().take(8000).any(|&b| b == 0) {
        return Err("Бинарный файл — нельзя открыть как текст.".into());
    }
    String::from_utf8(bytes).map_err(|_| "Файл не в кодировке UTF-8.".to_string())
}

/// Overwrite a file with new text content.
#[tauri::command]
pub fn write_text_file(path: String, content: String) -> Result<(), String> {
    fs::write(&path, content).map_err(|e| e.to_string())
}

/// Create a new file or folder inside `parent`. Returns the created path.
#[tauri::command]
pub fn create_entry(parent: String, name: String, is_dir: bool) -> Result<String, String> {
    let trimmed = name.trim();
    if trimmed.is_empty() {
        return Err("Пустое имя.".into());
    }
    let p = Path::new(&parent).join(trimmed);
    if p.exists() {
        return Err("Уже существует.".into());
    }
    if is_dir {
        fs::create_dir_all(&p).map_err(|e| e.to_string())?;
    } else {
        if let Some(dir) = p.parent() {
            fs::create_dir_all(dir).map_err(|e| e.to_string())?;
        }
        fs::write(&p, "").map_err(|e| e.to_string())?;
    }
    Ok(p.to_string_lossy().to_string())
}

/// Rename a file or folder in place. Returns the new path.
#[tauri::command]
pub fn rename_entry(path: String, new_name: String) -> Result<String, String> {
    let trimmed = new_name.trim();
    if trimmed.is_empty() {
        return Err("Пустое имя.".into());
    }
    let p = Path::new(&path);
    let parent = p.parent().ok_or("Нет родительской папки.")?;
    let np = parent.join(trimmed);
    if np.exists() {
        return Err("Уже существует.".into());
    }
    fs::rename(p, &np).map_err(|e| e.to_string())?;
    Ok(np.to_string_lossy().to_string())
}

/// Delete a file (or folder recursively).
#[tauri::command]
pub fn delete_entry(path: String) -> Result<(), String> {
    let p = Path::new(&path);
    if p.is_dir() {
        fs::remove_dir_all(p).map_err(|e| e.to_string())
    } else {
        fs::remove_file(p).map_err(|e| e.to_string())
    }
}
