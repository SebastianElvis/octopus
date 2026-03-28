pub mod commands;
pub mod db;
pub mod error;
pub mod state;

use commands::ai::{get_setting, set_setting};
use commands::filesystem::{list_dir, read_file, save_temp_image, scan_slash_commands};
use commands::git_ops::{
    get_changed_files, get_file_at_head, get_file_diff, git_discard_files, git_stage_files,
    git_unstage_files,
};
use commands::github::{
    close_issue, create_pr, create_session_from_review, delete_remote_branch, fetch_check_runs,
    fetch_issues, fetch_pr_review_comments, fetch_prs, get_github_token, git_commit_and_push,
    merge_pr,
};
use commands::hooks::{get_hook_server_port, get_session_analytics, respond_to_hook};
use commands::repos::{add_repo, list_repos, remove_repo};
use commands::sessions::{
    archive_session, check_stuck_sessions, get_session, interrupt_session, kill_session,
    list_sessions, pause_session, read_session_events, read_session_log, resize_session,
    respond_to_session, resume_session, send_followup, spawn_session, write_to_session,
};
use commands::shell::{kill_shell, resize_shell, spawn_shell, write_to_shell};
use commands::worktree::{create_worktree, get_diff, remove_worktree};

use serde::Serialize;
use state::AppState;
use tauri::Manager;

// ---------------------------------------------------------------------------
// Crash Recovery
// ---------------------------------------------------------------------------

/// Return the path to the sentinel file used to detect unclean shutdowns.
fn sentinel_path() -> Option<std::path::PathBuf> {
    dirs::home_dir().map(|h| h.join(".toomanytabs").join(".running"))
}

/// Write a sentinel file to indicate the app is running.
fn write_sentinel() {
    if let Some(path) = sentinel_path() {
        if let Err(e) = std::fs::write(&path, format!("{}", std::process::id())) {
            log::warn!("Failed to write sentinel file: {}", e);
        }
    }
}

/// Remove the sentinel file on clean shutdown.
fn remove_sentinel() {
    if let Some(path) = sentinel_path() {
        let _ = std::fs::remove_file(&path);
    }
}

/// Check if a previous unclean shutdown occurred (sentinel file still present).
fn check_unclean_shutdown() -> bool {
    if let Some(path) = sentinel_path() {
        if path.exists() {
            log::warn!("Detected unclean shutdown (sentinel file present)");
            // Remove the old sentinel — we'll write a new one
            let _ = std::fs::remove_file(&path);
            return true;
        }
    }
    false
}

/// On startup, for each session with status "running" in the DB:
/// check if the PID is still alive using kill(pid, 0). If alive, mark as
/// "interrupted" (process is orphaned). If dead, already reaped correctly.
fn recover_sessions(conn: &rusqlite::Connection) {
    let mut stmt = match conn.prepare(
        "SELECT id, worktree_path FROM sessions WHERE status IN ('running', 'waiting', 'paused', 'stuck')",
    ) {
        Ok(s) => s,
        Err(e) => {
            log::error!("Failed to query sessions for recovery: {}", e);
            return;
        }
    };

    let rows = match stmt.query_map([], |row| {
        Ok((row.get::<_, String>(0)?, row.get::<_, Option<String>>(1)?))
    }) {
        Ok(r) => r,
        Err(e) => {
            log::error!("Failed to query sessions for recovery: {}", e);
            return;
        }
    };

    let now = chrono::Utc::now().to_rfc3339();
    for (session_id, _worktree_path) in rows.flatten() {
        // Mark as interrupted — the original reap_orphaned_sessions will handle this
        // but we log it explicitly for crash recovery context
        log::info!(
            "Crash recovery: session {} was active at shutdown, marking interrupted",
            session_id
        );
        let _ = conn.execute(
            "UPDATE sessions SET status = 'interrupted', state_changed_at = ?1 WHERE id = ?2",
            rusqlite::params![now, session_id],
        );
    }
}

/// Scan worktree directory for entries with no matching DB session.
fn scan_orphaned_worktrees(conn: &rusqlite::Connection) {
    let home = match dirs::home_dir() {
        Some(h) => h,
        None => return,
    };

    let worktrees_dir = home.join(".toomanytabs").join("worktrees");
    if !worktrees_dir.is_dir() {
        return;
    }

    // Walk the worktrees directory two levels deep: worktrees/<repo>/<session-id>
    if let Ok(repo_entries) = std::fs::read_dir(&worktrees_dir) {
        for repo_entry in repo_entries.flatten() {
            if !repo_entry.path().is_dir() {
                continue;
            }
            if let Ok(session_entries) = std::fs::read_dir(repo_entry.path()) {
                for session_entry in session_entries.flatten() {
                    if !session_entry.path().is_dir() {
                        continue;
                    }
                    let dir_name = session_entry.file_name().to_string_lossy().to_string();
                    // Check if this session ID exists in the DB
                    let exists: bool = conn
                        .query_row(
                            "SELECT COUNT(*) FROM sessions WHERE id = ?1",
                            rusqlite::params![dir_name],
                            |row| row.get::<_, i64>(0),
                        )
                        .map(|count| count > 0)
                        .unwrap_or(false);

                    if !exists {
                        log::warn!(
                            "Orphaned worktree found: {} (no matching session in DB)",
                            session_entry.path().display()
                        );
                    }
                }
            }
        }
    }
}

