use rusqlite::Connection;

use crate::error::{AppError, AppResult};

// ---------------------------------------------------------------------------
// Schema versioning & migrations
// ---------------------------------------------------------------------------

/// Read the current schema version (0 if no version has been set yet).
fn get_schema_version(conn: &Connection) -> i64 {
    conn.query_row("SELECT COALESCE(MAX(version), 0) FROM schema_version", [], |row| {
        row.get(0)
    })
    .unwrap_or(0)
}

/// Persist the schema version after a successful migration.
fn set_schema_version(conn: &Connection, version: i64) {
    conn.execute(
        "INSERT INTO schema_version (version) VALUES (?1)",
        rusqlite::params![version],
    )
    .ok();
}

/// Run all pending migrations in order.
///
/// Each entry is `(version, sql)`.  Migrations that have already been applied
/// (version <= current) are skipped.  New migrations are executed inside a
/// transaction so a failure rolls back cleanly.
pub fn run_migrations(conn: &Connection) -> AppResult<()> {
    // Ensure the version-tracking table exists before anything else.
    conn.execute_batch(
        "CREATE TABLE IF NOT EXISTS schema_version (version INTEGER NOT NULL);",
    )?;

    let current = get_schema_version(conn);

    // Add new migrations at the end of this list.  Never reorder or remove
    // entries — only append.
    let migrations: &[(i64, &str)] = &[
        (1, "ALTER TABLE sessions ADD COLUMN pid INTEGER;"),
    ];

    for &(version, sql) in migrations {
        if version > current {
            log::info!("Running migration v{}", version);
            conn.execute_batch(sql)?;
            set_schema_version(conn, version);
            log::info!("Migration v{} applied", version);
        }
    }

    Ok(())
}

/// Return the path to the SQLite database file.
///
/// If the `TOOMANYTABS_DB_PATH` environment variable is set, use that path
/// directly (useful for E2E test isolation). Otherwise defaults to
/// `~/.toomanytabs/toomanytabs.db`.
pub fn db_path() -> AppResult<String> {
    if let Ok(p) = std::env::var("TOOMANYTABS_DB_PATH") {
        return Ok(p);
    }
    let home = dirs::home_dir()
        .ok_or_else(|| AppError::Custom("could not determine home directory".to_string()))?;
    Ok(home
        .join(".toomanytabs")
        .join("toomanytabs.db")
        .to_string_lossy()
        .to_string())
}

/// Open a new SQLite connection to the app database.
///
/// This is used once at startup to create the connection that lives inside
/// `AppState`.  All subsequent access goes through that shared `Mutex<Connection>`.
pub fn open_connection() -> AppResult<Connection> {
    let path = db_path()?;
    let parent = std::path::Path::new(&path)
        .parent()
        .ok_or_else(|| AppError::Custom("invalid db path".to_string()))?;
    std::fs::create_dir_all(parent)?;

    let conn = Connection::open(&path)?;

    // Enable WAL mode, foreign keys, and busy timeout
    conn.execute_batch(
        "PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON; PRAGMA busy_timeout=5000;",
    )?;

    Ok(conn)
}

/// Create all tables if they don't already exist.
pub fn create_schema(conn: &Connection) -> AppResult<()> {
    conn.execute_batch(
        "CREATE TABLE IF NOT EXISTS repos (
            id TEXT PRIMARY KEY,
            github_url TEXT,
            local_path TEXT,
            default_branch TEXT,
            added_at TEXT
        );

        CREATE TABLE IF NOT EXISTS sessions (
            id TEXT PRIMARY KEY,
            repo_id TEXT REFERENCES repos(id),
            name TEXT,
            branch TEXT,
            status TEXT,
            block_type TEXT,
            worktree_path TEXT,
            log_path TEXT,
            linked_issue_number INTEGER,
            linked_pr_number INTEGER,
            prompt TEXT,
            dangerously_skip_permissions INTEGER DEFAULT 0,
            created_at TEXT,
            state_changed_at TEXT,
            last_message TEXT
        );

        CREATE TABLE IF NOT EXISTS settings (
            key TEXT PRIMARY KEY,
            value TEXT
        );",
    )?;

    log::info!("Database schema initialized");
    Ok(())
}

