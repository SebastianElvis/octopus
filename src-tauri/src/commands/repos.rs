use std::process::Command;

use serde::{Deserialize, Serialize};
use tauri::State;

use crate::error::{AppError, AppResult};
use crate::state::AppState;

// ---------------------------------------------------------------------------
// Data types
// ---------------------------------------------------------------------------

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct Repo {
    pub id: String,
    pub github_url: Option<String>,
    pub local_path: Option<String>,
    pub default_branch: Option<String>,
    pub added_at: Option<String>,
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

fn now_iso() -> String {
    chrono::Utc::now().to_rfc3339()
}

fn detect_default_branch(local_path: &str) -> AppResult<String> {
    let output = Command::new("git")
        .args(["symbolic-ref", "--short", "HEAD"])
        .current_dir(local_path)
        .output()?;
    if output.status.success() {
        Ok(String::from_utf8_lossy(&output.stdout).trim().to_string())
    } else {
        let stderr = String::from_utf8_lossy(&output.stderr);
        Err(AppError::Custom(format!(
            "failed to detect branch: {}",
            stderr.trim()
        )))
    }
}

fn query_repos(db: &rusqlite::Connection) -> AppResult<Vec<Repo>> {
    let mut stmt = db.prepare(
        "SELECT id, github_url, local_path, default_branch, added_at \
         FROM repos ORDER BY added_at DESC",
    )?;
    let rows = stmt.query_map([], |row| {
        Ok(Repo {
            id: row.get(0)?,
            github_url: row.get(1)?,
            local_path: row.get(2)?,
            default_branch: row.get(3)?,
            added_at: row.get(4)?,
        })
    })?;

    let mut repos = Vec::new();
    for row in rows {
        repos.push(row?);
    }
    Ok(repos)
}

// ---------------------------------------------------------------------------
// Commands
// ---------------------------------------------------------------------------

/// Clone (or validate) a repo and store it in the database.
#[tauri::command]
pub async fn add_repo(
    state: State<'_, AppState>,
    github_url: String,
    local_path: Option<String>,
) -> AppResult<Repo> {
    let repo_id = uuid::Uuid::new_v4().to_string();
    let now = now_iso();

    let resolved_path: String = if let Some(ref lp) = local_path {
        if std::path::Path::new(lp).exists() {
            lp.clone()
        } else {
            return Err(AppError::Custom(format!(
                "provided local_path does not exist: {}",
                lp
            )));
        }
    } else {
        let home = dirs::home_dir().ok_or_else(|| AppError::Custom("no home dir".to_string()))?;
        let repos_dir = home.join(".toomanytabs").join("repos");
        std::fs::create_dir_all(&repos_dir)?;

        let repo_name = github_url
            .trim_end_matches(".git")
            .rsplit('/')
            .next()
            .unwrap_or("repo")
            .to_string();

        let dest = repos_dir.join(&repo_name);

        if dest.exists() {
            dest.to_string_lossy().to_string()
        } else {
            let dest_str = dest
                .to_str()
                .ok_or_else(|| AppError::Custom("non-UTF-8 path".to_string()))?;
            let output = Command::new("git")
                .args(["clone", &github_url, dest_str])
                .output()?;

            if !output.status.success() {
                let stderr = String::from_utf8_lossy(&output.stderr);
                return Err(AppError::Custom(format!(
                    "git clone failed for {}: {}",
                    github_url,
                    stderr.trim()
                )));
            }

            log::info!("Cloned {} to {}", github_url, dest_str);
            dest.to_string_lossy().to_string()
        }
    };

    let default_branch =
        detect_default_branch(&resolved_path).unwrap_or_else(|_| "main".to_string());

    {
        let db = state
            .db
            .lock()
            .map_err(|e| AppError::Custom(format!("db lock poisoned: {}", e)))?;
        db.execute(
            "INSERT OR REPLACE INTO repos (id, github_url, local_path, default_branch, added_at) \
             VALUES (?1, ?2, ?3, ?4, ?5)",
            rusqlite::params![repo_id, github_url, resolved_path, default_branch, now],
        )?;
    }

    log::info!("Added repo {} ({})", repo_id, github_url);

    Ok(Repo {
        id: repo_id,
        github_url: Some(github_url),
        local_path: Some(resolved_path),
        default_branch: Some(default_branch),
        added_at: Some(now),
    })
}

/// Return all repos from the database.
#[tauri::command]
pub async fn list_repos(state: State<'_, AppState>) -> AppResult<Vec<Repo>> {
    let db = state
        .db
        .lock()
        .map_err(|e| AppError::Custom(format!("db lock poisoned: {}", e)))?;
    query_repos(&db)
}
