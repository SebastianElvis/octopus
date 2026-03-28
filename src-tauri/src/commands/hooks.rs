use std::collections::HashMap;
use std::path::PathBuf;
use std::sync::Arc;

use axum::extract::State as AxumState;
use axum::http::StatusCode;
use axum::response::IntoResponse;
use axum::routing::post;
use axum::Json;
use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Emitter, Manager, State};
use tokio::sync::oneshot;

use crate::error::{AppError, AppResult};
use crate::state::AppState;

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/// A hook event received from Claude Code via HTTP POST.
/// Claude Code sends snake_case field names in hook payloads.
#[derive(Debug, Clone, Deserialize, Serialize)]
pub struct HookEvent {
    /// The hook event name, e.g. "PreToolUse", "PostToolUse", "Stop"
    #[serde(default)]
    pub hook_event_name: String,
    #[serde(default)]
    pub session_id: String,
    #[serde(default)]
    pub cwd: String,
    #[serde(default)]
    pub tool_name: Option<String>,
    #[serde(default)]
    pub tool_input: Option<serde_json::Value>,
    #[serde(default)]
    pub tool_result: Option<serde_json::Value>,
    #[serde(default)]
    pub file_path: Option<String>,
    #[serde(default)]
    pub change_type: Option<String>,
    #[serde(default)]
    pub user_prompt: Option<String>,
    #[serde(default)]
    pub reason: Option<String>,
    #[serde(default)]
    pub permission_mode: Option<String>,
    #[serde(default)]
    pub transcript_path: Option<String>,
    /// Catch-all for any fields we don't explicitly model
    #[serde(flatten)]
    pub extra: HashMap<String, serde_json::Value>,
}

/// Hook-specific output for PreToolUse permission decisions.
/// See: https://code.claude.com/docs/en/hooks
#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct HookSpecificOutput {
    pub hook_event_name: String,
    pub permission_decision: String, // "allow", "deny", or "ask"
    #[serde(skip_serializing_if = "Option::is_none")]
    pub permission_decision_reason: Option<String>,
}

/// Response returned to Claude Code for a hook invocation.
/// For PreToolUse events, includes hookSpecificOutput with permissionDecision.
/// For other events, an empty JSON object `{}` is returned.
#[derive(Debug, Default, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct HookResponse {
    #[serde(skip_serializing_if = "Option::is_none")]
    pub hook_specific_output: Option<HookSpecificOutput>,
}

impl HookResponse {
    /// Create a PreToolUse response with the given permission decision.
    fn pre_tool_use(decision: &str, reason: Option<String>) -> Self {
        Self {
            hook_specific_output: Some(HookSpecificOutput {
                hook_event_name: "PreToolUse".to_string(),
                permission_decision: decision.to_string(),
                permission_decision_reason: reason,
            }),
        }
    }
}

/// Emitted to the frontend when any hook event is received.
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct HookEventPayload {
    pub request_id: String,
    pub event: HookEvent,
}

/// Analytics derived from hook events.
#[derive(Debug, Clone, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SessionAnalytics {
    pub tool_calls: Vec<ToolCallRecord>,
    pub total_cost_usd: f64,
    pub total_duration_ms: f64,
    pub input_tokens: u64,
    pub output_tokens: u64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ToolCallRecord {
    pub tool_name: String,
    pub timestamp: u64,
    pub success: bool,
}

// ---------------------------------------------------------------------------
// Shared state for the axum server
// ---------------------------------------------------------------------------

pub struct HookServerState {
    app: AppHandle,
}

// ---------------------------------------------------------------------------
// Axum handler
// ---------------------------------------------------------------------------

