use std::collections::HashMap;
use std::sync::Mutex;
use std::time::Instant;

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
}

impl AppState {
    pub fn new(conn: Connection) -> Self {
        AppState {
            db: Mutex::new(conn),
            processes: Mutex::new(HashMap::new()),
            last_output_at: Mutex::new(HashMap::new()),
            shell_processes: Mutex::new(HashMap::new()),
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

        // Verify we can lock both mutexes
        let db = state.db.lock().expect("lock db");
        assert!(db.is_autocommit());
        drop(db);

        let procs = state.processes.lock().expect("lock processes");
        assert!(procs.is_empty());
        drop(procs);

        let last_output = state.last_output_at.lock().expect("lock last_output_at");
        assert!(last_output.is_empty());
    }
}
