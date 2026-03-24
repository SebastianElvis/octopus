use serde::{Deserialize, Serialize};
use tauri::State;

use crate::error::{AppError, AppResult};
use crate::state::AppState;

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

// ---------------------------------------------------------------------------
// AI Recap
// ---------------------------------------------------------------------------

#[derive(Debug, Serialize)]
struct AnthropicMessage {
    role: String,
    content: String,
}

#[derive(Debug, Serialize)]
struct AnthropicRequest {
    model: String,
    max_tokens: u32,
    system: String,
    messages: Vec<AnthropicMessage>,
}

#[derive(Debug, Deserialize)]
struct AnthropicContentBlock {
    text: Option<String>,
}

#[derive(Debug, Deserialize)]
struct AnthropicResponse {
    content: Vec<AnthropicContentBlock>,
}

/// Generate a recap/summary of a session's recent activity using Claude API.
#[tauri::command]
pub async fn generate_recap(state: State<'_, AppState>, session_id: String) -> AppResult<String> {
    // Get API key from settings
    let api_key = {
        let db = state.db.lock();
        let result: Result<String, _> = db.query_row(
            "SELECT value FROM settings WHERE key = 'claude_api_key'",
            [],
            |row| row.get(0),
        );
        result.map_err(|_| {
            AppError::Custom(
                "No Claude API key configured. Set it in Settings (key: claude_api_key)."
                    .to_string(),
            )
        })?
    };

    if api_key.is_empty() {
        return Err(AppError::Custom(
            "Claude API key is empty. Set it in Settings.".to_string(),
        ));
    }

    // Read session log (last 4000 chars)
    let log_content = {
        let db = state.db.lock();
        let log_path: Result<String, _> = db.query_row(
            "SELECT log_path FROM sessions WHERE id = ?1",
            rusqlite::params![session_id],
            |row| row.get(0),
        );
        match log_path {
            Ok(path) => {
                let log_file = std::path::Path::new(&path).join("stdout.log");
                match std::fs::read_to_string(&log_file) {
                    Ok(contents) => {
                        let len = contents.len();
                        if len > 4000 {
                            contents[len - 4000..].to_string()
                        } else {
                            contents
                        }
                    }
                    Err(_) => String::new(),
                }
            }
            Err(_) => {
                return Err(AppError::NotFound(format!(
                    "session {} not found",
                    session_id
                )));
            }
        }
    };

    if log_content.is_empty() {
        return Ok("No session output available to summarize.".to_string());
    }

    // Call Anthropic API
    let request = AnthropicRequest {
        model: "claude-sonnet-4-20250514".to_string(),
        max_tokens: 256,
        system: "Summarize what this Claude Code session has done and what it's currently asking for. Be concise (2-3 sentences).".to_string(),
        messages: vec![AnthropicMessage {
            role: "user".to_string(),
            content: format!("Here is the terminal output from a Claude Code session:\n\n{}", log_content),
        }],
    };

    let client = &state.http_client;
    let resp = client
        .post("https://api.anthropic.com/v1/messages")
        .header("x-api-key", &api_key)
        .header("anthropic-version", "2023-06-01")
        .header("Content-Type", "application/json")
        .json(&request)
        .send()
        .await?;

    if !resp.status().is_success() {
        let status = resp.status();
        let body = resp
            .text()
            .await
            .unwrap_or_else(|e| format!("(failed to read body: {})", e));
        return Err(AppError::Custom(format!(
            "Anthropic API error {}: {}",
            status, body
        )));
    }

    let api_response: AnthropicResponse = resp.json().await?;

    let summary = api_response
        .content
        .into_iter()
        .filter_map(|block| block.text)
        .collect::<Vec<_>>()
        .join("");

    if summary.is_empty() {
        return Ok("Unable to generate summary — no text in response.".to_string());
    }

    Ok(summary)
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
    fn anthropic_request_serializes() {
        let req = AnthropicRequest {
            model: "claude-sonnet-4-20250514".to_string(),
            max_tokens: 256,
            system: "Summarize.".to_string(),
            messages: vec![AnthropicMessage {
                role: "user".to_string(),
                content: "Hello".to_string(),
            }],
        };
        let json = serde_json::to_string(&req).unwrap();
        assert!(json.contains("claude-sonnet-4-20250514"));
        assert!(json.contains("max_tokens"));
    }

    #[test]
    fn anthropic_response_deserializes() {
        let json = r#"{"content":[{"type":"text","text":"This is a summary."}]}"#;
        let resp: AnthropicResponse = serde_json::from_str(json).unwrap();
        assert_eq!(resp.content.len(), 1);
        assert_eq!(resp.content[0].text, Some("This is a summary.".to_string()));
    }
}
