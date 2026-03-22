use std::path::Path;
use std::process::Command;

use crate::error::{AppError, AppResult};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/// Derive a short repo name from a local filesystem path.
///
/// For example, `/home/user/repos/my-project` -> `"my-project"`.
fn repo_name_from_path(local_path: &str) -> String {
    Path::new(local_path)
        .file_name()
        .and_then(|n| n.to_str())
        .unwrap_or("repo")
        .to_string()
}

/// Build the worktree path: `~/.toomanytabs/worktrees/<repo-name>/<session-id>/`
fn worktree_dir(repo_local_path: &str, session_id: &str) -> AppResult<std::path::PathBuf> {
    let home = dirs::home_dir().ok_or_else(|| AppError::Custom("no home dir".to_string()))?;
    let repo_name = repo_name_from_path(repo_local_path);
    Ok(home
        .join(".toomanytabs")
        .join("worktrees")
        .join(repo_name)
        .join(session_id))
}

// ---------------------------------------------------------------------------
// Commands
// ---------------------------------------------------------------------------

/// Create a git worktree for a session.
///
/// The worktree is placed at `~/.toomanytabs/worktrees/<repo-name>/<session-id>/`.
/// If `branch` does not yet exist it will be created.
#[tauri::command]
pub async fn create_worktree(
    repo_local_path: String,
    branch: String,
    session_id: String,
) -> AppResult<String> {
    let worktree_path = worktree_dir(&repo_local_path, &session_id)?;

    if let Some(parent) = worktree_path.parent() {
        std::fs::create_dir_all(parent)?;
    }

    let worktree_str = worktree_path.to_string_lossy().to_string();

    // Check if the branch already exists locally
    let branch_check = Command::new("git")
        .args(["rev-parse", "--verify", &branch])
        .current_dir(&repo_local_path)
        .output()?;
    let branch_exists = branch_check.status.success();

    let output = if branch_exists {
        // Checkout existing branch into new worktree
        Command::new("git")
            .args(["worktree", "add", &worktree_str, &branch])
            .current_dir(&repo_local_path)
            .output()?
    } else {
        // Create a new branch and worktree at the same time
        Command::new("git")
            .args(["worktree", "add", "-b", &branch, &worktree_str])
            .current_dir(&repo_local_path)
            .output()?
    };

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        return Err(AppError::Custom(format!(
            "git worktree add failed for branch '{}': {}",
            branch,
            stderr.trim()
        )));
    }

    log::info!(
        "Created worktree for branch '{}' at {}",
        branch,
        worktree_str
    );

    Ok(worktree_str)
}

/// Remove a git worktree and delete the associated local branch.
#[tauri::command]
pub async fn remove_worktree(
    repo_local_path: String,
    worktree_path: String,
    branch: String,
) -> AppResult<()> {
    // Remove worktree
    let remove_output = Command::new("git")
        .args(["worktree", "remove", "--force", &worktree_path])
        .current_dir(&repo_local_path)
        .output()?;

    if !remove_output.status.success() {
        let stderr = String::from_utf8_lossy(&remove_output.stderr);
        log::warn!(
            "git worktree remove failed (falling back to rm -rf): {}",
            stderr.trim()
        );
        // Fall back: just delete the directory
        if let Err(e) = std::fs::remove_dir_all(&worktree_path) {
            log::warn!("Failed to remove worktree directory: {}", e);
        }
    }

    // Prune worktree metadata
    if let Err(e) = Command::new("git")
        .args(["worktree", "prune"])
        .current_dir(&repo_local_path)
        .output()
    {
        log::warn!("git worktree prune failed: {}", e);
    }

    // Delete the local branch
    let branch_output = Command::new("git")
        .args(["branch", "-D", &branch])
        .current_dir(&repo_local_path)
        .output()?;

    if !branch_output.status.success() {
        let stderr = String::from_utf8_lossy(&branch_output.stderr);
        log::warn!("git branch -D {} failed: {}", branch, stderr.trim());
    }

    log::info!("Removed worktree {} (branch {})", worktree_path, branch);
    Ok(())
}

/// Return the git diff output for a worktree.
#[tauri::command]
pub async fn get_diff(worktree_path: String) -> AppResult<String> {
    let output = Command::new("git")
        .args(["diff"])
        .current_dir(&worktree_path)
        .output()?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        return Err(AppError::Custom(format!(
            "git diff failed: {}",
            stderr.trim()
        )));
    }

    Ok(String::from_utf8_lossy(&output.stdout).to_string())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn repo_name_from_normal_path() {
        assert_eq!(
            repo_name_from_path("/home/user/repos/my-project"),
            "my-project"
        );
    }

    #[test]
    fn repo_name_from_trailing_slash() {
        // Path::new strips trailing slashes on Unix
        assert_eq!(
            repo_name_from_path("/home/user/repos/my-project/"),
            "my-project"
        );
    }

    #[test]
    fn repo_name_from_root_falls_back() {
        // "/" has no file_name
        assert_eq!(repo_name_from_path("/"), "repo");
    }

    #[test]
    fn worktree_dir_has_expected_structure() {
        let path = worktree_dir("/home/user/repos/my-project", "abc-123").unwrap();
        let path_str = path.to_string_lossy().to_string();
        assert!(path_str.contains(".toomanytabs/worktrees/my-project/abc-123"));
    }
}
