mod commands;
mod db;
mod error;
mod state;

use commands::github::{create_pr, fetch_issues, fetch_prs, get_github_token, git_commit_and_push};
use commands::repos::{add_repo, list_repos};
use commands::sessions::{
    get_session, interrupt_session, kill_session, list_sessions, reply_to_session, spawn_session,
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
            interrupt_session,
            kill_session,
            list_sessions,
            get_session,
            // repos
            add_repo,
            list_repos,
            // github
            get_github_token,
            fetch_issues,
            fetch_prs,
            git_commit_and_push,
            create_pr,
            // worktree
            create_worktree,
            remove_worktree,
            get_diff,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
