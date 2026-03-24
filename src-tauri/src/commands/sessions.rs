use std::io::{Read as IoRead, Write as IoWrite};
use std::path::Path;
use std::sync::atomic::{AtomicUsize, Ordering};
use std::sync::mpsc;
use std::sync::Arc;

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
    pub last_message: Option<String>,
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
// Constants
// ---------------------------------------------------------------------------

/// Maximum bytes to emit as events per session (10 MB).
const MAX_EMIT_BYTES: usize = 10 * 1024 * 1024;

/// Batch interval for throttled PTY output emission (16ms ≈ 60fps).
const BATCH_INTERVAL_MS: u64 = 16;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

fn now_iso() -> String {
    chrono::Utc::now().to_rfc3339()
}

fn update_session_status(app: &AppHandle, session_id: &str, status: &str) -> AppResult<()> {
    let now = now_iso();
    let state = app.state::<AppState>();
    let db = state.db.lock();
    db.execute(
        "UPDATE sessions SET status = ?1, state_changed_at = ?2 WHERE id = ?3",
        rusqlite::params![status, now, session_id],
    )?;
    Ok(())
}

fn update_session_block_and_message(
    app: &AppHandle,
    session_id: &str,
    block_type: &str,
    last_message: &str,
    status: &str,
) -> AppResult<()> {
    let now = now_iso();
    let state = app.state::<AppState>();
    let db = state.db.lock();
    db.execute(
        "UPDATE sessions SET block_type = ?1, last_message = ?2, status = ?3, state_changed_at = ?4 WHERE id = ?5",
        rusqlite::params![block_type, last_message, status, now, session_id],
    )?;
    Ok(())
}

fn query_session_by_id(db: &rusqlite::Connection, session_id: &str) -> AppResult<Session> {
    let mut sessions = query_sessions(
        db,
        "SELECT id, repo_id, name, branch, status, block_type, worktree_path, log_path, \
         linked_issue_number, linked_pr_number, prompt, created_at, state_changed_at, \
         dangerously_skip_permissions, last_message \
         FROM sessions WHERE id = ?1",
        &[&session_id],
    )?;
    sessions
        .pop()
        .ok_or_else(|| AppError::Custom(format!("session {} not found", session_id)))
}

fn emit_session_changed(app: &AppHandle, session_id: &str) {
    let state = app.state::<AppState>();
    let db = state.db.lock();
    if let Ok(session) = query_session_by_id(&db, session_id) {
        let _ = app.emit(
            "session-state-changed",
            SessionStateChangedPayload { session },
        );
    }
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
            last_message: row.get(14)?,
        })
    })?;

    let mut sessions = Vec::new();
    for row in rows {
        sessions.push(row?);
    }
    Ok(sessions)
}

fn lookup_repo_local_path(state: &AppState, repo_id: &str) -> AppResult<String> {
    let db = state.db.lock();
    db.query_row(
        "SELECT local_path FROM repos WHERE id = ?1",
        rusqlite::params![repo_id],
        |row| row.get(0),
    )
    .map_err(|_| AppError::Custom(format!("repo not found: {}", repo_id)))
}

/// Detect if a line of PTY output looks like a Claude permission prompt or question.
fn detect_prompt_pattern(line: &str) -> Option<(&'static str, String)> {
    let trimmed = line.trim();
    if trimmed.is_empty() {
        return None;
    }

    // Detect permission prompts (Allow/Deny patterns from Claude)
    if trimmed.contains("Allow") && trimmed.contains("Deny") {
        return Some(("permission", trimmed.to_string()));
    }
    if trimmed.contains("Yes") && trimmed.contains("No") && trimmed.contains("?") {
        return Some(("confirmation", trimmed.to_string()));
    }

    // Detect lines ending with "?" — typically questions
    if trimmed.ends_with('?') && trimmed.len() > 5 {
        return Some(("question", trimmed.to_string()));
    }

    // Detect lines ending with ":" — typically input prompts
    if trimmed.ends_with(':') && trimmed.len() > 3 {
        // Filter out common non-prompt patterns (timestamps, labels, etc.)
        if !trimmed.contains("http") && !trimmed.contains("://") {
            return Some(("input", trimmed.to_string()));
        }
    }

    None
}

