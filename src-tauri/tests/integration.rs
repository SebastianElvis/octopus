//! Integration tests for TooManyTabs backend.
//!
//! These tests exercise the internal helper functions and database operations
//! directly, bypassing the `#[tauri::command]` macro (which requires the Tauri
//! runtime). This lets us test repos, sessions, settings, and filesystem
//! commands with real (in-memory) SQLite databases and temp directories.

use rusqlite::Connection;
use toomanytabs_lib::db::create_schema;
use toomanytabs_lib::state::AppState;

// ---------------------------------------------------------------------------
// Test helpers
// ---------------------------------------------------------------------------

/// Create an AppState backed by an in-memory SQLite database with the full
/// schema applied.  Each test gets its own isolated database.
fn setup() -> AppState {
    let conn = Connection::open_in_memory().expect("open in-memory db");
    conn.execute_batch("PRAGMA foreign_keys=ON;")
        .expect("enable FK");
    create_schema(&conn).expect("create schema");
    AppState::new(conn)
}

/// Insert a repo directly into the database and return its id.
fn insert_repo(state: &AppState, id: &str, url: &str, path: &str) {
    let db = state.db.lock();
    db.execute(
        "INSERT INTO repos (id, github_url, local_path, default_branch, added_at) \
         VALUES (?1, ?2, ?3, ?4, ?5)",
        rusqlite::params![id, url, path, "main", "2025-01-01T00:00:00Z"],
    )
    .expect("insert repo");
}

/// Insert a session directly into the database.
fn insert_session(state: &AppState, id: &str, repo_id: &str, name: &str, status: &str) {
    let db = state.db.lock();
    db.execute(
        "INSERT INTO sessions (id, repo_id, name, status, created_at, state_changed_at) \
         VALUES (?1, ?2, ?3, ?4, ?5, ?6)",
        rusqlite::params![
            id,
            repo_id,
            name,
            status,
            "2025-01-01T00:00:00Z",
            "2025-01-01T00:00:00Z"
        ],
    )
    .expect("insert session");
}

// ---------------------------------------------------------------------------
// Repo queries
// ---------------------------------------------------------------------------

#[test]
fn list_repos_empty() {
    let state = setup();
    let db = state.db.lock();
    let count: i64 = db
        .query_row("SELECT COUNT(*) FROM repos", [], |row| row.get(0))
        .unwrap();
    assert_eq!(count, 0);
}

#[test]
fn insert_and_list_repos() {
    let state = setup();
    insert_repo(&state, "r1", "https://github.com/owner/repo1", "/tmp/repo1");
    insert_repo(&state, "r2", "https://github.com/owner/repo2", "/tmp/repo2");

    let db = state.db.lock();
    let mut stmt = db
        .prepare("SELECT id FROM repos ORDER BY added_at DESC")
        .unwrap();
    let ids: Vec<String> = stmt
        .query_map([], |row| row.get(0))
        .unwrap()
        .map(|r| r.unwrap())
        .collect();

    assert_eq!(ids.len(), 2);
    assert!(ids.contains(&"r1".to_string()));
    assert!(ids.contains(&"r2".to_string()));
}

#[test]
fn remove_repo_deletes_from_db() {
    let state = setup();
    insert_repo(&state, "r1", "https://github.com/owner/repo", "/tmp/repo");

    {
        let db = state.db.lock();
        db.execute("DELETE FROM repos WHERE id = ?1", rusqlite::params!["r1"])
            .unwrap();
    }

    let db = state.db.lock();
    let count: i64 = db
        .query_row("SELECT COUNT(*) FROM repos WHERE id = 'r1'", [], |row| {
            row.get(0)
        })
        .unwrap();
    assert_eq!(count, 0);
}

#[test]
fn repo_duplicate_id_uses_replace() {
    let state = setup();
    insert_repo(&state, "r1", "https://github.com/owner/old", "/tmp/old");

    // INSERT OR REPLACE with same id
    {
        let db = state.db.lock();
        db.execute(
            "INSERT OR REPLACE INTO repos (id, github_url, local_path, default_branch, added_at) \
             VALUES (?1, ?2, ?3, ?4, ?5)",
            rusqlite::params![
                "r1",
                "https://github.com/owner/new",
                "/tmp/new",
                "main",
                "2025-06-01"
            ],
        )
        .unwrap();
    }

    let db = state.db.lock();
    let url: String = db
        .query_row(
            "SELECT github_url FROM repos WHERE id = ?1",
            ["r1"],
            |row| row.get(0),
        )
        .unwrap();
    assert_eq!(url, "https://github.com/owner/new");
}

