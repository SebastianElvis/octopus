use tauri::State;

use crate::error::{AppError, AppResult};
use crate::state::AppState;

// ---------------------------------------------------------------------------
// Branch name generation
// ---------------------------------------------------------------------------

/// Use `claude` CLI (no thinking, fast) to generate a short branch name from a prompt.
#[tauri::command]
pub async fn generate_branch_name(prompt: String) -> AppResult<String> {
    let output = tokio::process::Command::new("claude")
        .args([
            "--print",
            "--model",
            "haiku",
            "--output-format",
            "text",
            "--effort",
            "low",
            "--no-session-persistence",
            &format!(
                "Generate a git branch name for this task. Rules: lowercase, hyphens only, max 30 chars, no prefix like 'feat/' or 'fix/', just a descriptive slug. Reply with ONLY the branch name, nothing else.\n\nTask: {}",
                prompt
            ),
        ])
        .output()
        .await
        .map_err(AppError::Io)?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        return Err(AppError::Custom(format!(
            "claude CLI failed: {}",
            stderr.trim()
        )));
    }

    let branch = String::from_utf8_lossy(&output.stdout)
        .trim()
        .to_lowercase()
        .replace(|c: char| !c.is_ascii_alphanumeric() && c != '-', "-")
        .trim_matches('-')
        .to_string();

    // Truncate to 30 chars at a hyphen boundary if possible
    let branch = if branch.len() > 30 {
        match branch[..30].rfind('-') {
            Some(pos) if pos > 10 => branch[..pos].to_string(),
            _ => branch[..30].to_string(),
        }
    } else {
        branch
    };

    if branch.is_empty() {
        return Err(AppError::Custom("Generated branch name was empty".into()));
    }

    Ok(branch)
}

// ---------------------------------------------------------------------------
// Session recap generation
// ---------------------------------------------------------------------------

/// Generate a concise recap of a session's activity using Claude.
#[tauri::command]
pub async fn generate_recap(state: State<'_, AppState>, session_id: String) -> AppResult<String> {
    // Look up the session's log path from DB
    let log_path: String = {
        let db = state.db.lock();
        db.query_row(
            "SELECT log_path FROM sessions WHERE id = ?1",
            rusqlite::params![session_id],
            |row| row.get(0),
        )
        .map_err(|_| AppError::Custom(format!("Session {} not found", session_id)))?
    };

    // Read stdout log
    let stdout_log = std::path::PathBuf::from(&log_path).join("stdout.log");
    let log_content = tokio::fs::read_to_string(&stdout_log)
        .await
        .map_err(|e| AppError::Custom(format!("Failed to read session log: {}", e)))?;

    if log_content.trim().is_empty() {
        return Err(AppError::Custom("Session log is empty".into()));
    }

    // Truncate to last ~30000 chars to fit context window
    let truncated = if log_content.len() > 30000 {
        &log_content[log_content.len() - 30000..]
    } else {
        &log_content
    };

    let prompt = format!(
        "Summarize this Claude Code session in 3-5 bullet points. What was accomplished, \
         what decisions were made, and what is the current state? Be concise.\n\n\
         <session_log>\n{}\n</session_log>",
        truncated
    );

    let output = tokio::process::Command::new("claude")
        .args([
            "--print",
            "--model",
            "haiku",
            "--output-format",
            "text",
            "--no-session-persistence",
            &prompt,
        ])
        .output()
        .await
        .map_err(AppError::Io)?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        return Err(AppError::Custom(format!(
            "Recap generation failed: {}",
            stderr.trim()
        )));
    }

    let recap = String::from_utf8_lossy(&output.stdout).trim().to_string();

    if recap.is_empty() {
        return Err(AppError::Custom(
            "Recap generation returned empty result".into(),
        ));
    }

    Ok(recap)
}

// ---------------------------------------------------------------------------
// Settings commands
// ---------------------------------------------------------------------------

/// Get a setting value by key from the settings table.
#[tauri::command]
pub async fn get_setting(state: State<'_, AppState>, key: String) -> AppResult<Option<String>> {
    let db = state.db.lock();
    let result: Result<String, _> = db.query_row(
        "SELECT value FROM settings WHERE key = ?1",
        rusqlite::params![key],
        |row| row.get(0),
    );
    match result {
        Ok(val) => Ok(Some(val)),
        Err(rusqlite::Error::QueryReturnedNoRows) => Ok(None),
        Err(e) => Err(AppError::Db(e)),
    }
}

