use std::process::Command;

use serde::{Deserialize, Serialize};

use crate::error::{AppError, AppResult};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

fn run_git(worktree_path: &str, args: &[&str]) -> AppResult<String> {
    let output = Command::new("git")
        .args(args)
        .current_dir(worktree_path)
        .output()?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        return Err(AppError::Custom(format!(
            "git {} failed: {}",
            args.first().unwrap_or(&""),
            stderr.trim()
        )));
    }

    Ok(String::from_utf8_lossy(&output.stdout).to_string())
}

fn run_git_allow_failure(worktree_path: &str, args: &[&str]) -> String {
    let output = Command::new("git")
        .args(args)
        .current_dir(worktree_path)
        .output();

    match output {
        Ok(o) => String::from_utf8_lossy(&o.stdout).to_string(),
        Err(_) => String::new(),
    }
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct ChangedFile {
    pub path: String,
    pub status: String,
    pub staged: bool,
    pub old_path: Option<String>,
}

// ---------------------------------------------------------------------------
// Status char to human-readable status
// ---------------------------------------------------------------------------

fn status_char_to_string(c: char) -> &'static str {
    match c {
        'M' => "modified",
        'A' => "added",
        'D' => "deleted",
        'R' => "renamed",
        'C' => "copied",
        'T' => "typechange",
        _ => "modified",
    }
}

// ---------------------------------------------------------------------------
// Commands
// ---------------------------------------------------------------------------

/// Get all changed files (staged + unstaged + untracked) using git status --porcelain=v2.
#[tauri::command]
pub async fn get_changed_files(worktree_path: String) -> AppResult<Vec<ChangedFile>> {
    let output = run_git(&worktree_path, &["status", "--porcelain=v2"])?;
    let mut files: Vec<ChangedFile> = Vec::new();

    for line in output.lines() {
        if line.starts_with("1 ") {
            // Ordinary changed entry: 1 XY sub mH mI mW hH hI path
            let parts: Vec<&str> = line.splitn(9, ' ').collect();
            if parts.len() < 9 {
                continue;
            }
            let xy = parts[1];
            let path = parts[8].to_string();
            let x = xy.chars().next().unwrap_or('.');
            let y = xy.chars().nth(1).unwrap_or('.');

            if x != '.' {
                files.push(ChangedFile {
                    path: path.clone(),
                    status: status_char_to_string(x).to_string(),
                    staged: true,
                    old_path: None,
                });
            }
            if y != '.' {
                files.push(ChangedFile {
                    path,
                    status: status_char_to_string(y).to_string(),
                    staged: false,
                    old_path: None,
                });
            }
        } else if line.starts_with("2 ") {
            // Rename/copy: 2 XY sub mH mI mW hH hI X{score} path\torigPath
            let parts: Vec<&str> = line.splitn(10, ' ').collect();
            if parts.len() < 10 {
                continue;
            }
            let xy = parts[1];
            let paths_part = parts[9];
            let path_parts: Vec<&str> = paths_part.split('\t').collect();
            let new_path = path_parts[0].to_string();
            let old_path = path_parts.get(1).map(|s| s.to_string());

            let x = xy.chars().next().unwrap_or('.');
            let y = xy.chars().nth(1).unwrap_or('.');

            if x != '.' {
                files.push(ChangedFile {
                    path: new_path.clone(),
                    status: status_char_to_string(x).to_string(),
                    staged: true,
                    old_path: old_path.clone(),
                });
            }
            if y != '.' {
                files.push(ChangedFile {
                    path: new_path,
                    status: status_char_to_string(y).to_string(),
                    staged: false,
                    old_path,
                });
            }
        } else if line.starts_with("? ") {
            // Untracked
            let path = line.strip_prefix("? ").unwrap().to_string();
            files.push(ChangedFile {
                path,
                status: "untracked".to_string(),
                staged: false,
                old_path: None,
            });
        }
        // Skip '!' (ignored) and other header lines
    }

    Ok(files)
}

/// Stage specific files.
#[tauri::command]
pub async fn git_stage_files(worktree_path: String, paths: Vec<String>) -> AppResult<()> {
    if paths.is_empty() {
        return Ok(());
    }
    let mut args = vec!["add", "--"];
    let path_refs: Vec<&str> = paths.iter().map(|s| s.as_str()).collect();
    args.extend(path_refs);
    run_git(&worktree_path, &args)?;
    Ok(())
}

/// Unstage specific files.
#[tauri::command]
pub async fn git_unstage_files(worktree_path: String, paths: Vec<String>) -> AppResult<()> {
    if paths.is_empty() {
        return Ok(());
    }
    let mut args = vec!["reset", "HEAD", "--"];
    let path_refs: Vec<&str> = paths.iter().map(|s| s.as_str()).collect();
    args.extend(path_refs);
    run_git(&worktree_path, &args)?;
    Ok(())
}