/// Mark any sessions that were running when the app last exited as "attention".
/// Their OS processes are gone after a restart.
pub fn reap_orphaned_sessions(conn: &Connection) -> usize {
    let now = chrono::Utc::now().to_rfc3339();
    match conn.execute(
        "UPDATE sessions SET status = 'attention', state_changed_at = ?1 \
         WHERE status = 'running'",
        rusqlite::params![now],
    ) {
        Ok(n) => {
            if n > 0 {
                log::info!("Reaped {} orphaned session(s) → attention", n);
            }
            n
        }
        Err(e) => {
            log::error!("Failed to reap orphaned sessions: {}", e);
            0
        }
    }
}

/// Migrate old session statuses to the new simplified enum.
/// Maps: waiting, completed, failed, killed, paused, stuck, interrupted, idle → attention
/// Maps: archived → done
pub fn migrate_statuses(conn: &Connection) -> AppResult<()> {
    conn.execute_batch(
        "UPDATE sessions SET status = 'attention' WHERE status IN ('waiting', 'completed', 'failed', 'killed', 'paused', 'stuck', 'interrupted', 'idle');
         UPDATE sessions SET status = 'done' WHERE status = 'archived';",
    )?;
    log::info!("Migrated session statuses to simplified enum");
    Ok(())
}

/// Run a WAL checkpoint to flush the WAL file into the main database.
pub fn run_wal_checkpoint(conn: &Connection) {
    match conn.execute_batch("PRAGMA wal_checkpoint(TRUNCATE);") {
        Ok(_) => log::info!("WAL checkpoint completed"),
        Err(e) => log::warn!("WAL checkpoint failed: {}", e),
    }
}