/// Set a setting value by key in the settings table.
#[tauri::command]
pub async fn set_setting(state: State<'_, AppState>, key: String, value: String) -> AppResult<()> {
    let db = state.db.lock();
    db.execute(
        "INSERT OR REPLACE INTO settings (key, value) VALUES (?1, ?2)",
        rusqlite::params![key, value],
    )?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::db::create_schema;
    use rusqlite::Connection;

    fn setup_state() -> AppState {
        let conn = Connection::open_in_memory().expect("open in-memory db");
        conn.execute_batch("PRAGMA foreign_keys=ON;")
            .expect("enable FK");
        create_schema(&conn).expect("create schema");
        AppState::new(conn)
    }

    #[test]
    fn get_set_setting_roundtrip() {
        let state = setup_state();
        let db = state.db.lock();

        // Initially no setting
        let result: Result<String, _> = db.query_row(
            "SELECT value FROM settings WHERE key = ?1",
            rusqlite::params!["test_key"],
            |row| row.get(0),
        );
        assert!(result.is_err());

        // Insert a setting
        db.execute(
            "INSERT OR REPLACE INTO settings (key, value) VALUES (?1, ?2)",
            rusqlite::params!["test_key", "test_value"],
        )
        .expect("insert setting");

        // Read it back
        let value: String = db
            .query_row(
                "SELECT value FROM settings WHERE key = ?1",
                rusqlite::params!["test_key"],
                |row| row.get(0),
            )
            .expect("query setting");
        assert_eq!(value, "test_value");

        // Update it
        db.execute(
            "INSERT OR REPLACE INTO settings (key, value) VALUES (?1, ?2)",
            rusqlite::params!["test_key", "new_value"],
        )
        .expect("update setting");

        let value: String = db
            .query_row(
                "SELECT value FROM settings WHERE key = ?1",
                rusqlite::params!["test_key"],
                |row| row.get(0),
            )
            .expect("query setting after update");
        assert_eq!(value, "new_value");
    }

    #[test]
    fn get_missing_setting_returns_no_rows_error() {
        let state = setup_state();
        let db = state.db.lock();

        let result: Result<String, _> = db.query_row(
            "SELECT value FROM settings WHERE key = ?1",
            rusqlite::params!["nonexistent_key"],
            |row| row.get(0),
        );

        assert!(matches!(result, Err(rusqlite::Error::QueryReturnedNoRows)));
    }

    #[test]
    fn multiple_settings_independent() {
        let state = setup_state();
        let db = state.db.lock();

        db.execute(
            "INSERT OR REPLACE INTO settings (key, value) VALUES (?1, ?2)",
            rusqlite::params!["api_key", "sk-123"],
        )
        .expect("insert api_key");
        db.execute(
            "INSERT OR REPLACE INTO settings (key, value) VALUES (?1, ?2)",
            rusqlite::params!["theme", "dark"],
        )
        .expect("insert theme");

        let api: String = db
            .query_row(
                "SELECT value FROM settings WHERE key = ?1",
                rusqlite::params!["api_key"],
                |row| row.get(0),
            )
            .unwrap();
        let theme: String = db
            .query_row(
                "SELECT value FROM settings WHERE key = ?1",
                rusqlite::params!["theme"],
                |row| row.get(0),
            )
            .unwrap();

        assert_eq!(api, "sk-123");
        assert_eq!(theme, "dark");

        // Updating one should not affect the other
        db.execute(
            "INSERT OR REPLACE INTO settings (key, value) VALUES (?1, ?2)",
            rusqlite::params!["api_key", "sk-456"],
        )
        .expect("update api_key");

        let theme_after: String = db
            .query_row(
                "SELECT value FROM settings WHERE key = ?1",
                rusqlite::params!["theme"],
                |row| row.get(0),
            )
            .unwrap();
        assert_eq!(theme_after, "dark");
    }

    #[test]
    fn setting_value_can_be_empty_string() {
        let state = setup_state();
        let db = state.db.lock();

        db.execute(
            "INSERT OR REPLACE INTO settings (key, value) VALUES (?1, ?2)",
            rusqlite::params!["empty", ""],
        )
        .expect("insert empty value");

        let value: String = db
            .query_row(
                "SELECT value FROM settings WHERE key = ?1",
                rusqlite::params!["empty"],
                |row| row.get(0),
            )
            .unwrap();
        assert_eq!(value, "");
    }
}