// ---------------------------------------------------------------------------
// Session queries
// ---------------------------------------------------------------------------

#[test]
fn list_sessions_empty() {
    let state = setup();
    let db = state.db.lock();
    let count: i64 = db
        .query_row("SELECT COUNT(*) FROM sessions", [], |row| row.get(0))
        .unwrap();
    assert_eq!(count, 0);
}

#[test]
fn insert_and_query_sessions() {
    let state = setup();
    insert_repo(&state, "r1", "https://github.com/a/b", "/tmp/b");
    insert_session(&state, "s1", "r1", "Fix bug", "running");
    insert_session(&state, "s2", "r1", "Add feature", "completed");

    let db = state.db.lock();
    let mut stmt = db
        .prepare("SELECT id, name, status FROM sessions ORDER BY name")
        .unwrap();
    let sessions: Vec<(String, String, String)> = stmt
        .query_map([], |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?)))
        .unwrap()
        .map(|r| r.unwrap())
        .collect();

    assert_eq!(sessions.len(), 2);
    assert_eq!(
        sessions[0],
        (
            "s2".to_string(),
            "Add feature".to_string(),
            "completed".to_string()
        )
    );
    assert_eq!(
        sessions[1],
        (
            "s1".to_string(),
            "Fix bug".to_string(),
            "running".to_string()
        )
    );
}

#[test]
fn session_status_update() {
    let state = setup();
    insert_repo(&state, "r1", "https://github.com/a/b", "/tmp/b");
    insert_session(&state, "s1", "r1", "Test session", "running");

    {
        let db = state.db.lock();
        db.execute(
            "UPDATE sessions SET status = ?1, state_changed_at = ?2 WHERE id = ?3",
            rusqlite::params!["completed", "2025-06-01T00:00:00Z", "s1"],
        )
        .unwrap();
    }

    let db = state.db.lock();
    let status: String = db
        .query_row("SELECT status FROM sessions WHERE id = ?1", ["s1"], |row| {
            row.get(0)
        })
        .unwrap();
    assert_eq!(status, "completed");
}

#[test]
fn session_with_block_type_and_last_message() {
    let state = setup();
    insert_repo(&state, "r1", "https://github.com/a/b", "/tmp/b");
    insert_session(&state, "s1", "r1", "Test session", "waiting");

    {
        let db = state.db.lock();
        db.execute(
            "UPDATE sessions SET block_type = ?1, last_message = ?2 WHERE id = ?3",
            rusqlite::params!["permission", "Allow file edit?", "s1"],
        )
        .unwrap();
    }

    let db = state.db.lock();
    let (block_type, last_message): (String, String) = db
        .query_row(
            "SELECT block_type, last_message FROM sessions WHERE id = ?1",
            ["s1"],
            |row| Ok((row.get(0)?, row.get(1)?)),
        )
        .unwrap();
    assert_eq!(block_type, "permission");
    assert_eq!(last_message, "Allow file edit?");
}

#[test]
fn session_foreign_key_constraint() {
    let state = setup();
    // Inserting a session with a non-existent repo_id should fail (FK constraint)
    let db = state.db.lock();
    let result = db.execute(
        "INSERT INTO sessions (id, repo_id, name, status, created_at, state_changed_at) \
         VALUES (?1, ?2, ?3, ?4, ?5, ?6)",
        rusqlite::params![
            "s1",
            "nonexistent-repo",
            "orphan",
            "idle",
            "2025-01-01",
            "2025-01-01"
        ],
    );
    assert!(
        result.is_err(),
        "FK constraint should prevent orphan sessions"
    );
}

#[test]
fn session_linked_issue_and_pr() {
    let state = setup();
    insert_repo(&state, "r1", "https://github.com/a/b", "/tmp/b");

    {
        let db = state.db.lock();
        db.execute(
            "INSERT INTO sessions (id, repo_id, name, status, linked_issue_number, linked_pr_number, created_at, state_changed_at) \
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)",
            rusqlite::params!["s1", "r1", "PR session", "running", 42, 7, "2025-01-01", "2025-01-01"],
        )
        .unwrap();
    }

    let db = state.db.lock();
    let (issue, pr): (i64, i64) = db
        .query_row(
            "SELECT linked_issue_number, linked_pr_number FROM sessions WHERE id = ?1",
            ["s1"],
            |row| Ok((row.get(0)?, row.get(1)?)),
        )
        .unwrap();
    assert_eq!(issue, 42);
    assert_eq!(pr, 7);
}

