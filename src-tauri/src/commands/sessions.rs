use std::io::Write as IoWrite;
use std::process::{Command, Stdio};

use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Emitter, Manager, State};

use crate::error::{AppError, AppResult};
use crate::state::AppState;

// ---------------------------------------------------------------------------
// Data types
// ---------------------------------------------------------------------------

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct Session {
    pub id: String,
    pub repo_id: Option<String>,
    pub name: Option<String>,
    pub branch: Option<String>,
    pub status: Option<String>,
    pub block_type: Option<String>,
    pub worktree_path: Option<String>,
    pub log_path: Option<String>,
    pub linked_issue_number: Option<i64>,
    pub linked_pr_number: Option<i64>,
    pub prompt: Option<String>,
    pub created_at: Option<String>,
    pub state_changed_at: Option<String>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct SessionStateChangedPayload {
    pub session_id: String,
    pub status: String,
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

fn now_iso() -> String {
    chrono::Utc::now().to_rfc3339()
}

fn update_session_status(app: &AppHandle, session_id: &str, status: &str) -> AppResult<()> {
    let now = now_iso();
    let state = app.state::<AppState>();
    let db = state
        .db
        .lock()
        .map_err(|e| AppError::Custom(format!("db lock poisoned: {}", e)))?;
    db.execute(
        "UPDATE sessions SET status = ?1, state_changed_at = ?2 WHERE id = ?3",
        rusqlite::params![status, now, session_id],
    )?;
    Ok(())
}

fn query_sessions(
    db: &rusqlite::Connection,
    sql: &str,
    params: &[&dyn rusqlite::types::ToSql],
) -> AppResult<Vec<Session>> {
    let mut stmt = db.prepare(sql)?;
    let rows = stmt.query_map(params, |row| {
        Ok(Session {
            id: row.get(0)?,
            repo_id: row.get(1)?,
            name: row.get(2)?,
            branch: row.get(3)?,
            status: row.get(4)?,
            block_type: row.get(5)?,
            worktree_path: row.get(6)?,
            log_path: row.get(7)?,
            linked_issue_number: row.get(8)?,
            linked_pr_number: row.get(9)?,
            prompt: row.get(10)?,
            created_at: row.get(11)?,
            state_changed_at: row.get(12)?,
        })
    })?;

    let mut sessions = Vec::new();
    for row in rows {
        sessions.push(row?);
    }
    Ok(sessions)
}

// ---------------------------------------------------------------------------
// Commands
// ---------------------------------------------------------------------------

/// Spawn a claude CLI session as a child process. Returns the session id.
#[tauri::command]
pub async fn spawn_session(
    app: AppHandle,
    state: State<'_, AppState>,
    repo_id: String,
    name: String,
    branch: String,
    prompt: String,
    worktree_path: String,
) -> AppResult<String> {
    let session_id = uuid::Uuid::new_v4().to_string();
    let now = now_iso();

    // Create log directory
    let home = dirs::home_dir().ok_or_else(|| AppError::Custom("no home dir".to_string()))?;
    let log_dir = home.join(".toomanytabs").join("logs").join(&session_id);
    std::fs::create_dir_all(&log_dir)?;

    let stdout_path = log_dir.join("stdout.log");
    let stderr_path = log_dir.join("stderr.log");
    let log_path = log_dir.to_string_lossy().to_string();

    // Insert session into DB
    {
        let db = state
            .db
            .lock()
            .map_err(|e| AppError::Custom(format!("db lock poisoned: {}", e)))?;
        db.execute(
            "INSERT INTO sessions \
             (id, repo_id, name, branch, status, worktree_path, log_path, prompt, created_at, state_changed_at) \
             VALUES (?1, ?2, ?3, ?4, 'running', ?5, ?6, ?7, ?8, ?9)",
            rusqlite::params![
                session_id, repo_id, name, branch,
                worktree_path, log_path, prompt, now, now
            ],
        )?;
    }

    // Spawn claude process
    let stdout_file = std::fs::File::create(&stdout_path)?;
    let stderr_file = std::fs::File::create(&stderr_path)?;

    let child = Command::new("claude")
        .arg("--print")
        .arg(&prompt)
        .current_dir(&worktree_path)
        .stdin(Stdio::piped())
        .stdout(stdout_file)
        .stderr(stderr_file)
        .spawn()
        .map_err(|e| AppError::Custom(format!("failed to spawn claude: {}", e)))?;

    log::info!("Spawned session {} (pid {})", session_id, child.id());

    {
        let mut map = state
            .processes
            .lock()
            .map_err(|e| AppError::Custom(format!("process map lock poisoned: {}", e)))?;
        map.insert(session_id.clone(), child);
    }

    let _ = app.emit(
        "session-state-changed",
        SessionStateChangedPayload {
            session_id: session_id.clone(),
            status: "running".to_string(),
        },
    );

    // Record initial last_output_at for the session
    {
        let mut last_output_map = state
            .last_output_at
            .lock()
            .map_err(|e| AppError::Custom(format!("last_output_at lock poisoned: {}", e)))?;
        last_output_map.insert(session_id.clone(), std::time::Instant::now());
    }

    // Background thread to detect process exit and track stdout activity
    let sid = session_id.clone();
    let app2 = app.clone();
    let stdout_path_clone = stdout_path.clone();
    std::thread::spawn(move || {
        let mut last_known_size: u64 = 0;
        loop {
            std::thread::sleep(std::time::Duration::from_secs(1));
            let app_state = app2.state::<AppState>();

            // Update last_output_at if the stdout log has grown
            if let Ok(meta) = std::fs::metadata(&stdout_path_clone) {
                let current_size = meta.len();
                if current_size > last_known_size {
                    last_known_size = current_size;
                    if let Ok(mut last_output_map) = app_state.last_output_at.lock() {
                        last_output_map.insert(sid.clone(), std::time::Instant::now());
                    }
                }
            }

            let mut map = match app_state.processes.lock() {
                Ok(m) => m,
                Err(e) => {
                    log::error!("Process map lock poisoned in watcher for {}: {}", sid, e);
                    break;
                }
            };
            if let Some(child) = map.get_mut(&sid) {
                match child.try_wait() {
                    Ok(Some(exit_status)) => {
                        let final_status = if exit_status.success() {
                            "completed"
                        } else {
                            "failed"
                        };
                        log::info!(
                            "Session {} exited with status: {} (marking as {})",
                            sid,
                            exit_status,
                            final_status
                        );

                        // Remove the finished process from the map
                        map.remove(&sid);
                        drop(map);

                        // Clean up last_output_at entry
                        if let Ok(mut last_output_map) = app_state.last_output_at.lock() {
                            last_output_map.remove(&sid);
                        }

                        if let Err(e) = update_session_status(&app2, &sid, final_status) {
                            log::error!("Failed to update session {} status: {}", sid, e);
                        }
                        let _ = app2.emit(
                            "session-state-changed",
                            SessionStateChangedPayload {
                                session_id: sid.clone(),
                                status: final_status.to_string(),
                            },
                        );
                        break;
                    }
                    Ok(None) => {
                        // Still running
                    }
                    Err(e) => {
                        log::error!("Error checking process status for {}: {}", sid, e);
                        map.remove(&sid);
                        break;
                    }
                }
            } else {
                // Process was removed externally (e.g. kill_session)
                break;
            }
        }
    });

    Ok(session_id)
}

/// Write a message to the running session's stdin.
#[tauri::command]
pub async fn reply_to_session(
    state: State<'_, AppState>,
    session_id: String,
    message: String,
) -> AppResult<()> {
    let mut map = state
        .processes
        .lock()
        .map_err(|e| AppError::Custom(format!("process map lock poisoned: {}", e)))?;
    let child = map.get_mut(&session_id).ok_or_else(|| {
        AppError::Custom(format!("no running process for session {}", session_id))
    })?;
    let stdin = child
        .stdin
        .as_mut()
        .ok_or_else(|| AppError::Custom("process has no stdin".to_string()))?;
    stdin.write_all(format!("{}\n", message).as_bytes())?;
    stdin.flush()?;
    log::info!("Sent reply to session {}", session_id);
    Ok(())
}

/// Send SIGINT to the running session then write a follow-up message.
#[tauri::command]
pub async fn interrupt_session(
    state: State<'_, AppState>,
    session_id: String,
    message: String,
) -> AppResult<()> {
    let mut map = state
        .processes
        .lock()
        .map_err(|e| AppError::Custom(format!("process map lock poisoned: {}", e)))?;
    let child = map.get_mut(&session_id).ok_or_else(|| {
        AppError::Custom(format!("no running process for session {}", session_id))
    })?;

    #[cfg(unix)]
    {
        use nix::sys::signal::{kill, Signal};
        use nix::unistd::Pid;
        kill(Pid::from_raw(child.id() as i32), Signal::SIGINT)
            .map_err(|e| AppError::Custom(format!("failed to send SIGINT: {}", e)))?;
        log::info!("Sent SIGINT to session {} (pid {})", session_id, child.id());
    }

    if !message.is_empty() {
        let stdin = child
            .stdin
            .as_mut()
            .ok_or_else(|| AppError::Custom("process has no stdin".to_string()))?;
        stdin.write_all(format!("{}\n", message).as_bytes())?;
        stdin.flush()?;
    }

    Ok(())
}

/// Kill the process for a session and mark it stopped in the DB.
#[tauri::command]
pub async fn kill_session(
    app: AppHandle,
    state: State<'_, AppState>,
    session_id: String,
) -> AppResult<()> {
    {
        let mut map = state
            .processes
            .lock()
            .map_err(|e| AppError::Custom(format!("process map lock poisoned: {}", e)))?;
        if let Some(mut child) = map.remove(&session_id) {
            log::info!("Killing session {} (pid {})", session_id, child.id());
            if let Err(e) = child.kill() {
                log::warn!("Failed to kill process for session {}: {}", session_id, e);
            }
            if let Err(e) = child.wait() {
                log::warn!(
                    "Failed to wait on process for session {}: {}",
                    session_id,
                    e
                );
            }
        }
    }

    update_session_status(&app, &session_id, "stopped")?;

    let _ = app.emit(
        "session-state-changed",
        SessionStateChangedPayload {
            session_id: session_id.clone(),
            status: "stopped".to_string(),
        },
    );

    Ok(())
}

/// Return all sessions from the database.
#[tauri::command]
pub async fn list_sessions(state: State<'_, AppState>) -> AppResult<Vec<Session>> {
    let db = state
        .db
        .lock()
        .map_err(|e| AppError::Custom(format!("db lock poisoned: {}", e)))?;
    query_sessions(
        &db,
        "SELECT id, repo_id, name, branch, status, block_type, worktree_path, log_path, \
         linked_issue_number, linked_pr_number, prompt, created_at, state_changed_at \
         FROM sessions ORDER BY created_at DESC",
        &[],
    )
}

/// Return a single session by id.
#[tauri::command]
pub async fn get_session(state: State<'_, AppState>, session_id: String) -> AppResult<Session> {
    let db = state
        .db
        .lock()
        .map_err(|e| AppError::Custom(format!("db lock poisoned: {}", e)))?;
    let mut sessions = query_sessions(
        &db,
        "SELECT id, repo_id, name, branch, status, block_type, worktree_path, log_path, \
         linked_issue_number, linked_pr_number, prompt, created_at, state_changed_at \
         FROM sessions WHERE id = ?1",
        &[&session_id],
    )?;
    sessions
        .pop()
        .ok_or_else(|| AppError::Custom(format!("session {} not found", session_id)))
}

/// Send SIGSTOP to the child process, suspending it, and mark it "paused" in the DB.
#[tauri::command]
pub async fn pause_session(
    app: AppHandle,
    state: State<'_, AppState>,
    session_id: String,
) -> AppResult<()> {
    {
        let map = state
            .processes
            .lock()
            .map_err(|e| AppError::Custom(format!("process map lock poisoned: {}", e)))?;
        let child = map.get(&session_id).ok_or_else(|| {
            AppError::Custom(format!("no running process for session {}", session_id))
        })?;

        #[cfg(unix)]
        {
            use nix::sys::signal::{kill, Signal};
            use nix::unistd::Pid;
            kill(Pid::from_raw(child.id() as i32), Signal::SIGSTOP)
                .map_err(|e| AppError::Custom(format!("failed to send SIGSTOP: {}", e)))?;
            log::info!("Sent SIGSTOP to session {} (pid {})", session_id, child.id());
        }
    }

    update_session_status(&app, &session_id, "paused")?;

    let _ = app.emit(
        "session-state-changed",
        SessionStateChangedPayload {
            session_id: session_id.clone(),
            status: "paused".to_string(),
        },
    );

    Ok(())
}

/// Send SIGCONT to the child process, resuming it, and mark it "running" in the DB.
#[tauri::command]
pub async fn resume_session(
    app: AppHandle,
    state: State<'_, AppState>,
    session_id: String,
) -> AppResult<()> {
    {
        let map = state
            .processes
            .lock()
            .map_err(|e| AppError::Custom(format!("process map lock poisoned: {}", e)))?;
        let child = map.get(&session_id).ok_or_else(|| {
            AppError::Custom(format!("no running process for session {}", session_id))
        })?;

        #[cfg(unix)]
        {
            use nix::sys::signal::{kill, Signal};
            use nix::unistd::Pid;
            kill(Pid::from_raw(child.id() as i32), Signal::SIGCONT)
                .map_err(|e| AppError::Custom(format!("failed to send SIGCONT: {}", e)))?;
            log::info!("Sent SIGCONT to session {} (pid {})", session_id, child.id());
        }
    }

    update_session_status(&app, &session_id, "running")?;

    let _ = app.emit(
        "session-state-changed",
        SessionStateChangedPayload {
            session_id: session_id.clone(),
            status: "running".to_string(),
        },
    );

    Ok(())
}

/// Inspect all "running" sessions and flag any that have not produced stdout
/// output in the last 20 minutes. Returns a list of session IDs that were
/// newly marked as "stuck".
#[tauri::command]
pub async fn check_stuck_sessions(app: AppHandle, state: State<'_, AppState>) -> AppResult<Vec<String>> {
    const STUCK_THRESHOLD: std::time::Duration = std::time::Duration::from_secs(20 * 60);

    // Collect running sessions from DB
    let running_sessions = {
        let db = state
            .db
            .lock()
            .map_err(|e| AppError::Custom(format!("db lock poisoned: {}", e)))?;
        query_sessions(
            &db,
            "SELECT id, repo_id, name, branch, status, block_type, worktree_path, log_path, \
             linked_issue_number, linked_pr_number, prompt, created_at, state_changed_at \
             FROM sessions WHERE status = 'running'",
            &[],
        )?
    };

    let home = dirs::home_dir().ok_or_else(|| AppError::Custom("no home dir".to_string()))?;
    let mut stuck_ids = Vec::new();

    for session in running_sessions {
        let sid = &session.id;

        // First check the in-memory last_output_at tracker
        let last_output_instant = {
            let last_output_map = state
                .last_output_at
                .lock()
                .map_err(|e| AppError::Custom(format!("last_output_at lock poisoned: {}", e)))?;
            last_output_map.get(sid).copied()
        };

        let is_stuck = if let Some(instant) = last_output_instant {
            instant.elapsed() > STUCK_THRESHOLD
        } else {
            // Fall back to checking the log file modification time
            let log_path = home
                .join(".toomanytabs")
                .join("logs")
                .join(sid)
                .join("stdout.log");
            match std::fs::metadata(&log_path) {
                Ok(meta) => {
                    match meta.modified() {
                        Ok(modified) => {
                            match modified.elapsed() {
                                Ok(elapsed) => elapsed > STUCK_THRESHOLD,
                                Err(_) => false, // Modified time is in the future
                            }
                        }
                        Err(_) => false,
                    }
                }
                Err(_) => false, // Log file doesn't exist yet
            }
        };

        if is_stuck {
            log::warn!("Session {} appears stuck (no output for >20 min)", sid);
            update_session_status(&app, sid, "stuck")?;

            let updated_session = {
                let db = state
                    .db
                    .lock()
                    .map_err(|e| AppError::Custom(format!("db lock poisoned: {}", e)))?;
                query_sessions(
                    &db,
                    "SELECT id, repo_id, name, branch, status, block_type, worktree_path, log_path, \
                     linked_issue_number, linked_pr_number, prompt, created_at, state_changed_at \
                     FROM sessions WHERE id = ?1",
                    &[sid as &dyn rusqlite::types::ToSql],
                )?
            };

            let _ = app.emit(
                "session-state-changed",
                SessionStateChangedPayload {
                    session_id: sid.clone(),
                    status: "stuck".to_string(),
                },
            );

            if updated_session.is_empty() {
                log::warn!("Could not re-fetch session {} after marking stuck", sid);
            }

            stuck_ids.push(sid.clone());
        }
    }

    Ok(stuck_ids)
}
