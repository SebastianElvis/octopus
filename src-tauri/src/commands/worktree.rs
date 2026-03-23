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

/// Find the worktree path currently using a given branch, if any.
fn find_worktree_for_branch(repo_local_path: &str, branch: &str) -> Option<String> {
    let output = Command::new("git")
        .args(["worktree", "list", "--porcelain"])
        .current_dir(repo_local_path)
        .output()
        .ok()?;

    let text = String::from_utf8_lossy(&output.stdout);
    let full_ref = format!("refs/heads/{}", branch);
    let mut current_path: Option<String> = None;

    for line in text.lines() {
        if let Some(path) = line.strip_prefix("worktree ") {
            current_path = Some(path.to_string());
        } else if let Some(b) = line.strip_prefix("branch ") {
            if b == full_ref {
                return current_path;
            }
        } else if line.is_empty() {
            current_path = None;
        }
    }
    None
}

/// Remove an existing worktree by path and prune metadata.
fn remove_worktree_at(repo_local_path: &str, worktree_path: &str) {
    let _ = Command::new("git")
        .args(["worktree", "remove", "--force", worktree_path])
        .current_dir(repo_local_path)
        .output();
    // If git remove fails, try deleting the directory directly
    if Path::new(worktree_path).exists() {
        let _ = std::fs::remove_dir_all(worktree_path);
    }
    let _ = Command::new("git")
        .args(["worktree", "prune"])
        .current_dir(repo_local_path)
        .output();
}

/// Internal (non-command) worktree creation, callable from other Rust modules.
///
/// When `force` is true and the branch is already checked out in another
/// worktree, the old worktree is removed first. When false, a
/// `WORKTREE_CONFLICT:` prefixed error is returned so the frontend can
/// prompt the user.
pub fn create_worktree_internal(
    repo_local_path: &str,
    branch: &str,
    session_id: &str,
    force: bool,
) -> AppResult<String> {
    let worktree_path = worktree_dir(repo_local_path, session_id)?;

    if let Some(parent) = worktree_path.parent() {
        std::fs::create_dir_all(parent)?;
    }

    let worktree_str = worktree_path.to_string_lossy().to_string();

    // Check if branch is already in use by another worktree
    if let Some(existing_path) = find_worktree_for_branch(repo_local_path, branch) {
        if force {
            log::info!(
                "Force: removing existing worktree for branch '{}' at {}",
                branch,
                existing_path
            );
            remove_worktree_at(repo_local_path, &existing_path);
        } else {
            return Err(AppError::Custom(format!(
                "WORKTREE_CONFLICT: Branch '{}' is already used by worktree at '{}'",
                branch, existing_path
            )));
        }
    }

    let branch_check = Command::new("git")
        .args(["rev-parse", "--verify", branch])
        .current_dir(repo_local_path)
        .output()?;
    let branch_exists = branch_check.status.success();

    let output = if branch_exists {
        Command::new("git")
            .args(["worktree", "add", &worktree_str, branch])
            .current_dir(repo_local_path)
            .output()?
    } else {
        Command::new("git")
            .args(["worktree", "add", "-b", branch, &worktree_str])
            .current_dir(repo_local_path)
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

    log::info!("Created worktree for branch '{}' at {}", branch, worktree_str);
    Ok(worktree_str)
}

/// Create a git worktree for a session (Tauri command wrapper).
#[tauri::command]
pub async fn create_worktree(
    repo_local_path: String,
    branch: String,
    session_id: String,
    force: Option<bool>,
) -> AppResult<String> {
    create_worktree_internal(&repo_local_path, &branch, &session_id, force.unwrap_or(false))
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
    use std::process::Command as StdCommand;

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

    // -- Integration tests that create real git repos in temp dirs ----------

    fn init_temp_repo() -> tempfile::TempDir {
        let dir = tempfile::tempdir().expect("create temp dir");
        StdCommand::new("git")
            .args(["init"])
            .current_dir(dir.path())
            .output()
            .expect("git init");
        StdCommand::new("git")
            .args(["commit", "--allow-empty", "-m", "initial"])
            .current_dir(dir.path())
            .output()
            .expect("git commit");
        dir
    }

    #[test]
    fn find_worktree_for_branch_returns_none_for_unused_branch() {
        let repo = init_temp_repo();
        let result = find_worktree_for_branch(repo.path().to_str().unwrap(), "nonexistent");
        assert!(result.is_none());
    }

    #[test]
    fn create_worktree_and_detect_conflict() {
        let repo = init_temp_repo();
        let repo_path = repo.path().to_str().unwrap();

        // First creation should succeed
        let wt1 = create_worktree_internal(repo_path, "test-branch", "session-1", false);
        assert!(wt1.is_ok(), "first worktree should succeed: {:?}", wt1);

        // Branch should now be detected as in use
        let found = find_worktree_for_branch(repo_path, "test-branch");
        assert!(found.is_some(), "branch should be detected as in use");

        // Second creation without force should fail with WORKTREE_CONFLICT
        let wt2 = create_worktree_internal(repo_path, "test-branch", "session-2", false);
        assert!(wt2.is_err());
        let err_msg = wt2.unwrap_err().to_string();
        assert!(
            err_msg.contains("WORKTREE_CONFLICT"),
            "error should be WORKTREE_CONFLICT, got: {}",
            err_msg
        );

        // Second creation with force should succeed (removes old worktree)
        let wt3 = create_worktree_internal(repo_path, "test-branch", "session-3", true);
        assert!(wt3.is_ok(), "force create should succeed: {:?}", wt3);

        // Old worktree directory should be gone
        let wt1_path = wt1.unwrap();
        assert!(
            !Path::new(&wt1_path).exists(),
            "old worktree dir should be removed"
        );
    }

    #[test]
    fn create_worktree_new_branch_succeeds() {
        let repo = init_temp_repo();
        let repo_path = repo.path().to_str().unwrap();

        let result = create_worktree_internal(repo_path, "brand-new-branch", "session-x", false);
        assert!(result.is_ok(), "new branch should succeed: {:?}", result);

        let wt_path = result.unwrap();
        assert!(Path::new(&wt_path).exists(), "worktree dir should exist");
    }
}
