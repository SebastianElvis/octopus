use std::io::{Read as IoRead, Write as IoWrite};

use portable_pty::{native_pty_system, CommandBuilder, PtySize};
use serde::Serialize;
use tauri::{AppHandle, Emitter, Manager, State};

use crate::error::{AppError, AppResult};
use crate::state::{AppState, PtySession, SendableMaster};

#[derive(Debug, Serialize, Clone)]
#[serde(rename_all = "camelCase")]
struct ShellOutputPayload {
    shell_id: String,
    data: String,
}

/// Spawn a plain shell PTY in the given directory.
/// Returns a unique shell_id used for write/resize/kill.
#[tauri::command]
pub async fn spawn_shell(
    app: AppHandle,
    state: State<'_, AppState>,
    cwd: String,
) -> AppResult<String> {
    let shell_id = uuid::Uuid::new_v4().to_string();

    let pty_system = native_pty_system();
    let pty_pair = pty_system
        .openpty(PtySize {
            rows: 24,
            cols: 80,
            pixel_width: 0,
            pixel_height: 0,
        })
        .map_err(|e| AppError::Custom(format!("failed to create shell PTY: {}", e)))?;

    let reader = pty_pair
        .master
        .try_clone_reader()
        .map_err(|e| AppError::Custom(format!("failed to clone shell PTY reader: {}", e)))?;
    let writer = pty_pair
        .master
        .take_writer()
        .map_err(|e| AppError::Custom(format!("failed to take shell PTY writer: {}", e)))?;

    // Detect user's default shell, fallback to /bin/zsh then /bin/bash
    let shell_path = std::env::var("SHELL").unwrap_or_else(|_| {
        if std::path::Path::new("/bin/zsh").exists() {
            "/bin/zsh".to_string()
        } else {
            "/bin/bash".to_string()
        }
    });

    let mut cmd = CommandBuilder::new(&shell_path);
    cmd.arg("--login");
    if std::path::Path::new(&cwd).exists() {
        cmd.cwd(&cwd);
    }
    cmd.env("TERM", "xterm-256color");

    let child = pty_pair
        .slave
        .spawn_command(cmd)
        .map_err(|e| AppError::Custom(format!("failed to spawn shell: {}", e)))?;

    let pid = child.process_id().unwrap_or(0);
    log::info!("Spawned shell {} (pid {}) in {}", shell_id, pid, cwd);

    drop(pty_pair.slave);

    {
        let mut map = state
            .shell_processes
            .lock()
            .map_err(|e| AppError::Custom(format!("shell map lock poisoned: {}", e)))?;
        map.insert(
            shell_id.clone(),
            PtySession {
                writer,
                pid,
                master: SendableMaster(pty_pair.master),
            },
        );
    }

    // Background reader thread
    let sid = shell_id.clone();
    std::thread::spawn(move || {
        let mut reader = reader;
        let mut _child = child;
        let mut buf = [0u8; 4096];

        loop {
            match reader.read(&mut buf) {
                Ok(0) => break,
                Ok(n) => {
                    let data = String::from_utf8_lossy(&buf[..n]).to_string();
                    let _ = app.emit(
                        "shell-output",
                        ShellOutputPayload {
                            shell_id: sid.clone(),
                            data,
                        },
                    );
                }
                Err(e) => {
                    log::error!("Shell PTY read error for {}: {}", sid, e);
                    break;
                }
            }
        }

        log::info!("Shell {} exited", sid);

        // Clean up — use a block to ensure State borrow is dropped before thread exit
        let state_ref: tauri::State<'_, AppState> = app.state();
        if let Ok(mut map) = state_ref.shell_processes.lock() {
            drop(map.remove(&sid));
        }
        drop(state_ref);
    });

    Ok(shell_id)
}

/// Write input to a shell PTY.
#[tauri::command]
pub async fn write_to_shell(
    state: State<'_, AppState>,
    shell_id: String,
    data: String,
) -> AppResult<()> {
    let mut map = state
        .shell_processes
        .lock()
        .map_err(|e| AppError::Custom(format!("shell map lock poisoned: {}", e)))?;
    let pty_session = map.get_mut(&shell_id).ok_or_else(|| {
        AppError::Custom(format!("no running shell {}", shell_id))
    })?;
    pty_session.writer.write_all(data.as_bytes())?;
    pty_session.writer.flush()?;
    Ok(())
}

/// Resize a shell PTY.
#[tauri::command]
pub async fn resize_shell(
    state: State<'_, AppState>,
    shell_id: String,
    rows: u16,
    cols: u16,
) -> AppResult<()> {
    let map = state
        .shell_processes
        .lock()
        .map_err(|e| AppError::Custom(format!("shell map lock poisoned: {}", e)))?;
    let pty_session = map.get(&shell_id).ok_or_else(|| {
        AppError::Custom(format!("no running shell {}", shell_id))
    })?;
    pty_session
        .master
        .0
        .resize(PtySize {
            rows,
            cols,
            pixel_width: 0,
            pixel_height: 0,
        })
        .map_err(|e| AppError::Custom(format!("failed to resize shell PTY: {}", e)))?;
    Ok(())
}

/// Kill a shell PTY.
#[tauri::command]
pub async fn kill_shell(
    state: State<'_, AppState>,
    shell_id: String,
) -> AppResult<()> {
    let mut map = state
        .shell_processes
        .lock()
        .map_err(|e| AppError::Custom(format!("shell map lock poisoned: {}", e)))?;
    if let Some(_session) = map.remove(&shell_id) {
        // Dropping the PtySession closes the master, which sends EOF to the child
        log::info!("Killed shell {}", shell_id);
    }
    Ok(())
}