/// Discard working tree changes for specific files.
#[tauri::command]
pub async fn git_discard_files(worktree_path: String, paths: Vec<String>) -> AppResult<()> {
    if paths.is_empty() {
        return Ok(());
    }

    // First get status to know which files are untracked
    let changed = get_changed_files(worktree_path.clone()).await?;
    let untracked: std::collections::HashSet<&str> = changed
        .iter()
        .filter(|f| f.status == "untracked")
        .map(|f| f.path.as_str())
        .collect();

    let mut tracked_paths: Vec<&str> = Vec::new();

    for path in &paths {
        if untracked.contains(path.as_str()) {
            // Delete untracked file
            let full_path = std::path::Path::new(&worktree_path).join(path);
            if full_path.exists() {
                let _ = std::fs::remove_file(&full_path);
            }
        } else {
            tracked_paths.push(path.as_str());
        }
    }

    if !tracked_paths.is_empty() {
        let mut args = vec!["checkout", "--"];
        args.extend(tracked_paths);
        run_git(&worktree_path, &args)?;
    }

    Ok(())
}

/// Get diff for a specific file.
#[tauri::command]
pub async fn get_file_diff(
    worktree_path: String,
    file_path: String,
    staged: bool,
) -> AppResult<String> {
    let mut args = vec!["diff"];
    if staged {
        args.push("--cached");
    }
    args.push("--");
    args.push(&file_path);
    run_git(&worktree_path, &args)
}

