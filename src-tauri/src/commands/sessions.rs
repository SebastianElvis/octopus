use std::io::{Read as IoRead, Write as IoWrite};
use std::path::Path;

use portable_pty::{native_pty_system, CommandBuilder, PtySize};
use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Emitter, Manager, State};

use crate::error::{AppError, AppResult};
use crate::state::{AppState, PtySession, SendableMaster};

// ---------------------------------------------------------------------------
// Data types
// ---------------------------------------------------------------------------

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
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
    pub dangerously_skip_permissions: Option<bool>,
    pub created_at: Option<String>,
    pub state_changed_at: Option<String>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct SessionStateChangedPayload {
    pub session: Session,
}

#[derive(Debug, Serialize, Clone)]
#[serde(rename_all = "camelCase")]
struct SessionOutputPayload {
    session_id: String,
    data: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SpawnSessionParams {
    pub repo_id: String,
    pub branch: String,
    pub prompt: String,
    pub name: Option<String>,
    pub issue_number: Option<i64>,
    pub pr_number: Option<i64>,
    pub force: Option<bool>,
    pub dangerously_skip_permissions: Option<bool>,
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

fn query_session_by_id(db: &rusqlite::Connection, session_id: &str) -> AppResult<Session> {
    let mut sessions = query_sessions(
        db,
        "SELECT id, repo_id, name, branch, status, block_type, worktree_path, log_path, \
         linked_issue_number, linked_pr_number, prompt, created_at, state_changed_at, \
         dangerously_skip_permissions \
         FROM sessions WHERE id = ?1",
        &[&session_id],
    )?;
    sessions
        .pop()
        .ok_or_else(|| AppError::Custom(format!("session {} not found", session_id)))
}

fn emit_session_changed(app: &AppHandle, session_id: &str) {
    let state = app.state::<AppState>();
    if let Ok(db) = state.db.lock() {
        if let Ok(session) = query_session_by_id(&db, session_id) {
            let _ = app.emit(
                "session-state-changed",
                SessionStateChangedPayload { session },
            );
        }
    };
}

fn query_sessions(
    db: &rusqlite::Connection,
    sql: &str,
    params: &[&dyn rusqlite::types::ToSql],
) -> AppResult<Vec<Session>> {
    let mut stmt = db.prepare(sql)?;
    let rows = stmt.query_map(params, |row| {
        let dsp_int: Option<i64> = row.get(13)?;
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
            dangerously_skip_permissions: Some(dsp_int.unwrap_or(0) != 0),
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

fn lookup_repo_local_path(state: &AppState, repo_id: &str) -> AppResult<String> {
    let db = state
        .db
        .lock()
        .map_err(|e| AppError::Custom(format!("db lock poisoned: {}", e)))?;
    db.query_row(
        "SELECT local_path FROM repos WHERE id = ?1",
        rusqlite::params![repo_id],
        |row| row.get(0),
    )
    .map_err(|_| AppError::Custom(format!("repo not found: {}", repo_id)))
}

// ---------------------------------------------------------------------------
// Commands
// ---------------------------------------------------------------------------

/// Spawn a claude CLI session in a PTY. Creates worktree and returns
/// the full Session.
#[tauri::command]
pub async fn spawn_session(
    app: AppHandle,
    state: State<'_, AppState>,
    params: SpawnSessionParams,
) -> AppResult<Session> {
    let session_id = uuid::Uuid::new_v4().to_string();
    let now = now_iso();

    let repo_local_path = lookup_repo_local_path(&state, &params.repo_id)?;

    // Create worktree
    let worktree_path = crate::commands::worktree::create_worktree_internal(
        &repo_local_path,
        &params.branch,
        &session_id,
        params.force.unwrap_or(false),
    )?;

    // Create log directory
    let home = dirs::home_dir().ok_or_else(|| AppError::Custom("no home dir".to_string()))?;
    let log_dir = home.join(".toomanytabs").join("logs").join(&session_id);
    std::fs::create_dir_all(&log_dir)?;
    let log_path = log_dir.to_string_lossy().to_string();

    let session_name = params.name.unwrap_or_else(|| params.branch.clone());

    // Insert session into DB
    {
        let db = state
            .db
            .lock()
            .map_err(|e| AppError::Custom(format!("db lock poisoned: {}", e)))?;
        db.execute(
            "INSERT INTO sessions \
             (id, repo_id, name, branch, status, worktree_path, log_path, \
              linked_issue_number, linked_pr_number, prompt, dangerously_skip_permissions, \
              created_at, state_changed_at) \
             VALUES (?1, ?2, ?3, ?4, 'running', ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12)",
            rusqlite::params![
                session_id,
                params.repo_id,
                session_name,
                params.branch,
                worktree_path,
                log_path,
                params.issue_number,
                params.pr_number,
                params.prompt,
                params.dangerously_skip_permissions.unwrap_or(false) as i64,
                now,
                now
            ],
        )?;
    }

    // Create PTY
    let pty_system = native_pty_system();
    let pty_pair = pty_system
        .openpty(PtySize {
            rows: 24,
            cols: 80,
            pixel_width: 0,
            pixel_height: 0,
        })
        .map_err(|e| AppError::Custom(format!("failed to create PTY: {}", e)))?;

    // Clone reader and writer from master
    let reader = pty_pair
        .master
        .try_clone_reader()
        .map_err(|e| AppError::Custom(format!("failed to clone PTY reader: {}", e)))?;
    let writer = pty_pair
        .master
        .take_writer()
        .map_err(|e| AppError::Custom(format!("failed to take PTY writer: {}", e)))?;

    // Build command — run claude in interactive mode (no --print)
    let skip_permissions = params.dangerously_skip_permissions.unwrap_or(false);
    let mut cmd = CommandBuilder::new("claude");
    if skip_permissions {
        cmd.arg("--dangerously-skip-permissions");
    }
    cmd.arg(&params.prompt);
    cmd.cwd(&worktree_path);
    cmd.env("TERM", "xterm-256color");

    // Spawn on PTY slave
    let child = pty_pair
        .slave
        .spawn_command(cmd)
        .map_err(|e| AppError::Custom(format!("failed to spawn claude: {}", e)))?;

    let pid = child.process_id().unwrap_or(0);
    log::info!("Spawned session {} (pid {}) in PTY", session_id, pid);

    // Drop slave — only the child process uses it
    drop(pty_pair.slave);

    // Store PTY session in state
    {
        let mut map = state
            .processes
            .lock()
            .map_err(|e| AppError::Custom(format!("process map lock poisoned: {}", e)))?;
        map.insert(
            session_id.clone(),
            PtySession {
                writer,
                pid,
                master: SendableMaster(pty_pair.master),
            },
        );
    }

    emit_session_changed(&app, &session_id);

    // Record initial last_output_at
    {
        let mut last_output_map = state
            .last_output_at
            .lock()
            .map_err(|e| AppError::Custom(format!("last_output_at lock poisoned: {}", e)))?;
        last_output_map.insert(session_id.clone(), std::time::Instant::now());
    }

    // Background thread: read PTY output, emit events, log to file, detect exit
    let sid = session_id.clone();
    let app2 = app.clone();
    let log_file_path = std::path::PathBuf::from(&log_path).join("stdout.log");
    std::thread::spawn(move || {
        let mut reader = reader;
        let mut child = child;
        let mut buf = [0u8; 4096];

        // Open log file for appending (best-effort)
        let mut log_file = std::fs::OpenOptions::new()
            .create(true)
            .append(true)
            .open(&log_file_path)
            .ok();

        loop {
            match reader.read(&mut buf) {
                Ok(0) => break,
                Ok(n) => {
                    let data = String::from_utf8_lossy(&buf[..n]).to_string();
                    let _ = app2.emit(
                        "session-output",
                        SessionOutputPayload {
                            session_id: sid.clone(),
                            data,
                        },
                    );
                    // Write raw bytes to log file
                    if let Some(ref mut f) = log_file {
                        let _ = f.write_all(&buf[..n]);
                    }
                    // Update activity timestamp
                    let app_state = app2.state::<AppState>();
                    if let Ok(mut lo) = app_state.last_output_at.lock() {
                        lo.insert(sid.clone(), std::time::Instant::now());
                    };
                }
                Err(e) => {
                    log::error!("PTY read error for {}: {}", sid, e);
                    break;
                }
            }
        }

        // Reader closed — process exited
        let final_status = match child.wait() {
            Ok(status) if status.success() => "completed",
            _ => "failed",
        };
        log::info!("Session {} exited ({})", sid, final_status);

        // Clean up state
        let app_state = app2.state::<AppState>();
        if let Ok(mut map) = app_state.processes.lock() {
            map.remove(&sid);
        }
        if let Ok(mut lo) = app_state.last_output_at.lock() {
            lo.remove(&sid);
        }

        if let Err(e) = update_session_status(&app2, &sid, final_status) {
            log::error!("Failed to update session {} status: {}", sid, e);
        }
        emit_session_changed(&app2, &sid);
    });

    let db = state
        .db
        .lock()
        .map_err(|e| AppError::Custom(format!("db lock poisoned: {}", e)))?;
    query_session_by_id(&db, &session_id)
}

/// Write raw terminal input to the session's PTY.
#[tauri::command]
pub async fn write_to_session(
    state: State<'_, AppState>,
    id: String,
    data: String,
) -> AppResult<()> {
    let mut map = state
        .processes
        .lock()
        .map_err(|e| AppError::Custom(format!("process map lock poisoned: {}", e)))?;
    let pty_session = map
        .get_mut(&id)
        .ok_or_else(|| AppError::Custom(format!("no running process for session {}", id)))?;
    pty_session.writer.write_all(data.as_bytes())?;
    pty_session.writer.flush()?;
    Ok(())
}

/// Resize the session's PTY terminal.
#[tauri::command]
pub async fn resize_session(
    state: State<'_, AppState>,
    id: String,
    rows: u16,
    cols: u16,
) -> AppResult<()> {
    let map = state
        .processes
        .lock()
        .map_err(|e| AppError::Custom(format!("process map lock poisoned: {}", e)))?;
    let pty_session = map
        .get(&id)
        .ok_or_else(|| AppError::Custom(format!("no running process for session {}", id)))?;
    pty_session
        .master
        .0
        .resize(PtySize {
            rows,
            cols,
            pixel_width: 0,
            pixel_height: 0,
        })
        .map_err(|e| AppError::Custom(format!("failed to resize PTY: {}", e)))?;
    Ok(())
}

/// Write a message (with newline) to the session's PTY stdin.
#[tauri::command]
pub async fn reply_to_session(
    state: State<'_, AppState>,
    id: String,
    message: String,
) -> AppResult<()> {
    let mut map = state
        .processes
        .lock()
        .map_err(|e| AppError::Custom(format!("process map lock poisoned: {}", e)))?;
    let pty_session = map
        .get_mut(&id)
        .ok_or_else(|| AppError::Custom(format!("no running process for session {}", id)))?;
    pty_session
        .writer
        .write_all(format!("{}\n", message).as_bytes())?;
    pty_session.writer.flush()?;
    log::info!("Sent reply to session {}", id);
    Ok(())
}

/// Send SIGINT to the running session.
#[tauri::command]
pub async fn interrupt_session(
    state: State<'_, AppState>,
    id: String,
    message: Option<String>,
) -> AppResult<()> {
    let mut map = state
        .processes
        .lock()
        .map_err(|e| AppError::Custom(format!("process map lock poisoned: {}", e)))?;
    let pty_session = map
        .get_mut(&id)
        .ok_or_else(|| AppError::Custom(format!("no running process for session {}", id)))?;

    #[cfg(unix)]
    {
        use nix::sys::signal::{kill, Signal};
        use nix::unistd::Pid;
        kill(Pid::from_raw(pty_session.pid as i32), Signal::SIGINT)
            .map_err(|e| AppError::Custom(format!("failed to send SIGINT: {}", e)))?;
        log::info!("Sent SIGINT to session {} (pid {})", id, pty_session.pid);
    }

    if let Some(msg) = message {
        if !msg.is_empty() {
            pty_session
                .writer
                .write_all(format!("{}\n", msg).as_bytes())?;
            pty_session.writer.flush()?;
        }
    }

    Ok(())
}

/// Kill the process for a session, clean up worktree/branch, and remove from DB.
#[tauri::command]
pub async fn kill_session(
    _app: AppHandle,
    state: State<'_, AppState>,
    id: String,
) -> AppResult<()> {
    // Kill the process
    {
        let mut map = state
            .processes
            .lock()
            .map_err(|e| AppError::Custom(format!("process map lock poisoned: {}", e)))?;
        if let Some(pty_session) = map.remove(&id) {
            log::info!("Killing session {} (pid {})", id, pty_session.pid);
            #[cfg(unix)]
            {
                use nix::sys::signal::{kill, Signal};
                use nix::unistd::Pid;
                let _ = kill(Pid::from_raw(pty_session.pid as i32), Signal::SIGKILL);
            }
            // Dropping pty_session closes the PTY handles
        }
    }

    // Clean up last_output_at
    if let Ok(mut lo) = state.last_output_at.lock() {
        lo.remove(&id);
    }

    // Look up session info for worktree cleanup
    let (worktree_path, branch, repo_id) = {
        let db = state
            .db
            .lock()
            .map_err(|e| AppError::Custom(format!("db lock poisoned: {}", e)))?;
        let result: Result<(Option<String>, Option<String>, Option<String>), _> = db.query_row(
            "SELECT worktree_path, branch, repo_id FROM sessions WHERE id = ?1",
            rusqlite::params![id],
            |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?)),
        );
        result.unwrap_or((None, None, None))
    };

    // Remove worktree and delete branch
    if let (Some(wt_path), Some(br), Some(rid)) = (worktree_path, branch, repo_id) {
        if let Ok(repo_local_path) = lookup_repo_local_path(&state, &rid) {
            if let Err(e) =
                crate::commands::worktree::remove_worktree(repo_local_path, wt_path, br).await
            {
                log::warn!("Failed to clean up worktree for session {}: {}", id, e);
            }
        }
    }

    // Delete session from DB
    {
        let db = state
            .db
            .lock()
            .map_err(|e| AppError::Custom(format!("db lock poisoned: {}", e)))?;
        db.execute("DELETE FROM sessions WHERE id = ?1", rusqlite::params![id])?;
    }

    log::info!("Killed and removed session {}", id);
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
         linked_issue_number, linked_pr_number, prompt, created_at, state_changed_at, \
         dangerously_skip_permissions \
         FROM sessions ORDER BY created_at DESC",
        &[],
    )
}

/// Return a single session by id.
#[tauri::command]
pub async fn get_session(state: State<'_, AppState>, id: String) -> AppResult<Session> {
    let db = state
        .db
        .lock()
        .map_err(|e| AppError::Custom(format!("db lock poisoned: {}", e)))?;
    query_session_by_id(&db, &id)
}

/// Send SIGSTOP to suspend the session.
#[tauri::command]
pub async fn pause_session(
    app: AppHandle,
    state: State<'_, AppState>,
    id: String,
) -> AppResult<()> {
    {
        let map = state
            .processes
            .lock()
            .map_err(|e| AppError::Custom(format!("process map lock poisoned: {}", e)))?;
        let pty_session = map
            .get(&id)
            .ok_or_else(|| AppError::Custom(format!("no running process for session {}", id)))?;

        #[cfg(unix)]
        {
            use nix::sys::signal::{kill, Signal};
            use nix::unistd::Pid;
            kill(Pid::from_raw(pty_session.pid as i32), Signal::SIGSTOP)
                .map_err(|e| AppError::Custom(format!("failed to send SIGSTOP: {}", e)))?;
        }
    }

    update_session_status(&app, &id, "paused")?;
    emit_session_changed(&app, &id);
    Ok(())
}

/// Resume a session. If the process is still alive (paused), send SIGCONT.
/// If the process is dead (interrupted/failed/stuck), re-spawn claude in
/// the existing worktree.
#[tauri::command]
pub async fn resume_session(
    app: AppHandle,
    state: State<'_, AppState>,
    id: String,
) -> AppResult<()> {
    // Check if process is still alive in memory
    let has_process = {
        let map = state
            .processes
            .lock()
            .map_err(|e| AppError::Custom(format!("process map lock poisoned: {}", e)))?;
        map.contains_key(&id)
    };

    if has_process {
        // Process alive — send SIGCONT (paused session)
        let map = state
            .processes
            .lock()
            .map_err(|e| AppError::Custom(format!("process map lock poisoned: {}", e)))?;
        let pty_session = map
            .get(&id)
            .ok_or_else(|| AppError::Custom(format!("no running process for session {}", id)))?;

        #[cfg(unix)]
        {
            use nix::sys::signal::{kill, Signal};
            use nix::unistd::Pid;
            kill(Pid::from_raw(pty_session.pid as i32), Signal::SIGCONT)
                .map_err(|e| AppError::Custom(format!("failed to send SIGCONT: {}", e)))?;
        }
    } else {
        // Process dead — re-spawn claude in existing worktree
        let session = {
            let db = state
                .db
                .lock()
                .map_err(|e| AppError::Custom(format!("db lock poisoned: {}", e)))?;
            query_session_by_id(&db, &id)?
        };

        let worktree_path = session
            .worktree_path
            .as_deref()
            .ok_or_else(|| AppError::Custom("session has no worktree path".to_string()))?;

        // Validate worktree still exists
        if !Path::new(worktree_path).is_dir() {
            return Err(AppError::Custom(
                "Worktree no longer exists. Session cannot be resumed.".to_string(),
            ));
        }

        let log_path = session.log_path.as_deref().unwrap_or("");

        // Create PTY
        let pty_system = native_pty_system();
        let pty_pair = pty_system
            .openpty(PtySize {
                rows: 24,
                cols: 80,
                pixel_width: 0,
                pixel_height: 0,
            })
            .map_err(|e| AppError::Custom(format!("failed to create PTY: {}", e)))?;

        let reader = pty_pair
            .master
            .try_clone_reader()
            .map_err(|e| AppError::Custom(format!("failed to clone PTY reader: {}", e)))?;
        let writer = pty_pair
            .master
            .take_writer()
            .map_err(|e| AppError::Custom(format!("failed to take PTY writer: {}", e)))?;

        // Spawn claude --continue in the existing worktree
        let mut cmd = CommandBuilder::new("claude");
        if session.dangerously_skip_permissions.unwrap_or(false) {
            cmd.arg("--dangerously-skip-permissions");
        }
        cmd.arg("--continue");
        cmd.cwd(worktree_path);
        cmd.env("TERM", "xterm-256color");

        let child = pty_pair
            .slave
            .spawn_command(cmd)
            .map_err(|e| AppError::Custom(format!("failed to spawn claude: {}", e)))?;

        let pid = child.process_id().unwrap_or(0);
        log::info!("Resumed session {} (pid {}) in PTY", id, pid);

        drop(pty_pair.slave);

        // Store PTY session in state
        {
            let mut map = state
                .processes
                .lock()
                .map_err(|e| AppError::Custom(format!("process map lock poisoned: {}", e)))?;
            map.insert(
                id.clone(),
                PtySession {
                    writer,
                    pid,
                    master: SendableMaster(pty_pair.master),
                },
            );
        }

        // Record initial last_output_at
        {
            let mut last_output_map = state
                .last_output_at
                .lock()
                .map_err(|e| AppError::Custom(format!("last_output_at lock poisoned: {}", e)))?;
            last_output_map.insert(id.clone(), std::time::Instant::now());
        }

        // Background thread: read PTY output, emit events, log to file
        let sid = id.clone();
        let app2 = app.clone();
        let log_file_path = std::path::PathBuf::from(log_path).join("stdout.log");
        std::thread::spawn(move || {
            let mut reader = reader;
            let mut child = child;
            let mut buf = [0u8; 4096];

            let mut log_file = std::fs::OpenOptions::new()
                .create(true)
                .append(true)
                .open(&log_file_path)
                .ok();

            loop {
                match reader.read(&mut buf) {
                    Ok(0) => break,
                    Ok(n) => {
                        let data = String::from_utf8_lossy(&buf[..n]).to_string();
                        let _ = app2.emit(
                            "session-output",
                            SessionOutputPayload {
                                session_id: sid.clone(),
                                data,
                            },
                        );
                        if let Some(ref mut f) = log_file {
                            let _ = f.write_all(&buf[..n]);
                        }
                        let app_state = app2.state::<AppState>();
                        if let Ok(mut lo) = app_state.last_output_at.lock() {
                            lo.insert(sid.clone(), std::time::Instant::now());
                        };
                    }
                    Err(e) => {
                        log::error!("PTY read error for {}: {}", sid, e);
                        break;
                    }
                }
            }

            let final_status = match child.wait() {
                Ok(status) if status.success() => "completed",
                _ => "failed",
            };
            log::info!("Session {} exited ({})", sid, final_status);

            let app_state = app2.state::<AppState>();
            if let Ok(mut map) = app_state.processes.lock() {
                map.remove(&sid);
            }
            if let Ok(mut lo) = app_state.last_output_at.lock() {
                lo.remove(&sid);
            }

            if let Err(e) = update_session_status(&app2, &sid, final_status) {
                log::error!("Failed to update session {} status: {}", sid, e);
            }
            emit_session_changed(&app2, &sid);
        });
    }

    update_session_status(&app, &id, "running")?;
    emit_session_changed(&app, &id);
    Ok(())
}

/// Flag sessions with no output for >20 minutes as "stuck".
#[tauri::command]
pub async fn check_stuck_sessions(
    app: AppHandle,
    state: State<'_, AppState>,
) -> AppResult<Vec<String>> {
    const STUCK_THRESHOLD: std::time::Duration = std::time::Duration::from_secs(20 * 60);

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

        let last_output_instant = {
            let lo = state
                .last_output_at
                .lock()
                .map_err(|e| AppError::Custom(format!("lock poisoned: {}", e)))?;
            lo.get(sid).copied()
        };

        let is_stuck = if let Some(instant) = last_output_instant {
            instant.elapsed() > STUCK_THRESHOLD
        } else {
            let log_path = home
                .join(".toomanytabs")
                .join("logs")
                .join(sid)
                .join("stdout.log");
            match std::fs::metadata(&log_path) {
                Ok(meta) => match meta.modified() {
                    Ok(modified) => modified.elapsed().map_or(false, |e| e > STUCK_THRESHOLD),
                    Err(_) => false,
                },
                Err(_) => false,
            }
        };

        if is_stuck {
            log::warn!("Session {} appears stuck", sid);
            update_session_status(&app, sid, "stuck")?;
            emit_session_changed(&app, sid);
            stuck_ids.push(sid.clone());
        }
    }

    Ok(stuck_ids)
}

/// Read the saved terminal output log for a session.
#[tauri::command]
pub async fn read_session_log(state: State<'_, AppState>, id: String) -> AppResult<String> {
    let log_path = {
        let db = state
            .db
            .lock()
            .map_err(|e| AppError::Custom(format!("db lock poisoned: {}", e)))?;
        let session = query_session_by_id(&db, &id)?;
        session.log_path.unwrap_or_default()
    };

    if log_path.is_empty() {
        return Ok(String::new());
    }

    let log_file = Path::new(&log_path).join("stdout.log");
    match std::fs::read_to_string(&log_file) {
        Ok(contents) => Ok(contents),
        Err(_) => Ok(String::new()),
    }
}