/// Start the PTY reader background threads with throttled output emission.
///
/// Returns immediately. Two threads are spawned:
/// 1. Reader thread: reads from PTY, batches data, sends to emitter channel
/// 2. Emitter thread: flushes batched data as events every BATCH_INTERVAL_MS
fn start_pty_reader(
    app: AppHandle,
    session_id: String,
    reader: Box<dyn IoRead + Send>,
    child: Box<dyn portable_pty::Child + Send + Sync>,
    log_file_path: std::path::PathBuf,
) {
    let (tx, rx) = mpsc::channel::<Vec<u8>>();
    let total_emitted = Arc::new(AtomicUsize::new(0));
    let total_emitted2 = total_emitted.clone();
    let sid = session_id.clone();
    let app2 = app.clone();

    // Emitter thread: batches data and emits events at throttled rate
    let sid_emitter = session_id.clone();
    let app_emitter = app.clone();
    std::thread::spawn(move || {
        let mut batch = Vec::new();
        loop {
            // Try to receive with timeout for batching
            match rx.recv_timeout(std::time::Duration::from_millis(BATCH_INTERVAL_MS)) {
                Ok(data) => {
                    batch.extend_from_slice(&data);
                    // Drain any additional pending data
                    while let Ok(more) = rx.try_recv() {
                        batch.extend_from_slice(&more);
                    }
                }
                Err(mpsc::RecvTimeoutError::Timeout) => {
                    // Timeout — flush whatever we have
                }
                Err(mpsc::RecvTimeoutError::Disconnected) => {
                    // Channel closed — flush remaining and exit
                    if !batch.is_empty() {
                        let current = total_emitted2.load(Ordering::Relaxed);
                        if current < MAX_EMIT_BYTES {
                            let data = String::from_utf8_lossy(&batch).to_string();
                            let _ = app_emitter.emit(
                                "session-output",
                                SessionOutputPayload {
                                    session_id: sid_emitter.clone(),
                                    data,
                                },
                            );
                            total_emitted2.fetch_add(batch.len(), Ordering::Relaxed);
                        }
                    }
                    break;
                }
            }

            if !batch.is_empty() {
                let current = total_emitted2.load(Ordering::Relaxed);
                if current < MAX_EMIT_BYTES {
                    let data = String::from_utf8_lossy(&batch).to_string();
                    let _ = app_emitter.emit(
                        "session-output",
                        SessionOutputPayload {
                            session_id: sid_emitter.clone(),
                            data,
                        },
                    );
                    total_emitted2.fetch_add(batch.len(), Ordering::Relaxed);
                }
                batch.clear();
            }
        }
    });

    // Reader thread: reads from PTY, sends to channel, logs to file
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
                    let chunk = &buf[..n];

                    // Send to emitter channel (drop if channel is full/closed)
                    let _ = tx.send(chunk.to_vec());

                    // Write raw bytes to log file
                    if let Some(ref mut f) = log_file {
                        let _ = f.write_all(chunk);
                    }

                    // Update activity timestamp
                    let app_state = app2.state::<AppState>();
                    {
                        let mut lo = app_state.last_output_at.lock();
                        lo.insert(sid.clone(), std::time::Instant::now());
                    }

                    // Detect prompt patterns in output
                    let text = String::from_utf8_lossy(chunk);
                    for line in text.lines() {
                        if let Some((block_type, message)) = detect_prompt_pattern(line) {
                            if let Err(e) = update_session_block_and_message(
                                &app2, &sid, block_type, &message, "waiting",
                            ) {
                                log::warn!(
                                    "Failed to update block_type for session {}: {}",
                                    sid,
                                    e
                                );
                            }
                            emit_session_changed(&app2, &sid);
                        }
                    }
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
        {
            let mut map = app_state.processes.lock();
            map.remove(&sid);
        }
        {
            let mut lo = app_state.last_output_at.lock();
            lo.remove(&sid);
        }

        if let Err(e) = update_session_status(&app2, &sid, final_status) {
            log::error!("Failed to update session {} status: {}", sid, e);
        }
        emit_session_changed(&app2, &sid);
    });
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

    // Validate worktree path exists and is a directory
    if !Path::new(&worktree_path).is_dir() {
        return Err(AppError::Custom(format!(
            "Worktree path does not exist or is not a directory: {}",
            worktree_path
        )));
    }

    // Create log directory
    let home = dirs::home_dir().ok_or_else(|| AppError::Custom("no home dir".to_string()))?;
    let log_dir = home.join(".toomanytabs").join("logs").join(&session_id);
    std::fs::create_dir_all(&log_dir)?;
    let log_path = log_dir.to_string_lossy().to_string();

    let session_name = params.name.unwrap_or_else(|| params.branch.clone());

    // Insert session into DB
    {
        let db = state.db.lock();
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
        let mut map = state.processes.lock();
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
        let mut last_output_map = state.last_output_at.lock();
        last_output_map.insert(session_id.clone(), std::time::Instant::now());
    }

    // Start background PTY reader with throttled output
    let log_file_path = std::path::PathBuf::from(&log_path).join("stdout.log");
    start_pty_reader(
        app.clone(),
        session_id.clone(),
        reader,
        child,
        log_file_path,
    );

    let db = state.db.lock();
    query_session_by_id(&db, &session_id)
}