async fn hook_handler(
    AxumState(state): AxumState<Arc<HookServerState>>,
    Json(event): Json<HookEvent>,
) -> impl IntoResponse {
    let request_id = uuid::Uuid::new_v4().to_string();
    let event_name = event.hook_event_name.clone();

    log::info!(
        "Hook event received: {} (session={}, tool={:?})",
        event_name,
        event.session_id,
        event.tool_name
    );

    // Emit the event to the frontend for all event types
    let payload = HookEventPayload {
        request_id: request_id.clone(),
        event: event.clone(),
    };
    let _ = state.app.emit("hook-event", &payload);

    // Record analytics for PostToolUse and Stop events
    record_analytics(&state.app, &event);

    // For PreToolUse events, check if it's a permission-requiring tool
    // and hold the response open until the frontend decides
    if event_name == "PreToolUse" {
        // Auto-allow non-destructive tools immediately
        const DESTRUCTIVE_TOOLS: &[&str] = &["Write", "Edit", "NotebookEdit", "Bash", "BashExec"];
        let tool = event.tool_name.as_deref().unwrap_or("");
        if !DESTRUCTIVE_TOOLS.contains(&tool) {
            let response = HookResponse::pre_tool_use(
                "allow",
                Some(format!("Auto-allowed: {} is non-destructive", tool)),
            );
            return (StatusCode::OK, Json(response));
        }

        let app_state = state.app.state::<crate::state::AppState>();

        // Map Claude's cwd to our TooManyTabs session ID so the frontend
        // can match permission requests to the correct session.
        let tmt_session_id = find_session_by_cwd(&state.app, &event.cwd);
        let mapped_payload = if let Some(ref tmt_id) = tmt_session_id {
            let mut mapped_event = event.clone();
            mapped_event.session_id = tmt_id.clone();
            HookEventPayload {
                request_id: request_id.clone(),
                event: mapped_event,
            }
        } else {
            payload.clone()
        };

        // Emit a specific permission-request event (with mapped session ID)
        let _ = state.app.emit("hook-permission-request", &mapped_payload);

        // Update session status to "waiting" with block_type "permission"
        if let Some(ref tmt_id) = tmt_session_id {
            let tool_desc = event.tool_name.as_deref().unwrap_or("unknown tool");
            let _ = set_session_waiting_permission(&state.app, tmt_id, tool_desc);
        }

        // Create a oneshot channel and wait for the frontend's decision.
        // Store in AppState so respond_to_hook (Tauri command) can find it.
        let (tx, rx) = oneshot::channel::<HookResponse>();
        {
            let mut pending = app_state.pending_hook_responses.lock();
            pending.insert(request_id.clone(), tx);
        }

        // Store the TooManyTabs session ID so respond_to_hook can restore status
        if let Some(ref tmt_id) = tmt_session_id {
            let mut map = app_state.hook_request_sessions.lock();
            map.insert(request_id.clone(), tmt_id.clone());
        }

        // Wait up to 4 minutes (Claude CLI typically times out at 5 min)
        let result = match tokio::time::timeout(std::time::Duration::from_secs(240), rx).await {
            Ok(Ok(response)) => (StatusCode::OK, Json(response)),
            Ok(Err(_)) => {
                // Channel dropped — default to deny (safer than auto-allowing)
                (
                    StatusCode::OK,
                    Json(HookResponse::pre_tool_use(
                        "deny",
                        Some("Request cancelled".to_string()),
                    )),
                )
            }
            Err(_) => {
                // Timeout — clean up and deny (user didn't respond)
                let mut pending = app_state.pending_hook_responses.lock();
                pending.remove(&request_id);
                (
                    StatusCode::OK,
                    Json(HookResponse::pre_tool_use(
                        "deny",
                        Some("Permission request timed out".to_string()),
                    )),
                )
            }
        };

        // Restore session status to "running" after the permission is resolved
        if let Some(ref tmt_id) = tmt_session_id {
            let _ = restore_session_running(&state.app, tmt_id);
        }
        // Clean up the request→session mapping
        {
            let mut map = app_state.hook_request_sessions.lock();
            map.remove(&request_id);
        }

        result
    } else {
        // Non-blocking events: return immediately
        (StatusCode::OK, Json(HookResponse::default()))
    }
}

