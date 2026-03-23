mod commands;
mod db;
mod error;
mod state;

use commands::filesystem::{list_dir, read_file};
use commands::git_ops::{
    get_changed_files, get_file_at_head, get_file_diff, git_discard_files, git_stage_files,
    git_unstage_files,
};
use commands::github::{
    create_pr, create_session_from_review, fetch_issues, fetch_pr_review_comments, fetch_prs,
    get_github_token, git_commit_and_push,
};
use commands::repos::{add_repo, list_repos, remove_repo};
use commands::sessions::{
    check_stuck_sessions, get_session, interrupt_session, kill_session, list_sessions,
    pause_session, read_session_log, reply_to_session, resize_session, resume_session,
    spawn_session, write_to_session,
};
use commands::worktree::{create_worktree, get_diff, remove_worktree};
use state::AppState;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    // Initialise the SQLite database (create tables if needed) before the
    // Tauri runtime starts so commands can rely on it being present.
    let conn = match db::init_db() {
        Ok(c) => c,
        Err(e) => {
            eprintln!("Fatal: failed to initialise database: {}", e);
            std::process::exit(1);
        }
    };

    // Mark any sessions that were still active when the app last exited as
    // "interrupted" — their OS processes no longer exist.
    db::reap_orphaned_sessions(&conn);

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
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            // sessions
            spawn_session,
            reply_to_session,
            write_to_session,
            resize_session,
            interrupt_session,
            kill_session,
            list_sessions,
            get_session,
            pause_session,
            resume_session,
            check_stuck_sessions,
            read_session_log,
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
            create_session_from_review,
            // worktree
            create_worktree,
            remove_worktree,
            get_diff,
            // filesystem
            list_dir,
            read_file,
            // git operations
            get_changed_files,
            git_stage_files,
            git_unstage_files,
            git_discard_files,
            get_file_diff,
            get_file_at_head,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