/// Write raw terminal input to the session's PTY.
#[tauri::command]
pub async fn write_to_session(
    state: State<'_, AppState>,
    id: String,
    data: String,
) -> AppResult<()> {
    let mut map = state.processes.lock();
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
    let map = state.processes.lock();
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

/// Send SIGINT to the running session's process group.
#[tauri::command]
pub async fn interrupt_session(
    state: State<'_, AppState>,
    id: String,
    message: Option<String>,
) -> AppResult<()> {
    let mut map = state.processes.lock();
    let pty_session = map
        .get_mut(&id)
        .ok_or_else(|| AppError::Custom(format!("no running process for session {}", id)))?;

    #[cfg(unix)]
    {
        use nix::sys::signal::{kill, Signal};
        use nix::unistd::Pid;
        // Send to process group (negative pid) for reliable signal delivery
        let pgid = -(pty_session.pid as i32);
        let result = kill(Pid::from_raw(pgid), Signal::SIGINT);
        if result.is_err() {
            // Fallback: send to process directly
            kill(Pid::from_raw(pty_session.pid as i32), Signal::SIGINT)
                .map_err(|e| AppError::Custom(format!("failed to send SIGINT: {}", e)))?;
        }
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

/// Kill the process for a session with graceful shutdown sequence:
/// SIGINT -> wait 3s -> SIGTERM -> wait 2s -> SIGKILL
/// Then clean up worktree/branch and remove from DB.
#[tauri::command]
pub async fn kill_session(
    _app: AppHandle,
    state: State<'_, AppState>,
    id: String,
) -> AppResult<()> {
    // Kill the process with graceful shutdown
    {
        let mut map = state.processes.lock();
        if let Some(pty_session) = map.remove(&id) {
            log::info!("Killing session {} (pid {})", id, pty_session.pid);
            #[cfg(unix)]
            {
                use nix::sys::signal::{kill, Signal};
                use nix::unistd::Pid;

                let pgid = -(pty_session.pid as i32);
                let pid = Pid::from_raw(pty_session.pid as i32);
                let pg_pid = Pid::from_raw(pgid);

                // Step 1: SIGINT to process group
                let _ = kill(pg_pid, Signal::SIGINT).or_else(|_| kill(pid, Signal::SIGINT));

                // Wait 3 seconds, check if still alive
                std::thread::sleep(std::time::Duration::from_secs(3));
                if kill(pid, None).is_ok() {
                    // Still alive — SIGTERM
                    let _ = kill(pg_pid, Signal::SIGTERM).or_else(|_| kill(pid, Signal::SIGTERM));

                    std::thread::sleep(std::time::Duration::from_secs(2));
                    if kill(pid, None).is_ok() {
                        // Still alive — SIGKILL
                        let _ =
                            kill(pg_pid, Signal::SIGKILL).or_else(|_| kill(pid, Signal::SIGKILL));
                    }
                }
            }
            // Dropping pty_session closes the PTY handles
        }
    }

    // Clean up last_output_at
    {
        let mut lo = state.last_output_at.lock();
        lo.remove(&id);
    }

    // Look up session info for worktree cleanup
    let (worktree_path, branch, repo_id) = {
        let db = state.db.lock();
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
        let db = state.db.lock();
        db.execute("DELETE FROM sessions WHERE id = ?1", rusqlite::params![id])?;
    }

    log::info!("Killed and removed session {}", id);
    Ok(())
}

/// Return all sessions from the database.
#[tauri::command]
pub async fn list_sessions(state: State<'_, AppState>) -> AppResult<Vec<Session>> {
    let db = state.db.lock();
    query_sessions(
        &db,
        "SELECT id, repo_id, name, branch, status, block_type, worktree_path, log_path, \
         linked_issue_number, linked_pr_number, prompt, created_at, state_changed_at, \
         dangerously_skip_permissions, last_message \
         FROM sessions ORDER BY created_at DESC",
        &[],
    )
}

/// Return a single session by id.
#[tauri::command]
pub async fn get_session(state: State<'_, AppState>, id: String) -> AppResult<Session> {
    let db = state.db.lock();
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
        let map = state.processes.lock();
        let pty_session = map
            .get(&id)
            .ok_or_else(|| AppError::Custom(format!("no running process for session {}", id)))?;

        #[cfg(unix)]
        {
            use nix::sys::signal::{kill, Signal};
            use nix::unistd::Pid;
            // Send SIGSTOP to process group
            let pgid = -(pty_session.pid as i32);
            kill(Pid::from_raw(pgid), Signal::SIGSTOP)
                .or_else(|_| kill(Pid::from_raw(pty_session.pid as i32), Signal::SIGSTOP))
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
        let map = state.processes.lock();
        map.contains_key(&id)
    };

    if has_process {
        // Process alive — send SIGCONT (paused session)
        let map = state.processes.lock();
        let pty_session = map
            .get(&id)
            .ok_or_else(|| AppError::Custom(format!("no running process for session {}", id)))?;

        #[cfg(unix)]
        {
            use nix::sys::signal::{kill, Signal};
            use nix::unistd::Pid;
            // Send SIGCONT to process group
            let pgid = -(pty_session.pid as i32);
            kill(Pid::from_raw(pgid), Signal::SIGCONT)
                .or_else(|_| kill(Pid::from_raw(pty_session.pid as i32), Signal::SIGCONT))
                .map_err(|e| AppError::Custom(format!("failed to send SIGCONT: {}", e)))?;
        }
    } else {
        // Process dead — re-spawn claude in existing worktree
        let session = {
            let db = state.db.lock();
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
            let mut map = state.processes.lock();
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
            let mut last_output_map = state.last_output_at.lock();
            last_output_map.insert(id.clone(), std::time::Instant::now());
        }

        // Start background PTY reader with throttled output
        let log_file_path = std::path::PathBuf::from(log_path).join("stdout.log");
        start_pty_reader(app.clone(), id.clone(), reader, child, log_file_path);
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
        let db = state.db.lock();
        query_sessions(
            &db,
            "SELECT id, repo_id, name, branch, status, block_type, worktree_path, log_path, \
             linked_issue_number, linked_pr_number, prompt, created_at, state_changed_at, \
             dangerously_skip_permissions, last_message \
             FROM sessions WHERE status = 'running'",
            &[],
        )?
    };

    let home = dirs::home_dir().ok_or_else(|| AppError::Custom("no home dir".to_string()))?;
    let mut stuck_ids = Vec::new();

    for session in running_sessions {
        let sid = &session.id;

        let last_output_instant = {
            let lo = state.last_output_at.lock();
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
                    Ok(modified) => modified.elapsed().is_ok_and(|e| e > STUCK_THRESHOLD),
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
        let db = state.db.lock();
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

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn detect_permission_prompt() {
        let result = detect_prompt_pattern("  Allow  |  Deny  ");
        assert!(result.is_some());
        let (bt, _) = result.unwrap();
        assert_eq!(bt, "permission");
    }

    #[test]
    fn detect_confirmation_prompt() {
        let result = detect_prompt_pattern("Do you want to continue? Yes / No");
        assert!(result.is_some());
        let (bt, _) = result.unwrap();
        assert_eq!(bt, "confirmation");
    }

    #[test]
    fn detect_question_prompt() {
        let result = detect_prompt_pattern("What file should I edit?");
        assert!(result.is_some());
        let (bt, _) = result.unwrap();
        assert_eq!(bt, "question");
    }

    #[test]
    fn detect_input_prompt() {
        let result = detect_prompt_pattern("Enter your name:");
        assert!(result.is_some());
        let (bt, _) = result.unwrap();
        assert_eq!(bt, "input");
    }

    #[test]
    fn detect_no_prompt_on_empty() {
        assert!(detect_prompt_pattern("").is_none());
        assert!(detect_prompt_pattern("   ").is_none());
    }

    #[test]
    fn detect_no_prompt_on_url() {
        assert!(detect_prompt_pattern("https://example.com:8080").is_none());
    }

    #[test]
    fn detect_no_prompt_on_short_question() {
        // Too short (<=5 chars)
        assert!(detect_prompt_pattern("ok?").is_none());
    }

    #[test]
    fn session_struct_has_last_message() {
        let session = Session {
            id: "test".to_string(),
            repo_id: None,
            name: None,
            branch: None,
            status: None,
            block_type: Some("question".to_string()),
            worktree_path: None,
            log_path: None,
            linked_issue_number: None,
            linked_pr_number: None,
            prompt: None,
            dangerously_skip_permissions: None,
            created_at: None,
            state_changed_at: None,
            last_message: Some("What file?".to_string()),
        };
        assert_eq!(session.last_message, Some("What file?".to_string()));
        assert_eq!(session.block_type, Some("question".to_string()));
    }
}
