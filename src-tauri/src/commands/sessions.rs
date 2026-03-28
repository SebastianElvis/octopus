use std::io::{BufRead, Write as IoWrite};
use std::path::Path;
use std::sync::mpsc;
use std::sync::{Arc, Mutex};

use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Emitter, Manager, State};

use crate::error::{AppError, AppResult};
use crate::state::{AppState, ClaudeProcess};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/// Strip ANSI escape sequences from a string.
///
/// PTY output may include cursor-positioning, color, and other escape codes
/// that would prevent JSON parsing. This strips CSI sequences (\x1b[...X),
/// OSC sequences (\x1b]...\x07 or \x1b]...\x1b\\), and simple \x1b(X) escapes.
fn strip_ansi_escapes(input: &str) -> String {
    let mut result = String::with_capacity(input.len());
    let mut chars = input.chars().peekable();
    while let Some(c) = chars.next() {
        if c == '\x1b' {
            match chars.peek() {
                Some('[') => {
                    // CSI sequence: \x1b[ ... (ends at letter)
                    chars.next();
                    while let Some(&next) = chars.peek() {
                        chars.next();
                        if next.is_ascii_alphabetic() || next == '~' {
                            break;
                        }
                    }
                }
                Some(']') => {
                    // OSC sequence: \x1b] ... (ends at BEL \x07 or ST \x1b\\)
                    chars.next();
                    while let Some(&next) = chars.peek() {
                        if next == '\x07' {
                            chars.next();
                            break;
                        }
                        if next == '\x1b' {
                            chars.next();
                            if chars.peek() == Some(&'\\') {
                                chars.next();
                            }
                            break;
                        }
                        chars.next();
                    }
                }
                Some('(' | ')') => {
                    // Character set designation: \x1b(X or \x1b)X
                    chars.next();
                    chars.next();
                }
                Some(_) => {
                    // Single-character escape (e.g. \x1b=, \x1b>)
                    chars.next();
                }
                None => {}
            }
        } else if c == '\r' {
            // Strip carriage returns (PTY uses \r\n)
            continue;
        } else {
            result.push(c);
        }
    }
    result
}

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
struct SessionStructuredPayload {
    session_id: String,
    event: serde_json::Value,
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

/// Start a structured JSON reader for Claude's stream-json output format.
///
/// Drain stderr to a log file to prevent pipe buffer deadlock.
fn drain_stderr(
    stderr: std::process::ChildStderr,
    log_path: &std::path::Path,
    session_id: &str,
) {
    let reader = std::io::BufReader::new(stderr);
    let mut log_file = std::fs::OpenOptions::new()
        .create(true)
        .append(true)
        .open(log_path)
        .ok();

    for line in reader.lines() {
        match line {
            Ok(line) => {
                if let Some(ref mut f) = log_file {
                    let _ = f.write_all(line.as_bytes());
                    let _ = f.write_all(b"\n");
                }
                if !line.trim().is_empty() {
                    log::debug!("Session {} stderr: {}", session_id, line);
                }
            }
            Err(_) => break,
        }
    }
}

/// Reads NDJSON lines from the child's stdout pipe, emits Tauri events, and
/// logs raw output to disk. Determines final session status from the `result`
/// event's subtype (authoritative), falling back to exit code.
fn start_structured_reader(
    app: AppHandle,
    session_id: String,
    stdout: std::process::ChildStdout,
    mut child: std::process::Child,
    log_file_path: std::path::PathBuf,
) {
    let (tx, rx) = mpsc::channel::<serde_json::Value>();

    // Shared: the emitter thread records the last result subtype so the reader
    // thread can use it to determine the final session status.
    let result_subtype: Arc<Mutex<Option<String>>> = Arc::new(Mutex::new(None));
    let result_subtype_writer = Arc::clone(&result_subtype);

    // Emitter thread: receives parsed JSON values and emits events
    let sid_emitter = session_id.clone();
    let app_emitter = app.clone();
    std::thread::spawn(move || {
        while let Ok(event) = rx.recv() {
            // Emit structured event
            let _ = app_emitter.emit(
                "session-structured-output",
                SessionStructuredPayload {
                    session_id: sid_emitter.clone(),
                    event: event.clone(),
                },
            );

            // Record result event subtype for final status determination
            if let Some(event_type) = event.get("type").and_then(|v| v.as_str()) {
                if event_type == "result" {
                    if let Some(subtype) = event.get("subtype").and_then(|v| v.as_str()) {
                        *result_subtype_writer.lock().unwrap() = Some(subtype.to_string());
                        match subtype {
                            "success" => {
                                log::info!("Session {} received success result", sid_emitter);
                            }
                            _ => {
                                let error_msg = event
                                    .get("error")
                                    .and_then(|v| v.as_str())
                                    .unwrap_or("unknown");
                                log::warn!(
                                    "Session {} received result subtype={}: {}",
                                    sid_emitter,
                                    subtype,
                                    error_msg
                                );
                            }
                        }
                    }
                }
            }
        }
    });

    // Reader thread: reads stdout line by line, parses JSON, sends to emitter
    let sid = session_id.clone();
    let app2 = app.clone();
    std::thread::spawn(move || {
        let reader = std::io::BufReader::new(stdout);

        // Open log file for appending (best-effort)
        let mut log_file = std::fs::OpenOptions::new()
            .create(true)
            .append(true)
            .open(&log_file_path)
            .ok();

        for line_result in reader.lines() {
            match line_result {
                Ok(line) => {
                    // Write to log file (raw line + newline)
                    if let Some(ref mut f) = log_file {
                        let _ = f.write_all(line.as_bytes());
                        let _ = f.write_all(b"\n");
                        let _ = f.flush();
                    }

                    // Update activity timestamp
                    let app_state = app2.state::<AppState>();
                    {
                        let mut lo = app_state.last_output_at.lock();
                        lo.insert(sid.clone(), std::time::Instant::now());
                    }

                    let trimmed = line.trim();
                    if trimmed.is_empty() {
                        continue;
                    }

                    // Parse as JSON — with piped stdout there are no ANSI escapes
                    match serde_json::from_str::<serde_json::Value>(trimmed) {
                        Ok(json_event) => {
                            let _ = tx.send(json_event);
                        }
                        Err(_) => {
                            // Non-JSON line (Claude startup banner, etc.)
                            log::debug!("Non-JSON line from session {}: {}", sid, trimmed);
                        }
                    }
                }
                Err(e) => {
                    log::error!("Stdout read error for session {}: {}", sid, e);
                    break;
                }
            }
        }

        // Stdout closed — process exited (or is about to).
        // Determine final status from (in priority order):
        // 1. The result event's subtype (authoritative — from Claude itself)
        // 2. Whether the user explicitly interrupted (SIGINT via UI)
        // 3. Process exit code (fallback)
        let app_state = app2.state::<AppState>();
        let was_interrupted = app_state.interrupted_sessions.lock().remove(&sid);
        let last_result = result_subtype.lock().unwrap().take();
        let final_status = match last_result.as_deref() {
            Some("success") => "completed",
            Some(_) if was_interrupted => "killed",
            Some(_) => "failed",
            None if was_interrupted => "killed",
            None => match child.wait() {
                Ok(status) if status.success() => "completed",
                _ => "failed",
            },
        };
        log::info!(
            "Session {} exited ({}, result_subtype={:?}, interrupted={})",
            sid,
            final_status,
            last_result,
            was_interrupted
        );

        // Clean up state
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

    // Build and spawn command with piped I/O (not PTY)
    let skip_permissions = params.dangerously_skip_permissions.unwrap_or(false);
    let mut cmd = std::process::Command::new("claude");
    cmd.arg("--print"); // Non-interactive single-prompt mode
    cmd.arg("--output-format").arg("stream-json");
    cmd.arg("--verbose"); // Required for stream-json in print mode
    if skip_permissions {
        cmd.arg("--dangerously-skip-permissions");
    }
    cmd.arg(&params.prompt);
    cmd.current_dir(&worktree_path);
    cmd.stdin(std::process::Stdio::null()); // No stdin needed for print mode
    cmd.stdout(std::process::Stdio::piped());
    cmd.stderr(std::process::Stdio::piped());

    // Create new process group so we can signal the whole group
    #[cfg(unix)]
    {
        use std::os::unix::process::CommandExt;
        cmd.process_group(0);
    }

    let mut child = cmd
        .spawn()
        .map_err(|e| AppError::Custom(format!("failed to spawn claude: {}", e)))?;

    let stdout = child
        .stdout
        .take()
        .ok_or_else(|| AppError::Custom("failed to capture stdout".to_string()))?;
    let stderr = child.stderr.take();

    let pid = child.id();
    log::info!("Spawned session {} (pid {}) in print mode", session_id, pid);

    // Drain stderr to a log file in a background thread to prevent pipe buffer deadlock
    let stderr_path = std::path::PathBuf::from(&log_path).join("stderr.log");
    let stderr_sid = session_id.clone();
    if let Some(stderr) = stderr {
        std::thread::spawn(move || {
            drain_stderr(stderr, &stderr_path, &stderr_sid);
        });
    }

    // Store process in state (for signal management)
    {
        let mut map = state.processes.lock();
        map.insert(session_id.clone(), ClaudeProcess { pid });
    }

    emit_session_changed(&app, &session_id);

    // Record initial last_output_at
    {
        let mut last_output_map = state.last_output_at.lock();
        last_output_map.insert(session_id.clone(), std::time::Instant::now());
    }

    // Start background structured JSON reader
    let log_file_path = std::path::PathBuf::from(&log_path).join("stdout.log");
    start_structured_reader(app.clone(), session_id.clone(), stdout, child, log_file_path);

    let db = state.db.lock();
    query_session_by_id(&db, &session_id)
}

/// Write raw input to the session's stdin pipe.
#[tauri::command]
pub async fn write_to_session(
    state: State<'_, AppState>,
    id: String,
    _data: String,
) -> AppResult<()> {
    // Print-mode sessions have no stdin — write is not supported
    let map = state.processes.lock();
    if !map.contains_key(&id) {
        return Err(AppError::Custom(format!("no running process for session {}", id)));
    }
    log::warn!("write_to_session called but print-mode sessions have no stdin (session {})", id);
    Ok(())
}

/// Send a user response to the session.
/// Note: Print-mode sessions don't support interactive responses.
#[tauri::command]
pub async fn respond_to_session(
    app: AppHandle,
    state: State<'_, AppState>,
    id: String,
    _response: String,
) -> AppResult<()> {
    {
        let map = state.processes.lock();
        if !map.contains_key(&id) {
            return Err(AppError::Custom(format!("no running process for session {}", id)));
        }
        log::warn!("respond_to_session called but print-mode sessions have no stdin (session {})", id);
    }

    // Update session status back to running
    update_session_status(&app, &id, "running")?;
    // Clear block type
    {
        let state_ref = app.state::<AppState>();
        let db = state_ref.db.lock();
        db.execute(
            "UPDATE sessions SET block_type = NULL, status = 'running', state_changed_at = ?1 WHERE id = ?2",
            rusqlite::params![now_iso(), id],
        )?;
    }
    emit_session_changed(&app, &id);
    Ok(())
}

/// Resize the session (no-op for piped sessions — kept for API compatibility).
#[tauri::command]
pub async fn resize_session(
    _state: State<'_, AppState>,
    _id: String,
    _rows: u16,
    _cols: u16,
) -> AppResult<()> {
    // Claude sessions use piped I/O, not a PTY, so there is nothing to resize.
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
    let process = map
        .get_mut(&id)
        .ok_or_else(|| AppError::Custom(format!("no running process for session {}", id)))?;

    #[cfg(unix)]
    {
        use nix::sys::signal::{kill, Signal};
        use nix::unistd::Pid;
        // Send to process group (negative pid) for reliable signal delivery
        let pgid = -(process.pid as i32);
        let result = kill(Pid::from_raw(pgid), Signal::SIGINT);
        if result.is_err() {
            // Fallback: send to process directly
            kill(Pid::from_raw(process.pid as i32), Signal::SIGINT)
                .map_err(|e| AppError::Custom(format!("failed to send SIGINT: {}", e)))?;
        }
        log::info!("Sent SIGINT to session {} (pid {})", id, process.pid);
    }

    // Mark as interrupted so the reader thread uses "killed" instead of "completed"
    state.interrupted_sessions.lock().insert(id.clone());

    // Print-mode sessions have no stdin, so we skip writing a message
    if message.is_some() {
        log::debug!("interrupt_session: message ignored for print-mode session {}", id);
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
        if let Some(process) = map.remove(&id) {
            log::info!("Killing session {} (pid {})", id, process.pid);
            #[cfg(unix)]
            {
                use nix::sys::signal::{kill, Signal};
                use nix::unistd::Pid;

                let pgid = -(process.pid as i32);
                let pid = Pid::from_raw(process.pid as i32);
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
            // Dropping process closes stdin pipe
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
        let process = map
            .get(&id)
            .ok_or_else(|| AppError::Custom(format!("no running process for session {}", id)))?;

        #[cfg(unix)]
        {
            use nix::sys::signal::{kill, Signal};
            use nix::unistd::Pid;
            // Send SIGSTOP to process group
            let pgid = -(process.pid as i32);
            kill(Pid::from_raw(pgid), Signal::SIGSTOP)
                .or_else(|_| kill(Pid::from_raw(process.pid as i32), Signal::SIGSTOP))
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
        let process = map
            .get(&id)
            .ok_or_else(|| AppError::Custom(format!("no running process for session {}", id)))?;

        #[cfg(unix)]
        {
            use nix::sys::signal::{kill, Signal};
            use nix::unistd::Pid;
            // Send SIGCONT to process group
            let pgid = -(process.pid as i32);
            kill(Pid::from_raw(pgid), Signal::SIGCONT)
                .or_else(|_| kill(Pid::from_raw(process.pid as i32), Signal::SIGCONT))
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

        // Spawn claude --continue in print mode with piped I/O
        let mut cmd = std::process::Command::new("claude");
        cmd.arg("--print"); // Non-interactive mode
        cmd.arg("--continue");
        cmd.arg("--output-format").arg("stream-json");
        cmd.arg("--verbose"); // Required for stream-json in print mode
        if session.dangerously_skip_permissions.unwrap_or(false) {
            cmd.arg("--dangerously-skip-permissions");
        }
        cmd.current_dir(worktree_path);
        cmd.stdin(std::process::Stdio::null());
        cmd.stdout(std::process::Stdio::piped());
        cmd.stderr(std::process::Stdio::piped());

        #[cfg(unix)]
        {
            use std::os::unix::process::CommandExt;
            cmd.process_group(0);
        }

        let mut child = cmd
            .spawn()
            .map_err(|e| AppError::Custom(format!("failed to spawn claude: {}", e)))?;

        let stdout = child
            .stdout
            .take()
            .ok_or_else(|| AppError::Custom("failed to capture stdout".to_string()))?;
        let stderr = child.stderr.take();

        let pid = child.id();
        log::info!("Resumed session {} (pid {}) in print mode", id, pid);

        // Drain stderr to prevent pipe buffer deadlock
        let stderr_path = std::path::PathBuf::from(log_path).join("stderr.log");
        let stderr_sid = id.clone();
        if let Some(stderr) = stderr {
            std::thread::spawn(move || {
                drain_stderr(stderr, &stderr_path, &stderr_sid);
            });
        }

        // Store process in state (for signal management)
        {
            let mut map = state.processes.lock();
            map.insert(id.clone(), ClaudeProcess { pid });
        }

        // Record initial last_output_at
        {
            let mut last_output_map = state.last_output_at.lock();
            last_output_map.insert(id.clone(), std::time::Instant::now());
        }

        // Start background structured JSON reader
        let log_file_path = std::path::PathBuf::from(log_path).join("stdout.log");
        start_structured_reader(app.clone(), id.clone(), stdout, child, log_file_path);
    }

    update_session_status(&app, &id, "running")?;
    emit_session_changed(&app, &id);
    Ok(())
}

/// Send a follow-up prompt to a completed/failed session.
/// Runs `claude --print --continue --output-format stream-json --verbose <prompt>`
/// in the session's worktree, continuing the Claude conversation.
#[tauri::command]
pub async fn send_followup(
    app: AppHandle,
    state: State<'_, AppState>,
    id: String,
    prompt: String,
) -> AppResult<()> {
    // Ensure no process is currently running for this session
    {
        let map = state.processes.lock();
        if map.contains_key(&id) {
            return Err(AppError::Custom(
                "Session already has a running process".to_string(),
            ));
        }
    }

    let session = {
        let db = state.db.lock();
        query_session_by_id(&db, &id)?
    };

    let worktree_path = session
        .worktree_path
        .as_deref()
        .ok_or_else(|| AppError::Custom("session has no worktree path".to_string()))?;

    if !Path::new(worktree_path).is_dir() {
        return Err(AppError::Custom(
            "Worktree no longer exists. Cannot send follow-up.".to_string(),
        ));
    }

    let log_path = session.log_path.as_deref().unwrap_or("");

    let mut cmd = std::process::Command::new("claude");
    cmd.arg("--print");
    cmd.arg("--continue");
    cmd.arg("--output-format").arg("stream-json");
    cmd.arg("--verbose");
    if session.dangerously_skip_permissions.unwrap_or(false) {
        cmd.arg("--dangerously-skip-permissions");
    }
    cmd.arg(&prompt);
    cmd.current_dir(worktree_path);
    cmd.stdin(std::process::Stdio::null());
    cmd.stdout(std::process::Stdio::piped());
    cmd.stderr(std::process::Stdio::piped());

    #[cfg(unix)]
    {
        use std::os::unix::process::CommandExt;
        cmd.process_group(0);
    }

    let mut child = cmd
        .spawn()
        .map_err(|e| AppError::Custom(format!("failed to spawn claude: {}", e)))?;

    let stdout = child
        .stdout
        .take()
        .ok_or_else(|| AppError::Custom("failed to capture stdout".to_string()))?;
    let stderr = child.stderr.take();

    let pid = child.id();
    log::info!(
        "Follow-up for session {} (pid {}): {}",
        id,
        pid,
        prompt.chars().take(80).collect::<String>()
    );

    // Drain stderr
    let stderr_path = std::path::PathBuf::from(log_path).join("stderr.log");
    let stderr_sid = id.clone();
    if let Some(stderr) = stderr {
        std::thread::spawn(move || {
            drain_stderr(stderr, &stderr_path, &stderr_sid);
        });
    }

    // Store process
    {
        let mut map = state.processes.lock();
        map.insert(id.clone(), ClaudeProcess { pid });
    }

    // Record last_output_at
    {
        let mut last_output_map = state.last_output_at.lock();
        last_output_map.insert(id.clone(), std::time::Instant::now());
    }

    // Start structured reader
    let log_file_path = std::path::PathBuf::from(log_path).join("stdout.log");
    start_structured_reader(app.clone(), id.clone(), stdout, child, log_file_path);

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

/// Read the structured event history from stdout.log, returning parsed JSON events.
///
/// Each line in stdout.log is attempted as JSON. Lines that parse successfully
/// are returned as a JSON array. Non-JSON lines (startup messages etc.) are skipped.
#[tauri::command]
pub async fn read_session_events(
    state: State<'_, AppState>,
    id: String,
) -> AppResult<Vec<serde_json::Value>> {
    let log_path = {
        let db = state.db.lock();
        let session = query_session_by_id(&db, &id)?;
        session.log_path.unwrap_or_default()
    };

    if log_path.is_empty() {
        return Ok(Vec::new());
    }

    let log_file = Path::new(&log_path).join("stdout.log");
    let contents = match std::fs::read_to_string(&log_file) {
        Ok(c) => c,
        Err(_) => return Ok(Vec::new()),
    };

    let events: Vec<serde_json::Value> = contents
        .lines()
        .filter_map(|line| {
            let clean = strip_ansi_escapes(line.trim());
            if clean.is_empty() {
                return None;
            }
            serde_json::from_str::<serde_json::Value>(&clean).ok()
        })
        .collect();

    Ok(events)
}

#[cfg(test)]
mod tests {
    use super::*;

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

    // -- Session serialization --

    #[test]
    fn session_serializes_to_camel_case() {
        let session = Session {
            id: "s1".to_string(),
            repo_id: Some("r1".to_string()),
            name: Some("test".to_string()),
            branch: Some("main".to_string()),
            status: Some("running".to_string()),
            block_type: None,
            worktree_path: Some("/tmp/wt".to_string()),
            log_path: Some("/tmp/log".to_string()),
            linked_issue_number: Some(42),
            linked_pr_number: Some(7),
            prompt: Some("fix bug".to_string()),
            dangerously_skip_permissions: Some(false),
            created_at: Some("2024-01-01".to_string()),
            state_changed_at: Some("2024-01-01".to_string()),
            last_message: None,
        };

        let json = serde_json::to_value(&session).unwrap();
        // Verify camelCase keys
        assert!(json.get("repoId").is_some());
        assert!(json.get("worktreePath").is_some());
        assert!(json.get("logPath").is_some());
        assert!(json.get("linkedIssueNumber").is_some());
        assert!(json.get("linkedPrNumber").is_some());
        assert!(json.get("dangerouslySkipPermissions").is_some());
        assert!(json.get("stateChangedAt").is_some());
        assert!(json.get("lastMessage").is_some());
        assert!(json.get("blockType").is_some());
        // Verify snake_case keys are NOT present
        assert!(json.get("repo_id").is_none());
        assert!(json.get("worktree_path").is_none());
    }

    #[test]
    fn spawn_session_params_deserializes_from_camel_case() {
        let json = r#"{
            "repoId": "r1",
            "branch": "main",
            "prompt": "fix bug",
            "name": "test session",
            "issueNumber": 42,
            "prNumber": 7,
            "force": true,
            "dangerouslySkipPermissions": true
        }"#;
        let params: SpawnSessionParams = serde_json::from_str(json).unwrap();
        assert_eq!(params.repo_id, "r1");
        assert_eq!(params.branch, "main");
        assert_eq!(params.prompt, "fix bug");
        assert_eq!(params.name, Some("test session".to_string()));
        assert_eq!(params.issue_number, Some(42));
        assert_eq!(params.pr_number, Some(7));
        assert_eq!(params.force, Some(true));
        assert_eq!(params.dangerously_skip_permissions, Some(true));
    }

    #[test]
    fn spawn_session_params_minimal() {
        let json = r#"{"repoId": "r1", "branch": "main", "prompt": "hello"}"#;
        let params: SpawnSessionParams = serde_json::from_str(json).unwrap();
        assert_eq!(params.repo_id, "r1");
        assert!(params.name.is_none());
        assert!(params.issue_number.is_none());
        assert!(params.force.is_none());
        assert!(params.dangerously_skip_permissions.is_none());
    }

    // -- DB query helpers --

    fn setup_db() -> rusqlite::Connection {
        let conn = rusqlite::Connection::open_in_memory().expect("open in-memory db");
        conn.execute_batch("PRAGMA foreign_keys=ON;")
            .expect("enable FK");
        crate::db::create_schema(&conn).expect("create schema");
        conn
    }

    fn insert_test_repo(conn: &rusqlite::Connection) {
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
    }

    #[test]
    fn query_session_by_id_found() {
        let conn = setup_db();
        insert_test_repo(&conn);

        conn.execute(
            "INSERT INTO sessions (id, repo_id, name, branch, status, created_at, state_changed_at, dangerously_skip_permissions)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)",
            rusqlite::params!["s1", "r1", "Test", "main", "running", "2024-01-01", "2024-01-01", 0],
        )
        .expect("insert session");

        let session = query_session_by_id(&conn, "s1").unwrap();
        assert_eq!(session.id, "s1");
        assert_eq!(session.name, Some("Test".to_string()));
        assert_eq!(session.status, Some("running".to_string()));
        assert_eq!(session.dangerously_skip_permissions, Some(false));
    }

    #[test]
    fn query_session_by_id_not_found() {
        let conn = setup_db();
        let result = query_session_by_id(&conn, "nonexistent");
        assert!(result.is_err());
        assert!(result.unwrap_err().to_string().contains("not found"));
    }

    #[test]
    fn query_sessions_returns_multiple() {
        let conn = setup_db();
        insert_test_repo(&conn);

        for (sid, name) in &[("s1", "First"), ("s2", "Second"), ("s3", "Third")] {
            conn.execute(
                "INSERT INTO sessions (id, repo_id, name, status, created_at, state_changed_at, dangerously_skip_permissions)
                 VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)",
                rusqlite::params![sid, "r1", name, "idle", "2024-01-01", "2024-01-01", 0],
            )
            .expect("insert session");
        }

        let sessions = query_sessions(
            &conn,
            "SELECT id, repo_id, name, branch, status, block_type, worktree_path, log_path, \
             linked_issue_number, linked_pr_number, prompt, created_at, state_changed_at, \
             dangerously_skip_permissions, last_message \
             FROM sessions ORDER BY name",
            &[],
        )
        .unwrap();

        assert_eq!(sessions.len(), 3);
        assert_eq!(sessions[0].name, Some("First".to_string()));
        assert_eq!(sessions[1].name, Some("Second".to_string()));
        assert_eq!(sessions[2].name, Some("Third".to_string()));
    }

    #[test]
    fn query_sessions_empty_table() {
        let conn = setup_db();
        let sessions = query_sessions(
            &conn,
            "SELECT id, repo_id, name, branch, status, block_type, worktree_path, log_path, \
             linked_issue_number, linked_pr_number, prompt, created_at, state_changed_at, \
             dangerously_skip_permissions, last_message \
             FROM sessions",
            &[],
        )
        .unwrap();
        assert!(sessions.is_empty());
    }

    #[test]
    fn lookup_repo_local_path_found() {
        let conn = rusqlite::Connection::open_in_memory().expect("open");
        conn.execute_batch("PRAGMA foreign_keys=ON;").expect("fk");
        crate::db::create_schema(&conn).expect("schema");

        conn.execute(
            "INSERT INTO repos (id, github_url, local_path, default_branch, added_at)
             VALUES (?1, ?2, ?3, ?4, ?5)",
            rusqlite::params![
                "r1",
                "https://github.com/a/b",
                "/home/user/repo",
                "main",
                "2024-01-01"
            ],
        )
        .expect("insert");

        let state = crate::state::AppState::new(conn);
        let path = lookup_repo_local_path(&state, "r1").unwrap();
        assert_eq!(path, "/home/user/repo");
    }

    #[test]
    fn lookup_repo_local_path_not_found() {
        let conn = rusqlite::Connection::open_in_memory().expect("open");
        conn.execute_batch("PRAGMA foreign_keys=ON;").expect("fk");
        crate::db::create_schema(&conn).expect("schema");

        let state = crate::state::AppState::new(conn);
        let result = lookup_repo_local_path(&state, "nonexistent");
        assert!(result.is_err());
        assert!(result.unwrap_err().to_string().contains("repo not found"));
    }

    #[test]
    fn dangerously_skip_permissions_int_to_bool() {
        let conn = setup_db();
        insert_test_repo(&conn);

        // Insert with dsp = 1
        conn.execute(
            "INSERT INTO sessions (id, repo_id, name, status, created_at, state_changed_at, dangerously_skip_permissions)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)",
            rusqlite::params!["s1", "r1", "test", "idle", "2024-01-01", "2024-01-01", 1],
        )
        .expect("insert");

        let session = query_session_by_id(&conn, "s1").unwrap();
        assert_eq!(session.dangerously_skip_permissions, Some(true));
    }

    // -- ANSI escape stripping --

    #[test]
    fn strip_ansi_plain_text_unchanged() {
        assert_eq!(strip_ansi_escapes("hello world"), "hello world");
    }

    #[test]
    fn strip_ansi_csi_color_codes() {
        // \x1b[0m = reset, \x1b[31m = red
        assert_eq!(
            strip_ansi_escapes("\x1b[31mhello\x1b[0m"),
            "hello"
        );
    }

    #[test]
    fn strip_ansi_csi_cursor_movement() {
        // \x1b[2J = clear screen, \x1b[H = cursor home
        assert_eq!(
            strip_ansi_escapes("\x1b[2J\x1b[H{\"type\":\"system\"}"),
            "{\"type\":\"system\"}"
        );
    }

    #[test]
    fn strip_ansi_osc_title() {
        // \x1b]0;title\x07 = set terminal title
        assert_eq!(
            strip_ansi_escapes("\x1b]0;Claude\x07{\"type\":\"init\"}"),
            "{\"type\":\"init\"}"
        );
    }

    #[test]
    fn strip_ansi_osc_with_st_terminator() {
        // \x1b]0;title\x1b\\ = OSC with ST terminator
        assert_eq!(
            strip_ansi_escapes("\x1b]0;title\x1b\\data"),
            "data"
        );
    }

    #[test]
    fn strip_ansi_carriage_return() {
        assert_eq!(
            strip_ansi_escapes("hello\r\nworld"),
            "hello\nworld"
        );
    }

    #[test]
    fn strip_ansi_complex_mixed() {
        // Real-world PTY output: color codes around JSON
        let input = "\x1b[?25l\x1b[0m{\"type\":\"system\",\"subtype\":\"init\"}\x1b[?25h";
        assert_eq!(
            strip_ansi_escapes(input),
            "{\"type\":\"system\",\"subtype\":\"init\"}"
        );
    }

    #[test]
    fn strip_ansi_charset_designation() {
        // \x1b(B = US ASCII charset
        assert_eq!(strip_ansi_escapes("\x1b(Bhello"), "hello");
    }

    #[test]
    fn strip_ansi_preserves_valid_json() {
        let json = r#"{"type":"content_block_start","index":0,"content_block":{"type":"text","text":"Hello"}}"#;
        let with_escapes = format!("\x1b[0m{}\x1b[0m\r", json);
        let cleaned = strip_ansi_escapes(&with_escapes);
        assert_eq!(cleaned, json);
        // Verify it's still valid JSON
        let parsed: serde_json::Value = serde_json::from_str(&cleaned).unwrap();
        assert_eq!(parsed["type"], "content_block_start");
    }

    #[test]
    fn strip_ansi_empty_input() {
        assert_eq!(strip_ansi_escapes(""), "");
    }

    #[test]
    fn strip_ansi_only_escapes() {
        assert_eq!(strip_ansi_escapes("\x1b[31m\x1b[0m"), "");
    }

    #[test]
    fn strip_ansi_tilde_terminator() {
        // CSI sequence ending with ~ (e.g., \x1b[1~ = Home key)
        assert_eq!(strip_ansi_escapes("\x1b[1~text"), "text");
    }
}
