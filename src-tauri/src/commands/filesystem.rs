use std::fs;
use std::path::Path;

use ignore::WalkBuilder;
use serde::{Deserialize, Serialize};

use crate::error::{AppError, AppResult};

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct FileEntry {
    pub name: String,
    pub path: String,
    pub is_dir: bool,
    pub size: u64,
    pub extension: Option<String>,
}

/// List directory contents, respecting .gitignore.
/// Returns immediate children only (lazy tree loading).
/// Sorted: directories first, then alphabetical.
#[tauri::command]
pub async fn list_dir(path: String) -> AppResult<Vec<FileEntry>> {
    let dir_path = Path::new(&path);
    if !dir_path.is_dir() {
        return Err(AppError::Custom(format!("Not a directory: {}", path)));
    }

    let mut entries: Vec<FileEntry> = Vec::new();

    let walker = WalkBuilder::new(&path)
        .max_depth(Some(1))
        .hidden(false) // show dotfiles at top level
        .git_ignore(true)
        .git_global(true)
        .git_exclude(true)
        .build();

    for result in walker {
        let entry = match result {
            Ok(e) => e,
            Err(_) => continue,
        };

        // Skip the root directory itself
        if entry.path() == dir_path {
            continue;
        }

        let metadata = match entry.metadata() {
            Ok(m) => m,
            Err(_) => continue,
        };

        let name = entry.file_name().to_string_lossy().to_string();

        // Skip .git directory
        if name == ".git" {
            continue;
        }

        let file_path = entry.path().to_string_lossy().to_string();
        let is_dir = metadata.is_dir();
        let size = if is_dir { 0 } else { metadata.len() };
        let extension = if is_dir {
            None
        } else {
            entry
                .path()
                .extension()
                .and_then(|e| e.to_str())
                .map(|s| s.to_string())
        };

        entries.push(FileEntry {
            name,
            path: file_path,
            is_dir,
            size,
            extension,
        });
    }

    // Sort: directories first, then alphabetical (case-insensitive)
    entries.sort_by(|a, b| match (a.is_dir, b.is_dir) {
        (true, false) => std::cmp::Ordering::Less,
        (false, true) => std::cmp::Ordering::Greater,
        _ => a.name.to_lowercase().cmp(&b.name.to_lowercase()),
    });

    Ok(entries)
}