/// Get file content at HEAD (for diff comparison).
/// Returns empty string if file doesn't exist in HEAD (new file).
#[tauri::command]
pub async fn get_file_at_head(worktree_path: String, file_path: String) -> AppResult<String> {
    let ref_path = format!("HEAD:{}", file_path);
    Ok(run_git_allow_failure(&worktree_path, &["show", &ref_path]))
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;
    use std::process::Command as StdCommand;
    use tempfile::tempdir;

    fn init_repo() -> tempfile::TempDir {
        let dir = tempdir().unwrap();
        StdCommand::new("git")
            .args(["init"])
            .current_dir(dir.path())
            .output()
            .unwrap();
        StdCommand::new("git")
            .args(["config", "user.email", "test@test.com"])
            .current_dir(dir.path())
            .output()
            .unwrap();
        StdCommand::new("git")
            .args(["config", "user.name", "test"])
            .current_dir(dir.path())
            .output()
            .unwrap();
        // Disable global hooks and GPG signing that interfere with test commits
        StdCommand::new("git")
            .args(["config", "core.hooksPath", "/dev/null"])
            .current_dir(dir.path())
            .output()
            .unwrap();
        StdCommand::new("git")
            .args(["config", "commit.gpgSign", "false"])
            .current_dir(dir.path())
            .output()
            .unwrap();
        // Ignore OS-generated files
        fs::write(dir.path().join(".gitignore"), ".DS_Store\nThumbs.db\n").unwrap();
        fs::write(dir.path().join("initial.txt"), "hello").unwrap();
        StdCommand::new("git")
            .args(["add", "."])
            .current_dir(dir.path())
            .output()
            .unwrap();
        StdCommand::new("git")
            .args(["commit", "--no-gpg-sign", "--no-verify", "-m", "initial"])
            .current_dir(dir.path())
            .output()
            .unwrap();
        dir
    }

    #[tokio::test]
    async fn get_changed_files_after_clean_commit() {
        let repo = init_repo();
        let repo_path = repo.path().to_string_lossy().to_string();

        // Clean up any stray files (.DS_Store etc)
        let _ = StdCommand::new("git")
            .args(["add", "."])
            .current_dir(repo.path())
            .output();
        let _ = StdCommand::new("git")
            .args([
                "commit",
                "--no-gpg-sign",
                "--no-verify",
                "-m",
                "cleanup",
                "--allow-empty",
            ])
            .current_dir(repo.path())
            .output();

        let files = get_changed_files(repo_path).await.unwrap();
        // Filter out any OS-generated files
        let real_files: Vec<_> = files
            .iter()
            .filter(|f| !f.path.contains(".DS_Store"))
            .collect();
        assert!(
            real_files.is_empty(),
            "unexpected changes: {:?}",
            real_files
        );
    }

    #[tokio::test]
    async fn get_changed_files_modified() {
        let repo = init_repo();
        let repo_path = repo.path().to_string_lossy().to_string();

        fs::write(repo.path().join("initial.txt"), "modified").unwrap();
        let files = get_changed_files(repo_path).await.unwrap();
        assert_eq!(files.len(), 1);
        assert_eq!(files[0].status, "modified");
        assert!(!files[0].staged);
    }

    #[tokio::test]
    async fn stage_and_unstage() {
        let repo = init_repo();
        let repo_path = repo.path().to_string_lossy().to_string();

        fs::write(repo.path().join("new.txt"), "content").unwrap();
        git_stage_files(repo_path.clone(), vec!["new.txt".to_string()])
            .await
            .unwrap();

        let files = get_changed_files(repo_path.clone()).await.unwrap();
        let staged: Vec<_> = files.iter().filter(|f| f.staged).collect();
        assert_eq!(staged.len(), 1);
        assert_eq!(staged[0].status, "added");

        git_unstage_files(repo_path.clone(), vec!["new.txt".to_string()])
            .await
            .unwrap();

        let files = get_changed_files(repo_path).await.unwrap();
        let staged: Vec<_> = files.iter().filter(|f| f.staged).collect();
        assert!(staged.is_empty());
    }

    #[tokio::test]
    async fn get_file_diff_works() {
        let repo = init_repo();
        let repo_path = repo.path().to_string_lossy().to_string();

        fs::write(repo.path().join("initial.txt"), "modified content").unwrap();
        let diff = get_file_diff(repo_path, "initial.txt".to_string(), false)
            .await
            .unwrap();
        assert!(diff.contains("modified content"));
    }

    #[test]
    fn status_char_to_string_all_variants() {
        assert_eq!(status_char_to_string('M'), "modified");
        assert_eq!(status_char_to_string('A'), "added");
        assert_eq!(status_char_to_string('D'), "deleted");
        assert_eq!(status_char_to_string('R'), "renamed");
        assert_eq!(status_char_to_string('C'), "copied");
        assert_eq!(status_char_to_string('T'), "typechange");
        // Unknown chars default to "modified"
        assert_eq!(status_char_to_string('X'), "modified");
        assert_eq!(status_char_to_string('U'), "modified");
    }

    #[tokio::test]
    async fn get_changed_files_untracked() {
        let repo = init_repo();
        let repo_path = repo.path().to_string_lossy().to_string();

        fs::write(repo.path().join("new_file.txt"), "new content").unwrap();
        let files = get_changed_files(repo_path).await.unwrap();

        let untracked: Vec<_> = files.iter().filter(|f| f.status == "untracked").collect();
        assert_eq!(untracked.len(), 1);
        assert_eq!(untracked[0].path, "new_file.txt");
        assert!(!untracked[0].staged);
    }

    #[tokio::test]
    async fn stage_empty_paths_is_noop() {
        let repo = init_repo();
        let repo_path = repo.path().to_string_lossy().to_string();
        // Should not error on empty paths
        git_stage_files(repo_path.clone(), vec![]).await.unwrap();
        git_unstage_files(repo_path, vec![]).await.unwrap();
    }

    #[tokio::test]
    async fn discard_empty_paths_is_noop() {
        let repo = init_repo();
        let repo_path = repo.path().to_string_lossy().to_string();
        git_discard_files(repo_path, vec![]).await.unwrap();
    }

    #[tokio::test]
    async fn discard_untracked_file_deletes_it() {
        let repo = init_repo();
        let repo_path = repo.path().to_string_lossy().to_string();

        let new_file = repo.path().join("temp.txt");
        fs::write(&new_file, "temporary").unwrap();
        assert!(new_file.exists());

        git_discard_files(repo_path, vec!["temp.txt".to_string()])
            .await
            .unwrap();
        assert!(!new_file.exists());
    }

    #[tokio::test]
    async fn discard_tracked_file_restores_it() {
        let repo = init_repo();
        let repo_path = repo.path().to_string_lossy().to_string();

        fs::write(repo.path().join("initial.txt"), "changed").unwrap();
        git_discard_files(repo_path.clone(), vec!["initial.txt".to_string()])
            .await
            .unwrap();

        let content = fs::read_to_string(repo.path().join("initial.txt")).unwrap();
        assert_eq!(content, "hello");
    }

    #[tokio::test]
    async fn get_file_at_head_existing_file() {
        let repo = init_repo();
        let repo_path = repo.path().to_string_lossy().to_string();

        let content = get_file_at_head(repo_path, "initial.txt".to_string())
            .await
            .unwrap();
        assert_eq!(content.trim(), "hello");
    }

    #[tokio::test]
    async fn get_file_at_head_new_file_returns_empty() {
        let repo = init_repo();
        let repo_path = repo.path().to_string_lossy().to_string();

        let content = get_file_at_head(repo_path, "nonexistent.txt".to_string())
            .await
            .unwrap();
        assert!(content.is_empty());
    }

    #[tokio::test]
    async fn get_file_diff_staged() {
        let repo = init_repo();
        let repo_path = repo.path().to_string_lossy().to_string();

        fs::write(repo.path().join("initial.txt"), "staged change").unwrap();
        git_stage_files(repo_path.clone(), vec!["initial.txt".to_string()])
            .await
            .unwrap();

        let diff = get_file_diff(repo_path, "initial.txt".to_string(), true)
            .await
            .unwrap();
        assert!(diff.contains("staged change"));
    }

    #[test]
    fn changed_file_serializes_to_camel_case() {
        let file = ChangedFile {
            path: "src/main.rs".to_string(),
            status: "modified".to_string(),
            staged: true,
            old_path: Some("src/old_main.rs".to_string()),
        };
        let json = serde_json::to_value(&file).unwrap();
        assert!(json.get("oldPath").is_some());
        assert!(json.get("old_path").is_none());
    }
}