fn record_analytics(app: &AppHandle, event: &HookEvent) {
    let app_state = app.state::<AppState>();

    // Map Claude's session_id to our session by matching working directory
    // For now, use the cwd to find the session
    let session_id = find_session_by_cwd(app, &event.cwd);
    let session_id = match session_id {
        Some(id) => id,
        None => return,
    };

    let mut analytics_map = app_state.session_analytics.lock();
    let analytics = analytics_map
        .entry(session_id)
        .or_insert_with(SessionAnalytics::default);

    match event.hook_event_name.as_str() {
        "PostToolUse" => {
            if let Some(ref tool_name) = event.tool_name {
                analytics.tool_calls.push(ToolCallRecord {
                    tool_name: tool_name.clone(),
                    timestamp: std::time::SystemTime::now()
                        .duration_since(std::time::UNIX_EPOCH)
                        .unwrap_or_default()
                        .as_millis() as u64,
                    success: true,
                });
            }
        }
        "PostToolUseFailure" => {
            if let Some(ref tool_name) = event.tool_name {
                analytics.tool_calls.push(ToolCallRecord {
                    tool_name: tool_name.clone(),
                    timestamp: std::time::SystemTime::now()
                        .duration_since(std::time::UNIX_EPOCH)
                        .unwrap_or_default()
                        .as_millis() as u64,
                    success: false,
                });
            }
        }
        "Stop" => {
            // Try to extract cost/duration from the extra fields
            if let Some(cost) = event.extra.get("cost_usd").and_then(|v| v.as_f64()) {
                analytics.total_cost_usd += cost;
            }
            if let Some(dur) = event.extra.get("duration_ms").and_then(|v| v.as_f64()) {
                analytics.total_duration_ms += dur;
            }
            if let Some(inp) = event.extra.get("input_tokens").and_then(|v| v.as_u64()) {
                analytics.input_tokens += inp;
            }
            if let Some(out) = event.extra.get("output_tokens").and_then(|v| v.as_u64()) {
                analytics.output_tokens += out;
            }
        }
        _ => {}
    }
}

/// Try to find our session ID by matching the cwd to a session's worktree path.
fn find_session_by_cwd(app: &AppHandle, cwd: &str) -> Option<String> {
    if cwd.is_empty() {
        return None;
    }
    let app_state = app.state::<AppState>();
    let db = app_state.db.lock();
    let mut stmt = db
        .prepare(
            "SELECT id FROM sessions WHERE worktree_path = ?1 AND status IN ('running', 'waiting')",
        )
        .ok()?;
    stmt.query_row(rusqlite::params![cwd], |row| row.get::<_, String>(0))
        .ok()
}

/// Update session status to "waiting" with block_type "permission".
fn set_session_waiting_permission(
    app: &AppHandle,
    session_id: &str,
    tool_name: &str,
) -> AppResult<()> {
    let now = chrono::Utc::now().to_rfc3339();
    let message = format!("Waiting for permission to use {}", tool_name);
    let app_state = app.state::<AppState>();
    let db = app_state.db.lock();
    db.execute(
        "UPDATE sessions SET status = 'waiting', block_type = 'permission', last_message = ?1, state_changed_at = ?2 WHERE id = ?3",
        rusqlite::params![message, now, session_id],
    )?;
    drop(db);
    emit_session_changed_from_hooks(app, session_id);
    Ok(())
}

/// Restore session status to "running" after a permission decision.
fn restore_session_running(app: &AppHandle, session_id: &str) -> AppResult<()> {
    let now = chrono::Utc::now().to_rfc3339();
    let app_state = app.state::<AppState>();
    let db = app_state.db.lock();
    db.execute(
        "UPDATE sessions SET status = 'running', block_type = NULL, last_message = NULL, state_changed_at = ?1 WHERE id = ?2",
        rusqlite::params![now, session_id],
    )?;
    drop(db);
    emit_session_changed_from_hooks(app, session_id);
    Ok(())
}

/// Emit session-state-changed event (standalone version for hooks module).
fn emit_session_changed_from_hooks(app: &AppHandle, session_id: &str) {
    use crate::commands::sessions::{query_session_public, SessionStateChangedPayload};
    if let Ok(session) = query_session_public(app, session_id) {
        let _ = app.emit(
            "session-state-changed",
            SessionStateChangedPayload { session },
        );
    }
}