/// Read file contents as a string.
/// Rejects files > 5MB or binary files (null bytes in first 8KB).
#[tauri::command]
pub async fn read_file(path: String) -> AppResult<String> {
    let file_path = Path::new(&path);

    if !file_path.is_file() {
        return Err(AppError::Custom(format!("Not a file: {}", path)));
    }

    let metadata = fs::metadata(&path)?;
    let size = metadata.len();

    if size > 5 * 1024 * 1024 {
        return Err(AppError::Custom(format!(
            "File too large ({} bytes). Maximum is 5MB.",
            size
        )));
    }

    // Read first 8KB for binary detection
    let content = fs::read(&path)?;

    let check_len = std::cmp::min(content.len(), 8192);
    if content[..check_len].contains(&0u8) {
        return Err(AppError::Custom(
            "Binary file — cannot display.".to_string(),
        ));
    }

    String::from_utf8(content).map_err(|_| AppError::Custom("File is not valid UTF-8.".to_string()))
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;
    use tempfile::tempdir;

    #[tokio::test]
    async fn list_dir_returns_entries() {
        let dir = tempdir().unwrap();
        fs::write(dir.path().join("hello.txt"), "world").unwrap();
        fs::create_dir(dir.path().join("subdir")).unwrap();

        let entries = list_dir(dir.path().to_string_lossy().to_string())
            .await
            .unwrap();

        assert!(entries.len() >= 2);
        // Directories should come first
        assert!(entries[0].is_dir);
        assert_eq!(entries[0].name, "subdir");
    }

    #[tokio::test]
    async fn read_file_works() {
        let dir = tempdir().unwrap();
        let file = dir.path().join("test.txt");
        fs::write(&file, "hello world").unwrap();

        let content = read_file(file.to_string_lossy().to_string()).await.unwrap();
        assert_eq!(content, "hello world");
    }

    #[tokio::test]
    async fn read_file_rejects_binary() {
        let dir = tempdir().unwrap();
        let file = dir.path().join("binary.bin");
        fs::write(&file, b"\x00\x01\x02\x03").unwrap();

        let result = read_file(file.to_string_lossy().to_string()).await;
        assert!(result.is_err());
    }

    #[tokio::test]
    async fn list_dir_empty_directory() {
        let dir = tempdir().unwrap();
        let entries = list_dir(dir.path().to_string_lossy().to_string())
            .await
            .unwrap();
        assert!(entries.is_empty());
    }

    #[tokio::test]
    async fn list_dir_sorts_dirs_before_files() {
        let dir = tempdir().unwrap();
        fs::write(dir.path().join("z_file.txt"), "content").unwrap();
        fs::create_dir(dir.path().join("a_dir")).unwrap();
        fs::write(dir.path().join("a_file.txt"), "content").unwrap();

        let entries = list_dir(dir.path().to_string_lossy().to_string())
            .await
            .unwrap();

        // First entry should be a directory
        assert!(entries[0].is_dir, "first entry should be directory");
        assert_eq!(entries[0].name, "a_dir");

        // Files should be sorted alphabetically after dirs
        let file_names: Vec<&str> = entries
            .iter()
            .filter(|e| !e.is_dir)
            .map(|e| e.name.as_str())
            .collect();
        assert_eq!(file_names, vec!["a_file.txt", "z_file.txt"]);
    }

    #[tokio::test]
    async fn list_dir_includes_extensions() {
        let dir = tempdir().unwrap();
        fs::write(dir.path().join("code.rs"), "fn main() {}").unwrap();
        fs::write(dir.path().join("data.json"), "{}").unwrap();
        fs::write(dir.path().join("no_ext"), "data").unwrap();

        let entries = list_dir(dir.path().to_string_lossy().to_string())
            .await
            .unwrap();

        let rs_file = entries.iter().find(|e| e.name == "code.rs").unwrap();
        assert_eq!(rs_file.extension, Some("rs".to_string()));

        let json_file = entries.iter().find(|e| e.name == "data.json").unwrap();
        assert_eq!(json_file.extension, Some("json".to_string()));

        let no_ext = entries.iter().find(|e| e.name == "no_ext").unwrap();
        assert_eq!(no_ext.extension, None);
    }

    #[tokio::test]
    async fn list_dir_reports_file_size() {
        let dir = tempdir().unwrap();
        fs::write(dir.path().join("file.txt"), "12345").unwrap();
        fs::create_dir(dir.path().join("subdir")).unwrap();

        let entries = list_dir(dir.path().to_string_lossy().to_string())
            .await
            .unwrap();

        let file = entries.iter().find(|e| e.name == "file.txt").unwrap();
        assert_eq!(file.size, 5);

        let subdir = entries.iter().find(|e| e.name == "subdir").unwrap();
        assert_eq!(subdir.size, 0); // dirs report size 0
    }

    #[tokio::test]
    async fn read_file_nonexistent_returns_error() {
        let result = read_file("/tmp/totally_nonexistent_file_xyz.txt".to_string()).await;
        assert!(result.is_err());
    }

    #[tokio::test]
    async fn read_file_directory_returns_error() {
        let dir = tempdir().unwrap();
        let result = read_file(dir.path().to_string_lossy().to_string()).await;
        assert!(result.is_err());
    }

    #[tokio::test]
    async fn list_dir_excludes_git_directory() {
        let dir = tempdir().unwrap();
        // Simulate a .git directory
        fs::create_dir(dir.path().join(".git")).unwrap();
        fs::write(dir.path().join("file.txt"), "content").unwrap();

        let entries = list_dir(dir.path().to_string_lossy().to_string())
            .await
            .unwrap();

        let names: Vec<&str> = entries.iter().map(|e| e.name.as_str()).collect();
        assert!(!names.contains(&".git"));
        assert!(names.contains(&"file.txt"));
    }

    #[test]
    fn file_entry_serializes_to_camel_case() {
        let entry = FileEntry {
            name: "test.rs".to_string(),
            path: "/tmp/test.rs".to_string(),
            is_dir: false,
            size: 100,
            extension: Some("rs".to_string()),
        };
        let json = serde_json::to_value(&entry).unwrap();
        assert!(json.get("isDir").is_some());
        assert!(json.get("is_dir").is_none());
    }
}