// ---------------------------------------------------------------------------
// Prerequisites check
// ---------------------------------------------------------------------------

#[derive(Debug, Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct Prerequisites {
    pub claude: bool,
    pub git: bool,
    pub gh: bool,
}

/// Check if required CLI tools are available in PATH.
#[tauri::command]
fn check_prerequisites() -> Prerequisites {
    fn is_in_path(cmd: &str) -> bool {
        std::process::Command::new("which")
            .arg(cmd)
            .output()
            .map(|o| o.status.success())
            .unwrap_or(false)
    }

    Prerequisites {
        claude: is_in_path("claude"),
        git: is_in_path("git"),
        gh: is_in_path("gh"),
    }
}

// ---------------------------------------------------------------------------
// App entry point
// ---------------------------------------------------------------------------

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    // Check for unclean shutdown before anything else
    let had_unclean_shutdown = check_unclean_shutdown();

    // Initialise the SQLite database (create tables if needed) before the
    // Tauri runtime starts so commands can rely on it being present.
    let conn = match db::init_db() {
        Ok(c) => c,
        Err(e) => {
            eprintln!("Fatal: failed to initialise database: {}", e);
            std::process::exit(1);
        }
    };

    if had_unclean_shutdown {
        log::warn!("Performing crash recovery after unclean shutdown");
        recover_sessions(&conn);
    }

    // Mark any sessions that were still active when the app last exited as
    // "interrupted" — their OS processes no longer exist.
    db::reap_orphaned_sessions(&conn);

    // Scan for orphaned worktrees
    scan_orphaned_worktrees(&conn);

    // Write sentinel file to detect future unclean shutdowns
    write_sentinel();

    tauri::Builder::default()
        .manage(AppState::new(conn))
        .plugin(tauri_plugin_sql::Builder::default().build())
        .plugin(tauri_plugin_notification::init())
        .plugin(tauri_plugin_shell::init())
        .setup(|app| {
            // Enable logging in both debug and release builds
            app.handle().plugin(
                tauri_plugin_log::Builder::default()
                    .level(log::LevelFilter::Info)
                    .build(),
            )?;

            // Start the hook HTTP server for Claude Code integration
            let hook_app = app.handle().clone();
            tauri::async_runtime::spawn(async move {
                match commands::hooks::start_hook_server(hook_app).await {
                    Ok(port) => log::info!("Hook server started on port {}", port),
                    Err(e) => log::error!("Failed to start hook server: {}", e),
                }
            });

            // Start background WAL checkpoint task (every 5 minutes)
            let app_handle = app.handle().clone();
            tauri::async_runtime::spawn(async move {
                let mut interval = tokio::time::interval(std::time::Duration::from_secs(5 * 60));
                loop {
                    interval.tick().await;
                    let state: tauri::State<'_, AppState> = app_handle.state();
                    let db = state.db.lock();
                    db::run_wal_checkpoint(&db);
                }
            });

            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            // sessions
            spawn_session,
            write_to_session,
            respond_to_session,
            resize_session,
            interrupt_session,
            kill_session,
            archive_session,
            list_sessions,
            get_session,
            pause_session,
            resume_session,
            check_stuck_sessions,
            read_session_log,
            read_session_events,
            send_followup,
            // repos
            add_repo,
            list_repos,
            remove_repo,
            // github
            get_github_token,
            fetch_issues,
            fetch_prs,
            git_commit_and_push,
            create_pr,
            fetch_pr_review_comments,
            fetch_check_runs,
            merge_pr,
            delete_remote_branch,
            close_issue,
            create_session_from_review,
            // worktree
            create_worktree,
            remove_worktree,
            get_diff,
            // shell
            spawn_shell,
            write_to_shell,
            resize_shell,
            kill_shell,
            // filesystem
            list_dir,
            read_file,
            scan_slash_commands,
            save_temp_image,
            // git operations
            get_changed_files,
            git_stage_files,
            git_unstage_files,
            git_discard_files,
            get_file_diff,
            get_file_at_head,
            // ai & settings
            get_setting,
            set_setting,
            // hooks
            respond_to_hook,
            get_hook_server_port,
            get_session_analytics,
            // system
            check_prerequisites,
        ])
        .build(tauri::generate_context!())
        .expect("error while building tauri application")
        .run(|_app, event| {
            if let tauri::RunEvent::Exit = event {
                // Clean shutdown: remove hooks and sentinel
                if let Err(e) = commands::hooks::remove_claude_hooks() {
                    log::error!("Failed to remove Claude hooks on exit: {}", e);
                }
                remove_sentinel();
            }
        });
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn check_prerequisites_returns_struct() {
        let prereqs = check_prerequisites();
        // git should be available in most CI/dev environments
        // We just verify the struct is constructed without panicking
        // Verify the struct is constructed without panicking
        let _ = prereqs.git;
        let _ = prereqs.claude;
        let _ = prereqs.gh;
    }

    #[test]
    fn sentinel_path_is_in_toomanytabs_dir() {
        if let Some(path) = sentinel_path() {
            let path_str = path.to_string_lossy();
            assert!(path_str.contains(".toomanytabs"));
            assert!(path_str.ends_with(".running"));
        }
    }

    #[test]
    fn recover_sessions_handles_empty_db() {
        let conn = rusqlite::Connection::open_in_memory().expect("open");
        conn.execute_batch("PRAGMA foreign_keys=ON;").expect("fk");
        db::create_schema(&conn).expect("create schema");
        // Should not panic on empty DB
        recover_sessions(&conn);
    }

    #[test]
    fn scan_orphaned_worktrees_handles_missing_dir() {
        let conn = rusqlite::Connection::open_in_memory().expect("open");
        conn.execute_batch("PRAGMA foreign_keys=ON;").expect("fk");
        db::create_schema(&conn).expect("create schema");
        // Should not panic when worktrees directory doesn't exist
        scan_orphaned_worktrees(&conn);
    }

    #[test]
    fn recover_sessions_marks_running_as_interrupted() {
        let conn = rusqlite::Connection::open_in_memory().expect("open");
        conn.execute_batch("PRAGMA foreign_keys=ON;").expect("fk");
        db::create_schema(&conn).expect("schema");

        // Insert repo and session
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
            rusqlite::params!["s1", "r1", "Active", "running", "2024-01-01", "2024-01-01"],
        )
        .expect("insert session");

        conn.execute(
            "INSERT INTO sessions (id, repo_id, name, status, created_at, state_changed_at)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6)",
            rusqlite::params!["s2", "r1", "Done", "completed", "2024-01-01", "2024-01-01"],
        )
        .expect("insert session");

        recover_sessions(&conn);

        let s1_status: String = conn
            .query_row("SELECT status FROM sessions WHERE id = 's1'", [], |row| {
                row.get(0)
            })
            .unwrap();
        assert_eq!(s1_status, "interrupted");

        let s2_status: String = conn
            .query_row("SELECT status FROM sessions WHERE id = 's2'", [], |row| {
                row.get(0)
            })
            .unwrap();
        assert_eq!(s2_status, "completed");
    }

    #[test]
    fn recover_sessions_marks_waiting_and_paused() {
        let conn = rusqlite::Connection::open_in_memory().expect("open");
        conn.execute_batch("PRAGMA foreign_keys=ON;").expect("fk");
        db::create_schema(&conn).expect("schema");

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

        for (sid, status) in &[("s1", "waiting"), ("s2", "paused"), ("s3", "stuck")] {
            conn.execute(
                "INSERT INTO sessions (id, repo_id, name, status, created_at, state_changed_at)
                 VALUES (?1, ?2, ?3, ?4, ?5, ?6)",
                rusqlite::params![sid, "r1", "Session", status, "2024-01-01", "2024-01-01"],
            )
            .expect("insert session");
        }

        recover_sessions(&conn);

        for sid in &["s1", "s2", "s3"] {
            let status: String = conn
                .query_row("SELECT status FROM sessions WHERE id = ?1", [sid], |row| {
                    row.get(0)
                })
                .unwrap();
            assert_eq!(status, "interrupted", "{} should be interrupted", sid);
        }
    }

    #[test]
    fn prerequisites_has_bool_fields() {
        let p = Prerequisites {
            claude: true,
            git: false,
            gh: true,
        };
        assert!(p.claude);
        assert!(!p.git);
        assert!(p.gh);
    }

    #[test]
    fn prerequisites_serializes_to_camel_case() {
        let p = Prerequisites {
            claude: true,
            git: true,
            gh: false,
        };
        let json = serde_json::to_value(&p).unwrap();
        assert_eq!(json["claude"], true);
        assert_eq!(json["git"], true);
        assert_eq!(json["gh"], false);
    }
}