// ---------------------------------------------------------------------------
// Server lifecycle
// ---------------------------------------------------------------------------

/// Start the hook HTTP server on a random port. Returns the port number.
pub async fn start_hook_server(app: AppHandle) -> Result<u16, String> {
    let server_state = Arc::new(HookServerState { app: app.clone() });

    let router = axum::Router::new()
        .route("/hooks", post(hook_handler))
        .with_state(server_state);

    let listener = tokio::net::TcpListener::bind("127.0.0.1:0")
        .await
        .map_err(|e| format!("failed to bind hook server: {}", e))?;
    let port = listener
        .local_addr()
        .map_err(|e| format!("failed to get local addr: {}", e))?
        .port();

    log::info!("Hook server listening on 127.0.0.1:{}", port);

    // Store the port in AppState
    {
        let state = app.state::<AppState>();
        *state.hook_server_port.lock() = Some(port);
    }

    // Configure Claude's hooks to point to our server
    if let Err(e) = configure_claude_hooks(port) {
        log::error!("Failed to configure Claude hooks: {}", e);
    }

    // Spawn the server (runs until the app exits)
    tokio::spawn(async move {
        if let Err(e) = axum::serve(listener, router).await {
            log::error!("Hook server error: {}", e);
        }
    });

    Ok(port)
}

// ---------------------------------------------------------------------------
// Claude settings.json management
// ---------------------------------------------------------------------------

fn claude_settings_path() -> PathBuf {
    dirs::home_dir()
        .unwrap_or_else(|| PathBuf::from("."))
        .join(".claude")
        .join("settings.json")
}

/// Add TooManyTabs hook entries to ~/.claude/settings.json
fn configure_claude_hooks(port: u16) -> AppResult<()> {
    let path = claude_settings_path();
    std::fs::create_dir_all(path.parent().unwrap())?;

    let mut settings: serde_json::Value = if path.exists() {
        let content = std::fs::read_to_string(&path)?;
        serde_json::from_str(&content).unwrap_or_else(|_| serde_json::json!({}))
    } else {
        serde_json::json!({})
    };

    let url = format!("http://127.0.0.1:{}/hooks", port);

    // Build our hook entries
    let tmt_hooks = serde_json::json!({
        "PreToolUse": [{
            "matcher": "*",
            "hooks": [{
                "type": "http",
                "url": url,
                "timeout": 300
            }]
        }],
        "PostToolUse": [{
            "matcher": "*",
            "hooks": [{
                "type": "http",
                "url": url,
                "timeout": 10
            }]
        }],
        "PostToolUseFailure": [{
            "matcher": "*",
            "hooks": [{
                "type": "http",
                "url": url,
                "timeout": 10
            }]
        }],
        "Stop": [{
            "matcher": "*",
            "hooks": [{
                "type": "http",
                "url": url,
                "timeout": 10
            }]
        }],
        "SessionStart": [{
            "matcher": "*",
            "hooks": [{
                "type": "http",
                "url": url,
                "timeout": 10
            }]
        }],
        "SessionEnd": [{
            "matcher": "*",
            "hooks": [{
                "type": "http",
                "url": url,
                "timeout": 10
            }]
        }],
        "FileChanged": [{
            "matcher": "*",
            "hooks": [{
                "type": "http",
                "url": url,
                "timeout": 10
            }]
        }]
    });

    // Merge into settings under the "hooks" key (Claude Code v2.x format)
    let obj = settings
        .as_object_mut()
        .ok_or_else(|| AppError::Custom("settings.json is not a JSON object".to_string()))?;

    let events = [
        "PreToolUse",
        "PostToolUse",
        "PostToolUseFailure",
        "Stop",
        "SessionStart",
        "SessionEnd",
        "FileChanged",
    ];

    // Clean up any stale top-level hook entries from older TooManyTabs versions
    for event_name in &events {
        if let Some(existing) = obj.get_mut(*event_name) {
            if let Some(arr) = existing.as_array_mut() {
                arr.retain(|entry| !entry_contains_tmt_url(entry));
            }
        }
    }
    // Remove empty top-level arrays left after cleanup
    for event_name in &events {
        if obj
            .get(*event_name)
            .and_then(|v| v.as_array())
            .is_some_and(|a| a.is_empty())
        {
            obj.remove(*event_name);
        }
    }

    // Ensure the "hooks" object exists
    if !obj.contains_key("hooks") {
        obj.insert("hooks".to_string(), serde_json::json!({}));
    }
    let hooks_obj = obj
        .get_mut("hooks")
        .unwrap()
        .as_object_mut()
        .ok_or_else(|| {
            AppError::Custom("settings.json 'hooks' is not a JSON object".to_string())
        })?;

    // Merge our entries with any existing user hooks
    for event_name in events {
        let our_entry = &tmt_hooks[event_name];
        if let Some(existing) = hooks_obj.get_mut(event_name) {
            if let Some(arr) = existing.as_array_mut() {
                // Remove any previous TooManyTabs hook entries (identified by URL pattern)
                arr.retain(|entry| !entry_contains_tmt_url(entry));
                // Add our new entry
                if let Some(our_arr) = our_entry.as_array() {
                    arr.extend(our_arr.iter().cloned());
                }
            }
        } else {
            hooks_obj.insert(event_name.to_string(), our_entry.clone());
        }
    }

    // Write back atomically
    let tmp_path = path.with_extension("json.tmp");
    std::fs::write(&tmp_path, serde_json::to_string_pretty(&settings)?)?;
    std::fs::rename(&tmp_path, &path)?;

    log::info!("Configured Claude hooks in {:?} (port {})", path, port);
    Ok(())
}

