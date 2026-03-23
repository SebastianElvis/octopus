use std::collections::HashMap;
use std::time::Instant;

use parking_lot::Mutex;
use rusqlite::Connection;

/// Wrapper to make `Box<dyn MasterPty>` Send.
///
/// SAFETY: On Unix (macOS / Linux), the concrete type `UnixMasterPty` wraps
/// an `OwnedFd` (a plain integer) with no thread-local or non-Send state.
/// We only target Unix platforms.
pub struct SendableMaster(pub Box<dyn portable_pty::MasterPty>);
unsafe impl Send for SendableMaster {}

/// A running PTY-backed Claude Code session.
pub struct PtySession {
    /// Writer handle to send input to the terminal.
    pub writer: Box<dyn std::io::Write + Send>,
    /// Process ID (for sending signals: SIGINT, SIGSTOP, SIGCONT, SIGKILL).
    pub pid: u32,
    /// Master PTY handle (for resize).
    pub master: SendableMaster,
}

/// Cached GitHub auth token with expiry tracking.
pub struct CachedToken {
    pub token: String,
    pub fetched_at: Instant,
}

/// Application-wide shared state, managed by Tauri.
pub struct AppState {
    /// The SQLite database connection, protected by a mutex so it can be
    /// shared safely across Tauri command handlers.
    pub db: Mutex<Connection>,

    /// Map of session_id -> running PTY session.
    pub processes: Mutex<HashMap<String, PtySession>>,

    /// Map of session_id -> last time stdout output was observed from the process.
    pub last_output_at: Mutex<HashMap<String, Instant>>,

    /// Map of shell_id -> running shell PTY (plain shells, not Claude sessions).
    pub shell_processes: Mutex<HashMap<String, PtySession>>,

    /// Shared HTTP client for connection reuse.
    pub http_client: reqwest::Client,

    /// Cached GitHub auth token (refreshed every 5 minutes).
    pub github_token: Mutex<Option<CachedToken>>,
}

impl AppState {
    pub fn new(conn: Connection) -> Self {
        AppState {
            db: Mutex::new(conn),
            processes: Mutex::new(HashMap::new()),
            last_output_at: Mutex::new(HashMap::new()),
            shell_processes: Mutex::new(HashMap::new()),
            http_client: reqwest::Client::new(),
            github_token: Mutex::new(None),
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn app_state_creation() {
        let conn = Connection::open_in_memory().expect("open in-memory db");
        let state = AppState::new(conn);

        // Verify we can lock both mutexes (parking_lot doesn't poison)
        let db = state.db.lock();
        assert!(db.is_autocommit());
        drop(db);

        let procs = state.processes.lock();
        assert!(procs.is_empty());
        drop(procs);

        let last_output = state.last_output_at.lock();
        assert!(last_output.is_empty());
    }

    #[test]
    fn cached_token_fields() {
        let token = CachedToken {
            token: "ghp_abc123".to_string(),
            fetched_at: Instant::now(),
        };
        assert_eq!(token.token, "ghp_abc123");
        assert!(token.fetched_at.elapsed().as_secs() < 1);
    }
}
