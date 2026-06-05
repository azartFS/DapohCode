//! Workspace filesystem commands. Plain `std::fs` (no extra plugins) so the
//! IDE has full, explicit control over reads/writes inside the user's folder.

use regex::RegexBuilder;
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

/// Directories never worth walking when scanning/analyzing a project.
const IGNORE_DIRS: &[&str] = &[
    "node_modules", ".git", "target", "dist", "build", "out", ".next", ".nuxt",
    ".svelte-kit", ".turbo", "vendor", "__pycache__", ".venv", "venv", ".idea",
    ".vscode", ".cache", "coverage", ".gradle", ".dart_tool", "Pods",
];

/// One search match: project-relative path, 1-based line, trimmed line text.
#[derive(Serialize)]
pub struct SearchHit {
    path: String,
    line: u32,
    text: String,
}

/// Recursively collect entries under `root`, skipping IGNORE_DIRS. When
/// `include_dirs` is true, directories are pushed with a trailing slash.
fn walk(root: &Path, dir: &Path, out: &mut Vec<String>, include_dirs: bool, cap: usize) {
    if out.len() >= cap {
        return;
    }
    let rd = match fs::read_dir(dir) {
        Ok(r) => r,
        Err(_) => return,
    };
    let mut items: Vec<_> = rd.filter_map(|e| e.ok()).collect();
    items.sort_by_key(|e| e.file_name());
    for item in items {
        if out.len() >= cap {
            return;
        }
        let p = item.path();
        let name = item.file_name().to_string_lossy().to_string();
        let is_dir = p.is_dir();
        if is_dir && IGNORE_DIRS.contains(&name.as_str()) {
            continue;
        }
        let rel = p
            .strip_prefix(root)
            .unwrap_or(&p)
            .to_string_lossy()
            .replace('\\', "/");
        if is_dir {
            if include_dirs {
                out.push(format!("{}/", rel));
            }
            walk(root, &p, out, include_dirs, cap);
        } else {
            out.push(rel);
        }
    }
}

/// Recursive project tree (relative paths, folders marked with trailing '/').
/// Heavy/build dirs are skipped. Capped to keep the result manageable.
#[tauri::command]
pub fn read_tree(path: String, max_entries: Option<usize>) -> Result<Vec<String>, String> {
    let root = Path::new(&path);
    if !root.exists() {
        return Err("Путь не существует.".into());
    }
    let cap = max_entries.unwrap_or(4000).min(20000);
    let mut out: Vec<String> = Vec::new();
    walk(root, root, &mut out, true, cap);
    Ok(out)
}

/// Case-insensitive plain-text search across project files (skips heavy dirs,
/// binaries and files > 1 MB). Returns capped list of matches.
#[tauri::command]
pub fn search_text(
    path: String,
    query: String,
    max_results: Option<usize>,
) -> Result<Vec<SearchHit>, String> {
    let needle = query.trim().to_lowercase();
    if needle.is_empty() {
        return Err("Пустой запрос.".into());
    }
    let root = Path::new(&path);
    if !root.exists() {
        return Err("Путь не существует.".into());
    }

    // Collect all file paths first.
    let mut file_paths: Vec<String> = Vec::new();
    walk(root, root, &mut file_paths, false, 20000);

    let cap = max_results.unwrap_or(200).min(500);
    let mut hits: Vec<SearchHit> = Vec::new();

    for rel in &file_paths {
        if hits.len() >= cap {
            break;
        }
        let abs = root.join(rel);
        let meta = match fs::metadata(&abs) {
            Ok(m) => m,
            Err(_) => continue,
        };
        // Skip large or likely binary files.
        if meta.len() > 1_048_576 {
            continue;
        }
        let bytes = match fs::read(&abs) {
            Ok(b) => b,
            Err(_) => continue,
        };
        if bytes.iter().take(8000).any(|&b| b == 0) {
            continue;
        }
        let text = match String::from_utf8(bytes) {
            Ok(s) => s,
            Err(_) => continue,
        };
        for (i, line) in text.lines().enumerate() {
            if hits.len() >= cap {
                break;
            }
            if line.to_lowercase().contains(&needle) {
                hits.push(SearchHit {
                    path: rel.clone(),
                    line: (i + 1) as u32,
                    text: line.trim().to_string(),
                });
            }
        }
    }

    Ok(hits)
}


/// Regex search across project files. Supports optional file glob (e.g. "*.ts").
/// Skips heavy dirs, binaries, files > 1 MB. Returns capped matches.
#[tauri::command]
pub fn grep_regex(
    path: String,
    pattern: String,
    glob: Option<String>,
    max_results: Option<usize>,
) -> Result<Vec<SearchHit>, String> {
    let re = RegexBuilder::new(pattern.trim())
        .case_insensitive(true)
        .build()
        .map_err(|e| format!("Некорректное регулярное выражение: {e}"))?;

    let root = Path::new(&path);
    if !root.exists() {
        return Err("Путь не существует.".into());
    }

    // Collect all file paths.
    let mut file_paths: Vec<String> = Vec::new();
    walk(root, root, &mut file_paths, false, 20000);

    // Optional glob filter (simple: *.ext or **/*.ext)
    let ext_filter: Option<String> = glob.as_deref().and_then(|g| {
        let g = g.trim();
        if let Some(ext) = g.strip_prefix("*.") {
            Some(ext.to_lowercase())
        } else if let Some(ext) = g.strip_prefix("**/*.") {
            Some(ext.to_lowercase())
        } else {
            None
        }
    });

    let cap = max_results.unwrap_or(200).min(500);
    let mut hits: Vec<SearchHit> = Vec::new();

    for rel in &file_paths {
        if hits.len() >= cap {
            break;
        }
        // Apply extension filter
        if let Some(ref ext) = ext_filter {
            let lower = rel.to_lowercase();
            if !lower.ends_with(&format!(".{ext}")) {
                continue;
            }
        }
        let abs = root.join(rel);
        let meta = match fs::metadata(&abs) {
            Ok(m) => m,
            Err(_) => continue,
        };
        if meta.len() > 1_048_576 {
            continue;
        }
        let bytes = match fs::read(&abs) {
            Ok(b) => b,
            Err(_) => continue,
        };
        if bytes.iter().take(8000).any(|&b| b == 0) {
            continue;
        }
        let text = match String::from_utf8(bytes) {
            Ok(s) => s,
            Err(_) => continue,
        };
        for (i, line) in text.lines().enumerate() {
            if hits.len() >= cap {
                break;
            }
            if re.is_match(line) {
                hits.push(SearchHit {
                    path: rel.clone(),
                    line: (i + 1) as u32,
                    text: line.trim().to_string(),
                });
            }
        }
    }

    Ok(hits)
}

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
    // Auto-create parent directories if they don't exist.
    if let Some(parent) = Path::new(&path).parent() {
        if !parent.exists() {
            fs::create_dir_all(parent).map_err(|e| e.to_string())?;
        }
    }
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