/// Convenience: open a connection and create schema in one step.
pub fn init_db() -> AppResult<Connection> {
    let conn = open_connection()?;
    create_schema(&conn)?;
    run_migrations(&conn)?;
    migrate_statuses(&conn)?;
    Ok(conn)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn in_memory_connection() -> Connection {
        let conn = Connection::open_in_memory().expect("open in-memory db");
        conn.execute_batch("PRAGMA foreign_keys=ON;")
            .expect("enable FK");
        create_schema(&conn).expect("create schema");
        conn
    }

    #[test]
    fn schema_creates_tables() {
        let conn = in_memory_connection();

        // Verify the repos table exists by querying it
        let count: i64 = conn
            .query_row("SELECT COUNT(*) FROM repos", [], |row| row.get(0))
            .expect("query repos");
        assert_eq!(count, 0);

        // Verify the sessions table exists
        let count: i64 = conn
            .query_row("SELECT COUNT(*) FROM sessions", [], |row| row.get(0))
            .expect("query sessions");
        assert_eq!(count, 0);

        // Verify the settings table exists
        let count: i64 = conn
            .query_row("SELECT COUNT(*) FROM settings", [], |row| row.get(0))
            .expect("query settings");
        assert_eq!(count, 0);
    }

    #[test]
    fn schema_is_idempotent() {
        let conn = in_memory_connection();
        // Running create_schema a second time should not fail
        create_schema(&conn).expect("second create_schema run");
    }

    #[test]
    fn last_message_column_exists() {
        let conn = in_memory_connection();

        conn.execute(
            "INSERT INTO repos (id, github_url, local_path, default_branch, added_at)
             VALUES (?1, ?2, ?3, ?4, ?5)",
            rusqlite::params![
                "r1",
                "https://github.com/a/b",
                "/tmp/b",
                "main",
                "2024-01-01"
            ],
        )
        .expect("insert repo");

        conn.execute(
            "INSERT INTO sessions (id, repo_id, name, status, last_message, created_at, state_changed_at)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)",
            rusqlite::params![
                "s1",
                "r1",
                "test session",
                "running",
                "What file should I edit?",
                "2024-01-01",
                "2024-01-01"
            ],
        )
        .expect("insert session with last_message");

        let last_message: Option<String> = conn
            .query_row(
                "SELECT last_message FROM sessions WHERE id = ?1",
                ["s1"],
                |row| row.get(0),
            )
            .expect("query last_message");

        assert_eq!(last_message, Some("What file should I edit?".to_string()));
    }

    #[test]
    fn insert_and_query_repo() {
        let conn = in_memory_connection();

        conn.execute(
            "INSERT INTO repos (id, github_url, local_path, default_branch, added_at)
             VALUES (?1, ?2, ?3, ?4, ?5)",
            rusqlite::params![
                "r1",
                "https://github.com/a/b",
                "/tmp/b",
                "main",
                "2024-01-01"
            ],
        )
        .expect("insert repo");

        let (id, url): (String, String) = conn
            .query_row(
                "SELECT id, github_url FROM repos WHERE id = ?1",
                ["r1"],
                |row| Ok((row.get(0)?, row.get(1)?)),
            )
            .expect("query repo");

        assert_eq!(id, "r1");
        assert_eq!(url, "https://github.com/a/b");
    }

    #[test]
    fn insert_and_query_session() {
        let conn = in_memory_connection();

        conn.execute(
            "INSERT INTO repos (id, github_url, local_path, default_branch, added_at)
             VALUES (?1, ?2, ?3, ?4, ?5)",
            rusqlite::params![
                "r1",
                "https://github.com/a/b",
                "/tmp/b",
                "main",
                "2024-01-01"
            ],
        )
        .expect("insert repo");

        conn.execute(
            "INSERT INTO sessions (id, repo_id, name, status, created_at, state_changed_at)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6)",
            rusqlite::params![
                "s1",
                "r1",
                "test session",
                "running",
                "2024-01-01",
                "2024-01-01"
            ],
        )
        .expect("insert session");

        let status: String = conn
            .query_row("SELECT status FROM sessions WHERE id = ?1", ["s1"], |row| {
                row.get(0)
            })
            .expect("query session");

        assert_eq!(status, "running");
    }

    #[test]
    fn db_path_returns_expected_suffix() {
        if let Ok(p) = db_path() {
            assert!(p.ends_with(".toomanytabs/toomanytabs.db"));
        }
    }

    #[test]
    fn wal_checkpoint_does_not_panic() {
        let conn = Connection::open_in_memory().expect("open in-memory db");
        // WAL checkpoint on in-memory DB is a no-op but should not panic
        run_wal_checkpoint(&conn);
    }

    #[test]
    fn reap_orphaned_sessions_updates_correct_statuses() {
        let conn = in_memory_connection();

        // Insert repo
        conn.execute(
            "INSERT INTO repos (id, github_url, local_path, default_branch, added_at)
             VALUES (?1, ?2, ?3, ?4, ?5)",
            rusqlite::params![
                "r1",
                "https://github.com/a/b",
                "/tmp/b",
                "main",
                "2024-01-01"
            ],
        )
        .expect("insert repo");

        // Insert sessions with the three valid statuses
        for (sid, status) in &[
            ("s1", "running"),
            ("s2", "attention"),
            ("s3", "done"),
        ] {
            conn.execute(
                "INSERT INTO sessions (id, repo_id, name, status, created_at, state_changed_at)
                 VALUES (?1, ?2, ?3, ?4, ?5, ?6)",
                rusqlite::params![
                    sid,
                    "r1",
                    format!("Session {}", sid),
                    status,
                    "2024-01-01",
                    "2024-01-01"
                ],
            )
            .expect("insert session");
        }

        let reaped = reap_orphaned_sessions(&conn);
        assert_eq!(reaped, 1); // only running gets reaped

        // Verify each status
        for (sid, expected) in &[
            ("s1", "attention"),
            ("s2", "attention"),
            ("s3", "done"),
        ] {
            let status: String = conn
                .query_row("SELECT status FROM sessions WHERE id = ?1", [sid], |row| {
                    row.get(0)
                })
                .unwrap();
            assert_eq!(&status, expected, "session {} should be {}", sid, expected);
        }
    }

    #[test]
    fn reap_orphaned_sessions_returns_zero_when_none_active() {
        let conn = in_memory_connection();
        let reaped = reap_orphaned_sessions(&conn);
        assert_eq!(reaped, 0);
    }

    #[test]
    fn foreign_key_enforcement() {
        let conn = in_memory_connection();
        // Trying to insert a session with nonexistent repo_id should fail
        let result = conn.execute(
            "INSERT INTO sessions (id, repo_id, name, status, created_at, state_changed_at)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6)",
            rusqlite::params![
                "s1",
                "nonexistent",
                "orphan",
                "attention",
                "2024-01-01",
                "2024-01-01"
            ],
        );
        assert!(result.is_err(), "FK should prevent orphan session insert");
    }

    #[test]
    fn schema_has_all_session_columns() {
        let conn = in_memory_connection();

        // Insert repo first
        conn.execute(
            "INSERT INTO repos (id, github_url, local_path, default_branch, added_at)
             VALUES (?1, ?2, ?3, ?4, ?5)",
            rusqlite::params!["r1", "https://github.com/a/b", "/tmp", "main", "2024-01-01"],
        )
        .expect("insert repo");

        // Insert session with ALL columns
        conn.execute(
            "INSERT INTO sessions (id, repo_id, name, branch, status, block_type, worktree_path,
             log_path, linked_issue_number, linked_pr_number, prompt,
             dangerously_skip_permissions, created_at, state_changed_at, last_message)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, ?15)",
            rusqlite::params![
                "s1",
                "r1",
                "test",
                "feat-1",
                "running",
                "question",
                "/tmp/wt",
                "/tmp/log",
                42,
                7,
                "fix the bug",
                1,
                "2024-01-01",
                "2024-01-01",
                "What file?"
            ],
        )
        .expect("insert session with all columns");

        // Read back all columns
        let (block_type, worktree_path, log_path, issue, pr, prompt, dsp, last_msg): (
            String,
            String,
            String,
            i64,
            i64,
            String,
            i64,
            String,
        ) = conn
            .query_row(
                "SELECT block_type, worktree_path, log_path, linked_issue_number,
                 linked_pr_number, prompt, dangerously_skip_permissions, last_message
                 FROM sessions WHERE id = 's1'",
                [],
                |row| {
                    Ok((
                        row.get(0)?,
                        row.get(1)?,
                        row.get(2)?,
                        row.get(3)?,
                        row.get(4)?,
                        row.get(5)?,
                        row.get(6)?,
                        row.get(7)?,
                    ))
                },
            )
            .expect("query all columns");

        assert_eq!(block_type, "question");
        assert_eq!(worktree_path, "/tmp/wt");
        assert_eq!(log_path, "/tmp/log");
        assert_eq!(issue, 42);
        assert_eq!(pr, 7);
        assert_eq!(prompt, "fix the bug");
        assert_eq!(dsp, 1);
        assert_eq!(last_msg, "What file?");
    }

    #[test]
    fn dangerously_skip_permissions_defaults_to_zero() {
        let conn = in_memory_connection();

        conn.execute(
            "INSERT INTO repos (id, github_url, local_path, default_branch, added_at)
             VALUES (?1, ?2, ?3, ?4, ?5)",
            rusqlite::params!["r1", "https://github.com/a/b", "/tmp", "main", "2024-01-01"],
        )
        .expect("insert repo");

        conn.execute(
            "INSERT INTO sessions (id, repo_id, name, status, created_at, state_changed_at)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6)",
            rusqlite::params!["s1", "r1", "test", "attention", "2024-01-01", "2024-01-01"],
        )
        .expect("insert session without dsp");

        let dsp: i64 = conn
            .query_row(
                "SELECT dangerously_skip_permissions FROM sessions WHERE id = 's1'",
                [],
                |row| row.get(0),
            )
            .expect("query dsp");
        assert_eq!(dsp, 0);
    }
}
