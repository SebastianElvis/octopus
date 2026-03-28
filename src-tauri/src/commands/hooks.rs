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

/// Response returned to Claude Code for a hook invocation.
#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct HookResponse {
    #[serde(rename = "continue")]
    pub should_continue: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub suppress_output: Option<bool>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub decision: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub reason: Option<String>,
}

impl Default for HookResponse {
    fn default() -> Self {
        Self {
            should_continue: true,
            suppress_output: None,
            decision: None,
            reason: None,
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
        // Emit a specific permission-request event
        let _ = state.app.emit("hook-permission-request", &payload);

        // Create a oneshot channel and wait for the frontend's decision.
        // Store in AppState so respond_to_hook (Tauri command) can find it.
        let app_state = state.app.state::<crate::state::AppState>();
        let (tx, rx) = oneshot::channel::<HookResponse>();
        {
            let mut pending = app_state.pending_hook_responses.lock();
            pending.insert(request_id.clone(), tx);
        }

        // Wait up to 4 minutes (Claude CLI typically times out at 5 min)
        match tokio::time::timeout(std::time::Duration::from_secs(240), rx).await {
            Ok(Ok(response)) => (StatusCode::OK, Json(response)),
            Ok(Err(_)) => {
                // Channel dropped — default to continue
                (StatusCode::OK, Json(HookResponse::default()))
            }
            Err(_) => {
                // Timeout — clean up and allow
                let mut pending = app_state.pending_hook_responses.lock();
                pending.remove(&request_id);
                (StatusCode::OK, Json(HookResponse::default()))
            }
        }
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
        .prepare("SELECT id FROM sessions WHERE worktree_path = ?1 AND status = 'running'")
        .ok()?;
    stmt.query_row(rusqlite::params![cwd], |row| row.get::<_, String>(0))
        .ok()
}

// ---------------------------------------------------------------------------
// Server lifecycle
// ---------------------------------------------------------------------------

/// Start the hook HTTP server on a random port. Returns the port number.
pub async fn start_hook_server(app: AppHandle) -> Result<u16, String> {
    let server_state = Arc::new(HookServerState {
        app: app.clone(),
    });

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

    // Merge into settings: replace any existing TooManyTabs hooks
    // We store our hooks under a recognizable key so we can find and update them
    let obj = settings.as_object_mut().ok_or_else(|| {
        AppError::Custom("settings.json is not a JSON object".to_string())
    })?;

    // Claude Code hooks are top-level keys matching event names
    // We need to merge our entries with any existing user hooks
    let events = [
        "PreToolUse",
        "PostToolUse",
        "PostToolUseFailure",
        "Stop",
        "SessionStart",
        "SessionEnd",
        "FileChanged",
    ];

    for event_name in events {
        let our_entry = &tmt_hooks[event_name];
        if let Some(existing) = obj.get_mut(event_name) {
            if let Some(arr) = existing.as_array_mut() {
                // Remove any previous TooManyTabs hook entries (identified by URL pattern)
                arr.retain(|entry| {
                    !entry_contains_tmt_url(entry)
                });
                // Add our new entry
                if let Some(our_arr) = our_entry.as_array() {
                    arr.extend(our_arr.iter().cloned());
                }
            }
        } else {
            obj.insert(event_name.to_string(), our_entry.clone());
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
        for event_name in events {
            if let Some(existing) = obj.get_mut(event_name) {
                if let Some(arr) = existing.as_array_mut() {
                    arr.retain(|entry| !entry_contains_tmt_url(entry));
                    if arr.is_empty() {
                        obj.remove(event_name);
                    }
                }
            }
        }
        // Re-check: remove empty arrays we may have left
        let empty_keys: Vec<String> = obj
            .iter()
            .filter(|(_, v)| v.as_array().is_some_and(|a| a.is_empty()))
            .map(|(k, _)| k.clone())
            .collect();
        for k in empty_keys {
            obj.remove(&k);
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
        let response = HookResponse {
            should_continue: decision != "deny",
            decision: Some(decision),
            reason,
            suppress_output: None,
        };
        let _ = sender.send(response);
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
    fn hook_response_default_is_continue() {
        let r = HookResponse::default();
        assert!(r.should_continue);
        assert!(r.decision.is_none());
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
