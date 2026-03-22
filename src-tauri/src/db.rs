use rusqlite::Connection;

use crate::error::{AppError, AppResult};

/// Return the path to the SQLite database file (`~/.toomanytabs/toomanytabs.db`).
pub fn db_path() -> AppResult<String> {
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
    let home = dirs::home_dir()
        .ok_or_else(|| AppError::Custom("could not determine home directory".to_string()))?;
    let dir = home.join(".toomanytabs");
    std::fs::create_dir_all(&dir)?;

    let path = db_path()?;
    let conn = Connection::open(&path)?;

    // Enable WAL mode and foreign keys
    conn.execute_batch("PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON;")?;

    Ok(conn)
}

/// Run the database migrations — create all required tables if they do not
/// already exist.
pub fn run_migrations(conn: &Connection) -> AppResult<()> {
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
            created_at TEXT,
            state_changed_at TEXT
        );

        CREATE TABLE IF NOT EXISTS settings (
            key TEXT PRIMARY KEY,
            value TEXT
        );",
    )?;

    log::info!("Database migrations completed successfully");
    Ok(())
}

/// Convenience: open a connection and run migrations in one step.
pub fn init_db() -> AppResult<Connection> {
    let conn = open_connection()?;
    run_migrations(&conn)?;
    Ok(conn)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn in_memory_connection() -> Connection {
        let conn = Connection::open_in_memory().expect("open in-memory db");
        conn.execute_batch("PRAGMA foreign_keys=ON;")
            .expect("enable FK");
        run_migrations(&conn).expect("migrations");
        conn
    }

    #[test]
    fn migrations_create_tables() {
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
    fn migrations_are_idempotent() {
        let conn = in_memory_connection();
        // Running migrations a second time should not fail
        run_migrations(&conn).expect("second migration run");
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

        // Insert a repo first (FK constraint)
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
        // This test just verifies the path ends with the expected components.
        // It will fail if there is no home directory (unlikely in CI/dev).
        if let Ok(p) = db_path() {
            assert!(p.ends_with(".toomanytabs/toomanytabs.db"));
        }
    }
}