/// Remove TooManyTabs hooks from ~/.claude/settings.json
pub fn remove_claude_hooks() -> AppResult<()> {
    let path = claude_settings_path();
    if !path.exists() {
        return Ok(());
    }

    let content = std::fs::read_to_string(&path)?;
    let mut settings: serde_json::Value =
        serde_json::from_str(&content).unwrap_or_else(|_| serde_json::json!({}));

    let events = [
        "PreToolUse",
        "PostToolUse",
        "PostToolUseFailure",
        "Stop",
        "SessionStart",
        "SessionEnd",
        "FileChanged",
    ];

    if let Some(obj) = settings.as_object_mut() {
        // Clean up any stale top-level entries from older versions
        for event_name in &events {
            if let Some(existing) = obj.get_mut(*event_name) {
                if let Some(arr) = existing.as_array_mut() {
                    arr.retain(|entry| !entry_contains_tmt_url(entry));
                }
            }
        }
        // Remove empty top-level arrays
        for event_name in &events {
            if obj
                .get(*event_name)
                .and_then(|v| v.as_array())
                .is_some_and(|a| a.is_empty())
            {
                obj.remove(*event_name);
            }
        }

        // Remove from the "hooks" object (current format)
        if let Some(hooks_val) = obj.get_mut("hooks") {
            if let Some(hooks_obj) = hooks_val.as_object_mut() {
                for event_name in events {
                    if let Some(existing) = hooks_obj.get_mut(event_name) {
                        if let Some(arr) = existing.as_array_mut() {
                            arr.retain(|entry| !entry_contains_tmt_url(entry));
                            if arr.is_empty() {
                                hooks_obj.remove(event_name);
                            }
                        }
                    }
                }
            }
        }
        // Remove the "hooks" key if it's now empty
        if obj
            .get("hooks")
            .and_then(|v| v.as_object())
            .is_some_and(|o| o.is_empty())
        {
            obj.remove("hooks");
        }
    }

    let tmp_path = path.with_extension("json.tmp");
    std::fs::write(&tmp_path, serde_json::to_string_pretty(&settings)?)?;
    std::fs::rename(&tmp_path, &path)?;

    log::info!("Removed TooManyTabs hooks from {:?}", path);
    Ok(())
}

/// Check if a hook entry array item contains a TooManyTabs URL.
fn entry_contains_tmt_url(entry: &serde_json::Value) -> bool {
    if let Some(hooks) = entry.get("hooks").and_then(|h| h.as_array()) {
        for hook in hooks {
            if let Some(url) = hook.get("url").and_then(|u| u.as_str()) {
                if url.contains("/hooks") && url.contains("127.0.0.1") {
                    return true;
                }
            }
        }
    }
    false
}

