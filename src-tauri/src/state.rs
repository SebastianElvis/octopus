use std::collections::HashMap;
use std::process::Child;
use std::sync::Mutex;
use std::time::Instant;

use rusqlite::Connection;

/// Application-wide shared state, managed by Tauri.
pub struct AppState {
    /// The SQLite database connection, protected by a mutex so it can be
    /// shared safely across Tauri command handlers.
    pub db: Mutex<Connection>,

    /// Map of session_id -> running child process.
    pub processes: Mutex<HashMap<String, Child>>,

    /// Map of session_id -> last time stdout output was observed from the process.
    pub last_output_at: Mutex<HashMap<String, Instant>>,
}

impl AppState {
    pub fn new(conn: Connection) -> Self {
        AppState {
            db: Mutex::new(conn),
            processes: Mutex::new(HashMap::new()),
            last_output_at: Mutex::new(HashMap::new()),
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