// ---------------------------------------------------------------------------
// Settings
// ---------------------------------------------------------------------------

#[test]
fn settings_roundtrip() {
    let state = setup();
    let db = state.db.lock();

    // Initially empty
    let result: Result<String, _> = db.query_row(
        "SELECT value FROM settings WHERE key = ?1",
        ["api_key"],
        |row| row.get(0),
    );
    assert!(result.is_err());

    // Insert
    db.execute(
        "INSERT OR REPLACE INTO settings (key, value) VALUES (?1, ?2)",
        rusqlite::params!["api_key", "sk-123"],
    )
    .unwrap();

    let val: String = db
        .query_row(
            "SELECT value FROM settings WHERE key = ?1",
            ["api_key"],
            |row| row.get(0),
        )
        .unwrap();
    assert_eq!(val, "sk-123");

    // Update
    db.execute(
        "INSERT OR REPLACE INTO settings (key, value) VALUES (?1, ?2)",
        rusqlite::params!["api_key", "sk-456"],
    )
    .unwrap();

    let val: String = db
        .query_row(
            "SELECT value FROM settings WHERE key = ?1",
            ["api_key"],
            |row| row.get(0),
        )
        .unwrap();
    assert_eq!(val, "sk-456");
}

#[test]
fn multiple_settings() {
    let state = setup();
    let db = state.db.lock();

    db.execute(
        "INSERT INTO settings (key, value) VALUES (?1, ?2)",
        rusqlite::params!["key1", "val1"],
    )
    .unwrap();
    db.execute(
        "INSERT INTO settings (key, value) VALUES (?1, ?2)",
        rusqlite::params!["key2", "val2"],
    )
    .unwrap();

    let count: i64 = db
        .query_row("SELECT COUNT(*) FROM settings", [], |row| row.get(0))
        .unwrap();
    assert_eq!(count, 2);
}

// ---------------------------------------------------------------------------
// Reap orphaned sessions (crash recovery)
// ---------------------------------------------------------------------------

#[test]
fn reap_orphaned_sessions() {
    let state = setup();
    insert_repo(&state, "r1", "https://github.com/a/b", "/tmp/b");
    insert_session(&state, "s1", "r1", "Session 1", "running");
    insert_session(&state, "s2", "r1", "Session 2", "waiting");
    insert_session(&state, "s3", "r1", "Session 3", "completed");
    insert_session(&state, "s4", "r1", "Session 4", "stuck");

    let db = state.db.lock();
    let reaped = toomanytabs_lib::db::reap_orphaned_sessions(&db);
    assert_eq!(reaped, 3); // running, waiting, stuck → interrupted

    // completed should be untouched
    let status: String = db
        .query_row("SELECT status FROM sessions WHERE id = 's3'", [], |row| {
            row.get(0)
        })
        .unwrap();
    assert_eq!(status, "completed");

    // Others should be interrupted
    for sid in &["s1", "s2", "s4"] {
        let status: String = db
            .query_row("SELECT status FROM sessions WHERE id = ?1", [sid], |row| {
                row.get(0)
            })
            .unwrap();
        assert_eq!(
            status, "interrupted",
            "session {} should be interrupted",
            sid
        );
    }
}

// ---------------------------------------------------------------------------
// Filesystem commands (these are async, no AppState needed)
// ---------------------------------------------------------------------------

#[tokio::test]
async fn list_dir_integration() {
    use toomanytabs_lib::commands::filesystem::list_dir;

    let dir = tempfile::tempdir().unwrap();
    std::fs::write(dir.path().join("a.txt"), "hello").unwrap();
    std::fs::write(dir.path().join("b.rs"), "fn main() {}").unwrap();
    std::fs::create_dir(dir.path().join("subdir")).unwrap();

    let entries = list_dir(dir.path().to_string_lossy().to_string())
        .await
        .unwrap();

    // Directories first, then files alphabetically
    assert!(entries.len() >= 3);
    assert!(entries[0].is_dir);
    assert_eq!(entries[0].name, "subdir");

    let file_names: Vec<&str> = entries
        .iter()
        .filter(|e| !e.is_dir)
        .map(|e| e.name.as_str())
        .collect();
    assert!(file_names.contains(&"a.txt"));
    assert!(file_names.contains(&"b.rs"));
}