// ---------------------------------------------------------------------------
// Tauri commands
// ---------------------------------------------------------------------------

/// Respond to a pending hook permission request from the frontend.
#[tauri::command]
pub async fn respond_to_hook(
    app: AppHandle,
    state: State<'_, AppState>,
    request_id: String,
    decision: String,
    reason: Option<String>,
) -> AppResult<()> {
    let sender = {
        let mut pending = state.pending_hook_responses.lock();
        pending.remove(&request_id)
    };

    if let Some(sender) = sender {
        let permission_decision = if decision == "deny" { "deny" } else { "allow" };
        let response = HookResponse::pre_tool_use(permission_decision, reason);
        let _ = sender.send(response);

        // Restore session status to "running" now that the user has decided.
        // (The hook_handler also does this after the response is sent, but doing
        // it here gives faster UI feedback.)
        let tmt_session_id = {
            let map = state.hook_request_sessions.lock();
            map.get(&request_id).cloned()
        };
        if let Some(ref tmt_id) = tmt_session_id {
            let _ = restore_session_running(&app, tmt_id);
        }

        Ok(())
    } else {
        Err(AppError::Custom(format!(
            "No pending hook request with id {}",
            request_id
        )))
    }
}

/// Get the hook server port (for debugging / UI display).
#[tauri::command]
pub async fn get_hook_server_port(state: State<'_, AppState>) -> AppResult<Option<u16>> {
    Ok(*state.hook_server_port.lock())
}

/// Get analytics for a session.
#[tauri::command]
pub async fn get_session_analytics(
    state: State<'_, AppState>,
    session_id: String,
) -> AppResult<Option<SessionAnalytics>> {
    let analytics = state.session_analytics.lock();
    Ok(analytics.get(&session_id).cloned())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn hook_response_default_is_empty() {
        let r = HookResponse::default();
        assert!(r.hook_specific_output.is_none());
    }

    #[test]
    fn hook_response_pre_tool_use_allow() {
        let r = HookResponse::pre_tool_use("allow", Some("test".to_string()));
        let output = r.hook_specific_output.unwrap();
        assert_eq!(output.hook_event_name, "PreToolUse");
        assert_eq!(output.permission_decision, "allow");
        assert_eq!(output.permission_decision_reason.unwrap(), "test");
    }

    #[test]
    fn hook_response_pre_tool_use_deny() {
        let r = HookResponse::pre_tool_use("deny", None);
        let output = r.hook_specific_output.unwrap();
        assert_eq!(output.permission_decision, "deny");
        assert!(output.permission_decision_reason.is_none());
    }

    #[test]
    fn entry_contains_tmt_url_matches() {
        let entry = serde_json::json!({
            "matcher": "*",
            "hooks": [{"type": "http", "url": "http://127.0.0.1:12345/hooks"}]
        });
        assert!(entry_contains_tmt_url(&entry));
    }

    #[test]
    fn entry_contains_tmt_url_no_match() {
        let entry = serde_json::json!({
            "matcher": "*",
            "hooks": [{"type": "command", "command": "echo hello"}]
        });
        assert!(!entry_contains_tmt_url(&entry));
    }

    #[test]
    fn hook_event_deserializes_minimal() {
        let json = r#"{"hook_event_name":"Stop","session_id":"abc","cwd":"/tmp"}"#;
        let event: HookEvent = serde_json::from_str(json).unwrap();
        assert_eq!(event.hook_event_name, "Stop");
        assert_eq!(event.session_id, "abc");
    }

    #[test]
    fn hook_event_deserializes_with_extras() {
        let json = r#"{"hook_event_name":"Stop","session_id":"abc","cwd":"/tmp","cost_usd":0.05,"unknown_field":"foo"}"#;
        let event: HookEvent = serde_json::from_str(json).unwrap();
        assert_eq!(event.extra.get("cost_usd").unwrap().as_f64().unwrap(), 0.05);
    }
}
