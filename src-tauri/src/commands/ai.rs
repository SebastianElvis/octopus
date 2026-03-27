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
}