#[tokio::test]
async fn list_dir_rejects_file_path() {
    use toomanytabs_lib::commands::filesystem::list_dir;

    let dir = tempfile::tempdir().unwrap();
    let file = dir.path().join("test.txt");
    std::fs::write(&file, "content").unwrap();

    let result = list_dir(file.to_string_lossy().to_string()).await;
    assert!(result.is_err());
}

#[tokio::test]
async fn read_file_integration() {
    use toomanytabs_lib::commands::filesystem::read_file;

    let dir = tempfile::tempdir().unwrap();
    let file = dir.path().join("test.txt");
    std::fs::write(&file, "hello world").unwrap();

    let content = read_file(file.to_string_lossy().to_string()).await.unwrap();
    assert_eq!(content, "hello world");
}

#[tokio::test]
async fn read_file_rejects_large_file() {
    use toomanytabs_lib::commands::filesystem::read_file;

    let dir = tempfile::tempdir().unwrap();
    let file = dir.path().join("large.bin");
    // Create a file > 5MB
    let data = vec![b'x'; 6 * 1024 * 1024];
    std::fs::write(&file, data).unwrap();

    let result = read_file(file.to_string_lossy().to_string()).await;
    assert!(result.is_err());
}

#[tokio::test]
async fn read_file_rejects_binary() {
    use toomanytabs_lib::commands::filesystem::read_file;

    let dir = tempfile::tempdir().unwrap();
    let file = dir.path().join("binary.bin");
    std::fs::write(&file, b"\x00\x01\x02\x03").unwrap();

    let result = read_file(file.to_string_lossy().to_string()).await;
    assert!(result.is_err());
}

#[tokio::test]
async fn read_file_nonexistent() {
    use toomanytabs_lib::commands::filesystem::read_file;

    let result = read_file("/tmp/nonexistent_file_abc123.txt".to_string()).await;
    assert!(result.is_err());
}

// ---------------------------------------------------------------------------
// DB path with env var override (E2E support)
// ---------------------------------------------------------------------------

#[test]
fn db_path_respects_env_override() {
    // Save original value
    let original = std::env::var("TOOMANYTABS_DB_PATH").ok();

    std::env::set_var("TOOMANYTABS_DB_PATH", "/tmp/test-e2e.db");
    let path = toomanytabs_lib::db::db_path().unwrap();
    assert_eq!(path, "/tmp/test-e2e.db");

    // Restore
    match original {
        Some(v) => std::env::set_var("TOOMANYTABS_DB_PATH", v),
        None => std::env::remove_var("TOOMANYTABS_DB_PATH"),
    }
}

// ---------------------------------------------------------------------------
// WAL checkpoint (should not panic on any connection)
// ---------------------------------------------------------------------------

#[test]
fn wal_checkpoint_on_in_memory_db() {
    let state = setup();
    let db = state.db.lock();
    toomanytabs_lib::db::run_wal_checkpoint(&db);
    // Should not panic
}

// ---------------------------------------------------------------------------
// Concurrent access patterns
// ---------------------------------------------------------------------------

#[test]
fn concurrent_db_access() {
    let state = std::sync::Arc::new(setup());
    insert_repo(&state, "r1", "https://github.com/a/b", "/tmp/b");

    let handles: Vec<_> = (0..10)
        .map(|i| {
            let state = state.clone();
            std::thread::spawn(move || {
                let db = state.db.lock();
                db.execute(
                    "INSERT INTO sessions (id, repo_id, name, status, created_at, state_changed_at) \
                     VALUES (?1, ?2, ?3, ?4, ?5, ?6)",
                    rusqlite::params![
                        format!("s{}", i),
                        "r1",
                        format!("Session {}", i),
                        "idle",
                        "2025-01-01",
                        "2025-01-01"
                    ],
                )
                .unwrap();
            })
        })
        .collect();

    for h in handles {
        h.join().unwrap();
    }

    let db = state.db.lock();
    let count: i64 = db
        .query_row("SELECT COUNT(*) FROM sessions", [], |row| row.get(0))
        .unwrap();
    assert_eq!(count, 10);
}
