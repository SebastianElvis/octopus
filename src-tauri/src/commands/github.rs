use std::process::Command;
use std::time::{Duration, Instant};

use serde::{Deserialize, Serialize};
use tauri::{AppHandle, State};

use crate::error::{AppError, AppResult};
use crate::state::{AppState, CachedToken};

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/// How long to cache a GitHub token before refreshing.
const TOKEN_CACHE_DURATION: Duration = Duration::from_secs(5 * 60);

/// Maximum retries for retryable HTTP errors.
const MAX_RETRIES: u32 = 3;

// ---------------------------------------------------------------------------
// Data types
// ---------------------------------------------------------------------------

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct LabelInfo {
    pub name: String,
    pub color: String,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct GitHubIssue {
    pub number: u64,
    pub title: String,
    pub body: Option<String>,
    pub state: String,
    pub html_url: String,
    pub labels: Vec<LabelInfo>,
    pub user: String,
    pub comments: u64,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct GitHubPR {
    pub number: u64,
    pub title: String,
    pub body: Option<String>,
    pub state: String,
    pub html_url: String,
    pub head_ref: String,
    pub base_ref: String,
    pub user: String,
    pub comments: u64,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct CheckRun {
    pub id: i64,
    pub name: String,
    pub status: String,
    pub conclusion: Option<String>,
    pub html_url: String,
    pub started_at: Option<String>,
    pub completed_at: Option<String>,
}

#[derive(Debug, Deserialize)]
struct ApiLabel {
    name: String,
    color: String,
}

#[derive(Debug, Deserialize)]
struct ApiIssue {
    number: u64,
    title: String,
    body: Option<String>,
    state: String,
    html_url: String,
    #[serde(default)]
    labels: Vec<ApiLabel>,
    user: ApiUser,
    #[serde(default)]
    comments: u64,
    created_at: String,
    updated_at: String,
}

#[derive(Debug, Deserialize)]
struct ApiPR {
    number: u64,
    title: String,
    body: Option<String>,
    state: String,
    html_url: String,
    head: ApiRef,
    base: ApiRef,
    user: ApiUser,
    #[serde(default)]
    comments: u64,
    created_at: String,
    updated_at: String,
}

#[derive(Debug, Deserialize)]
struct ApiRef {
    #[serde(rename = "ref")]
    ref_name: String,
}

#[derive(Debug, Deserialize)]
struct ApiReviewComment {
    id: i64,
    body: String,
    path: String,
    line: Option<i32>,
    user: ApiUser,
    created_at: String,
    updated_at: String,
}

#[derive(Debug, Deserialize)]
struct ApiUser {
    login: String,
}

#[derive(Debug, Deserialize)]
struct ApiCheckRun {
    id: i64,
    name: String,
    status: String,
    conclusion: Option<String>,
    html_url: String,
    started_at: Option<String>,
    completed_at: Option<String>,
}

#[derive(Debug, Deserialize)]
struct ApiCheckRunsResponse {
    check_runs: Vec<ApiCheckRun>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct MergeResult {
    pub sha: String,
    pub merged: bool,
    pub message: String,
}

#[derive(Debug, Deserialize)]
struct ApiMergeResponse {
    sha: Option<String>,
    merged: Option<bool>,
    message: Option<String>,
}

// ---------------------------------------------------------------------------
// Public data types
// ---------------------------------------------------------------------------

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct ReviewComment {
    pub id: i64,
    pub body: String,
    pub path: String,
    pub line: Option<i32>,
    pub user: String,
    pub created_at: String,
    pub updated_at: String,
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

fn lookup_github_url(state: &AppState, repo_id: &str) -> AppResult<String> {
    let db = state.db.lock();
    let url: String = db
        .query_row(
            "SELECT github_url FROM repos WHERE id = ?1",
            rusqlite::params![repo_id],
            |row| row.get(0),
        )
        .map_err(|_| AppError::NotFound(format!("repo not found: {}", repo_id)))?;
    Ok(url)
}

fn parse_owner_repo(github_url: &str) -> AppResult<(String, String)> {
    let stripped = github_url.trim_end_matches(".git").trim_end_matches('/');

    let part = if stripped.contains("github.com:") {
        stripped.split("github.com:").nth(1).unwrap_or("")
    } else if stripped.contains("github.com/") {
        stripped.split("github.com/").nth(1).unwrap_or("")
    } else {
        return Err(AppError::Custom(format!(
            "cannot parse GitHub URL: {}",
            github_url
        )));
    };

    let mut iter = part.splitn(2, '/');
    let owner = iter
        .next()
        .ok_or_else(|| AppError::Custom("missing owner in GitHub URL".to_string()))?;
    let repo = iter
        .next()
        .ok_or_else(|| AppError::Custom("missing repo in GitHub URL".to_string()))?;
    Ok((owner.to_string(), repo.to_string()))
}

/// Look up the default_branch for a repo stored in the DB, given its github_url.
/// Falls back to "main" if not found.
fn lookup_default_branch(state: &AppState, github_url: &str) -> String {
    let db = state.db.lock();
    let result: Result<String, _> = db.query_row(
        "SELECT default_branch FROM repos WHERE github_url = ?1",
        [github_url],
        |row| row.get(0),
    );
    match result {
        Ok(branch) => branch,
        Err(_) => {
            log::warn!(
                "Could not find default_branch for {} in DB, falling back to 'main'",
                github_url
            );
            "main".to_string()
        }
    }
}

/// Get or refresh the cached GitHub auth token.
/// Caches the token for TOKEN_CACHE_DURATION (5 minutes).
fn get_or_refresh_token(state: &AppState) -> AppResult<String> {
    {
        let cached = state.github_token.lock();
        if let Some(ref ct) = *cached {
            if ct.fetched_at.elapsed() < TOKEN_CACHE_DURATION {
                return Ok(ct.token.clone());
            }
        }
    }

    // Token expired or not cached — refresh
    let output = Command::new("gh")
        .args(["auth", "token"])
        .output()
        .map_err(|e| AppError::Custom(format!("failed to run gh: {}", e)))?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        return Err(AppError::AuthFailed(format!(
            "gh auth token failed: {}",
            stderr.trim()
        )));
    }

    let token = String::from_utf8_lossy(&output.stdout).trim().to_string();

    // Cache the new token
    {
        let mut cached = state.github_token.lock();
        *cached = Some(CachedToken {
            token: token.clone(),
            fetched_at: Instant::now(),
        });
    }

    Ok(token)
}

/// Categorize a GitHub API response status code into an appropriate error.
fn categorize_github_error(status: reqwest::StatusCode, body: &str) -> AppError {
    match status.as_u16() {
        401 | 403 => AppError::AuthFailed(format!("GitHub API auth error {}: {}", status, body)),
        404 => AppError::NotFound(format!("GitHub resource not found: {}", body)),
        409 => AppError::Custom(format!("GitHub conflict (409): {}", body)),
        429 => AppError::RateLimited(format!("GitHub rate limit exceeded: {}", body)),
        s if s >= 500 => AppError::Custom(format!("GitHub server error {}: {}", status, body)),
        _ => AppError::Custom(format!("GitHub API error {}: {}", status, body)),
    }
}

/// Execute a GitHub API request with retry logic for 429 and 5xx errors.
/// Uses exponential backoff with max MAX_RETRIES retries.
async fn github_request(
    _client: &reqwest::Client,
    request_builder: impl Fn() -> reqwest::RequestBuilder,
    token: &str,
) -> AppResult<reqwest::Response> {
    let mut last_error = None;

    for attempt in 0..MAX_RETRIES {
        let resp = request_builder()
            .header("Authorization", format!("Bearer {}", token))
            .header("User-Agent", "toomanytabs/0.1")
            .header("Accept", "application/vnd.github+json")
            .send()
            .await?;

        let status = resp.status();

        // Log rate limit headers
        if let Some(remaining) = resp.headers().get("x-ratelimit-remaining") {
            if let Ok(remaining_str) = remaining.to_str() {
                if let Ok(remaining_val) = remaining_str.parse::<u32>() {
                    if remaining_val < 100 {
                        log::warn!("GitHub API rate limit low: {} remaining", remaining_val);
                    }
                }
            }
        }

        if status.is_success() {
            return Ok(resp);
        }

        // For retryable errors (429, 5xx), retry with backoff
        let is_retryable = status.as_u16() == 429 || status.as_u16() >= 500;
        if is_retryable && attempt < MAX_RETRIES - 1 {
            let backoff_ms = 1000 * 2u64.pow(attempt);

            // If rate limited, check Retry-After or X-RateLimit-Reset headers
            let wait_ms = if status.as_u16() == 429 {
                if let Some(retry_after) = resp.headers().get("retry-after") {
                    retry_after
                        .to_str()
                        .ok()
                        .and_then(|s| s.parse::<u64>().ok())
                        .map(|s| s * 1000)
                        .unwrap_or(backoff_ms)
                } else {
                    backoff_ms
                }
            } else {
                backoff_ms
            };

            log::warn!(
                "GitHub API {} (attempt {}/{}), retrying in {}ms",
                status,
                attempt + 1,
                MAX_RETRIES,
                wait_ms
            );
            tokio::time::sleep(Duration::from_millis(wait_ms)).await;
            continue;
        }

        // Non-retryable or exhausted retries
        let body = resp
            .text()
            .await
            .unwrap_or_else(|e| format!("(failed to read response body: {})", e));
        last_error = Some(categorize_github_error(status, &body));
        break;
    }

    Err(last_error.unwrap_or_else(|| AppError::Custom("GitHub request failed".to_string())))
}

/// Execute a GET request with ETag caching. Returns cached body on 304.
async fn github_get_cached(
    client: &reqwest::Client,
    url: &str,
    token: &str,
    etag_cache: &parking_lot::Mutex<std::collections::HashMap<String, (String, String)>>,
) -> AppResult<String> {
    let mut req = client
        .get(url)
        .header("Authorization", format!("Bearer {}", token))
        .header("User-Agent", "toomanytabs/0.1")
        .header("Accept", "application/vnd.github+json");

    // Add If-None-Match header if we have a cached ETag
    let cached_etag = {
        let cache = etag_cache.lock();
        cache.get(url).map(|(etag, _)| etag.clone())
    };
    if let Some(ref etag) = cached_etag {
        req = req.header("If-None-Match", etag.as_str());
    }

    let resp = req.send().await?;

    if resp.status() == reqwest::StatusCode::NOT_MODIFIED {
        // Return cached body
        let cache = etag_cache.lock();
        if let Some((_, body)) = cache.get(url) {
            return Ok(body.clone());
        }
    }

    if !resp.status().is_success() {
        let status = resp.status();
        let body = resp.text().await.unwrap_or_default();
        return Err(categorize_github_error(status, &body));
    }

    // Cache the ETag and body
    let new_etag = resp
        .headers()
        .get("etag")
        .and_then(|v| v.to_str().ok())
        .map(|s| s.to_string());
    let body = resp.text().await?;
    if let Some(etag) = new_etag {
        let mut cache = etag_cache.lock();
        cache.insert(url.to_string(), (etag, body.clone()));
    }

    Ok(body)
}

// ---------------------------------------------------------------------------
// Commands
// ---------------------------------------------------------------------------

/// Run `gh auth token` and return the token string.
#[tauri::command]
pub async fn get_github_token(state: State<'_, AppState>) -> AppResult<String> {
    get_or_refresh_token(&state)
}

/// Fetch open issues for a repository via the GitHub REST API.
#[tauri::command]
pub async fn fetch_issues(
    state: State<'_, AppState>,
    repo_id: String,
) -> AppResult<Vec<GitHubIssue>> {
    let github_url = lookup_github_url(&state, &repo_id)?;
    let token = get_or_refresh_token(&state)?;
    let (owner, repo) = parse_owner_repo(&github_url)?;

    let url = format!(
        "https://api.github.com/repos/{}/{}/issues?state=open&per_page=100",
        owner, repo
    );

    let client = &state.http_client;
    let resp = github_request(client, || client.get(&url), &token).await?;

    let api_issues: Vec<ApiIssue> = resp.json().await?;

    log::info!("Fetched {} issues for {}/{}", api_issues.len(), owner, repo);

    Ok(api_issues
        .into_iter()
        .map(|i| GitHubIssue {
            number: i.number,
            title: i.title,
            body: i.body,
            state: i.state,
            html_url: i.html_url,
            labels: i
                .labels
                .into_iter()
                .map(|l| LabelInfo {
                    name: l.name,
                    color: l.color,
                })
                .collect(),
            user: i.user.login,
            comments: i.comments,
            created_at: i.created_at,
            updated_at: i.updated_at,
        })
        .collect())
}

/// Fetch open pull requests for a repository via the GitHub REST API.
#[tauri::command]
pub async fn fetch_prs(state: State<'_, AppState>, repo_id: String) -> AppResult<Vec<GitHubPR>> {
    let github_url = lookup_github_url(&state, &repo_id)?;
    let token = get_or_refresh_token(&state)?;
    let (owner, repo) = parse_owner_repo(&github_url)?;

    let url = format!(
        "https://api.github.com/repos/{}/{}/pulls?state=open&per_page=100",
        owner, repo
    );

    let client = &state.http_client;
    let resp = github_request(client, || client.get(&url), &token).await?;

    let api_prs: Vec<ApiPR> = resp.json().await?;

    log::info!("Fetched {} PRs for {}/{}", api_prs.len(), owner, repo);

    Ok(api_prs
        .into_iter()
        .map(|p| GitHubPR {
            number: p.number,
            title: p.title,
            body: p.body,
            state: p.state,
            html_url: p.html_url,
            head_ref: p.head.ref_name,
            base_ref: p.base.ref_name,
            user: p.user.login,
            comments: p.comments,
            created_at: p.created_at,
            updated_at: p.updated_at,
        })
        .collect())
}

/// Stage all changes, commit with a message, and push in the given worktree.
#[tauri::command]
pub async fn git_commit_and_push(worktree_path: String, commit_message: String) -> AppResult<()> {
    // git add -A
    let add_output = Command::new("git")
        .args(["add", "-A"])
        .current_dir(&worktree_path)
        .output()?;
    if !add_output.status.success() {
        let stderr = String::from_utf8_lossy(&add_output.stderr);
        return Err(AppError::Custom(format!(
            "git add -A failed: {}",
            stderr.trim()
        )));
    }

    // git commit (--no-gpg-sign because GPG prompts can't work in a headless context)
    let commit_output = Command::new("git")
        .args(["commit", "--no-gpg-sign", "-m", &commit_message])
        .current_dir(&worktree_path)
        .output()?;
    if !commit_output.status.success() {
        let stderr = String::from_utf8_lossy(&commit_output.stderr);
        return Err(AppError::Custom(format!(
            "git commit failed: {}",
            stderr.trim()
        )));
    }

    // git push
    let push_output = Command::new("git")
        .args(["push"])
        .current_dir(&worktree_path)
        .output()?;
    if !push_output.status.success() {
        let stderr = String::from_utf8_lossy(&push_output.stderr);
        return Err(AppError::Custom(format!(
            "git push failed: {}",
            stderr.trim()
        )));
    }

    log::info!("Committed and pushed in {}", worktree_path);
    Ok(())
}

/// Create a pull request via the GitHub REST API.
#[tauri::command]
pub async fn create_pr(
    state: State<'_, AppState>,
    repo_id: String,
    head_branch: String,
    title: String,
    body: Option<String>,
) -> AppResult<GitHubPR> {
    let github_url = lookup_github_url(&state, &repo_id)?;
    let token = get_or_refresh_token(&state)?;
    let (owner, repo) = parse_owner_repo(&github_url)?;

    let base = lookup_default_branch(&state, &github_url);

    let url = format!("https://api.github.com/repos/{}/{}/pulls", owner, repo);

    #[derive(Serialize)]
    struct CreatePRBody {
        title: String,
        body: String,
        head: String,
        base: String,
    }

    let payload = CreatePRBody {
        title: title.clone(),
        body: body.clone().unwrap_or_default(),
        head: head_branch.clone(),
        base,
    };

    let client = &state.http_client;
    let payload_json = serde_json::to_value(&payload)?;
    let resp = github_request(client, || client.post(&url).json(&payload_json), &token).await?;

    let api_pr: ApiPR = resp.json().await?;

    log::info!("Created PR #{} in {}/{}", api_pr.number, owner, repo);

    Ok(GitHubPR {
        number: api_pr.number,
        title: api_pr.title,
        body: api_pr.body,
        state: api_pr.state,
        html_url: api_pr.html_url,
        head_ref: api_pr.head.ref_name,
        base_ref: api_pr.base.ref_name,
        user: api_pr.user.login,
        comments: api_pr.comments,
        created_at: api_pr.created_at,
        updated_at: api_pr.updated_at,
    })
}

/// Fetch pull request review (inline) comments via the GitHub REST API.
#[tauri::command]
pub async fn fetch_pr_review_comments(
    state: State<'_, AppState>,
    repo_id: String,
    pr_number: u64,
) -> AppResult<Vec<ReviewComment>> {
    let github_url = lookup_github_url(&state, &repo_id)?;
    let token = get_or_refresh_token(&state)?;
    let (owner, repo) = parse_owner_repo(&github_url)?;

    let url = format!(
        "https://api.github.com/repos/{}/{}/pulls/{}/comments?per_page=100",
        owner, repo, pr_number
    );

    let client = &state.http_client;
    let resp = github_request(client, || client.get(&url), &token).await?;

    let api_comments: Vec<ApiReviewComment> = resp.json().await?;

    log::info!(
        "Fetched {} review comments for {}/{} PR #{}",
        api_comments.len(),
        owner,
        repo,
        pr_number
    );

    Ok(api_comments
        .into_iter()
        .map(|c| ReviewComment {
            id: c.id,
            body: c.body,
            path: c.path,
            line: c.line,
            user: c.user.login,
            created_at: c.created_at,
            updated_at: c.updated_at,
        })
        .collect())
}

/// Fetch check runs for a specific git ref (branch, tag, or SHA).
#[tauri::command]
pub async fn fetch_check_runs(
    state: State<'_, AppState>,
    repo_id: String,
    git_ref: String,
) -> AppResult<Vec<CheckRun>> {
    let github_url = lookup_github_url(&state, &repo_id)?;
    let token = get_or_refresh_token(&state)?;
    let (owner, repo) = parse_owner_repo(&github_url)?;

    let url = format!(
        "https://api.github.com/repos/{}/{}/commits/{}/check-runs",
        owner, repo, git_ref
    );

    let body = github_get_cached(&state.http_client, &url, &token, &state.etag_cache).await?;

    let api_response: ApiCheckRunsResponse = serde_json::from_str(&body)?;

    log::info!(
        "Fetched {} check runs for {}/{} ref {}",
        api_response.check_runs.len(),
        owner,
        repo,
        git_ref
    );

    Ok(api_response
        .check_runs
        .into_iter()
        .map(|c| CheckRun {
            id: c.id,
            name: c.name,
            status: c.status,
            conclusion: c.conclusion,
            html_url: c.html_url,
            started_at: c.started_at,
            completed_at: c.completed_at,
        })
        .collect())
}

/// Merge a pull request via the GitHub REST API.
#[tauri::command]
pub async fn merge_pr(
    state: State<'_, AppState>,
    repo_id: String,
    pr_number: u64,
    merge_method: String,
) -> AppResult<MergeResult> {
    let github_url = lookup_github_url(&state, &repo_id)?;
    let token = get_or_refresh_token(&state)?;
    let (owner, repo) = parse_owner_repo(&github_url)?;

    let url = format!(
        "https://api.github.com/repos/{}/{}/pulls/{}/merge",
        owner, repo, pr_number
    );

    #[derive(Serialize)]
    struct MergeBody {
        merge_method: String,
    }

    let payload = MergeBody {
        merge_method: merge_method.clone(),
    };

    let client = &state.http_client;
    let payload_json = serde_json::to_value(&payload)?;
    let resp = github_request(client, || client.put(&url).json(&payload_json), &token).await?;

    let api_merge: ApiMergeResponse = resp.json().await?;

    log::info!(
        "Merged PR #{} in {}/{} using {}",
        pr_number,
        owner,
        repo,
        merge_method
    );

    Ok(MergeResult {
        sha: api_merge.sha.unwrap_or_default(),
        merged: api_merge.merged.unwrap_or(true),
        message: api_merge
            .message
            .unwrap_or_else(|| "Pull Request merged".to_string()),
    })
}

/// Delete a remote branch via the GitHub REST API.
#[tauri::command]
pub async fn delete_remote_branch(
    state: State<'_, AppState>,
    repo_id: String,
    branch: String,
) -> AppResult<()> {
    let github_url = lookup_github_url(&state, &repo_id)?;
    let token = get_or_refresh_token(&state)?;
    let (owner, repo) = parse_owner_repo(&github_url)?;

    let url = format!(
        "https://api.github.com/repos/{}/{}/git/refs/heads/{}",
        owner, repo, branch
    );

    let client = &state.http_client;
    let resp = github_request(client, || client.delete(&url), &token).await?;

    // 204 No Content is success for DELETE
    if resp.status().as_u16() != 204 && !resp.status().is_success() {
        let body = resp
            .text()
            .await
            .unwrap_or_else(|e| format!("(failed to read response body: {})", e));
        return Err(AppError::Custom(format!(
            "Failed to delete branch '{}': {}",
            branch, body
        )));
    }

    log::info!("Deleted remote branch '{}' in {}/{}", branch, owner, repo);
    Ok(())
}

/// Close a GitHub issue via the REST API.
#[tauri::command]
pub async fn close_issue(
    state: State<'_, AppState>,
    repo_id: String,
    issue_number: u64,
) -> AppResult<()> {
    let github_url = lookup_github_url(&state, &repo_id)?;
    let token = get_or_refresh_token(&state)?;
    let (owner, repo) = parse_owner_repo(&github_url)?;

    let url = format!(
        "https://api.github.com/repos/{}/{}/issues/{}",
        owner, repo, issue_number
    );

    #[derive(Serialize)]
    struct CloseIssueBody {
        state: String,
    }

    let payload = CloseIssueBody {
        state: "closed".to_string(),
    };

    let client = &state.http_client;
    let payload_json = serde_json::to_value(&payload)?;
    let resp = github_request(client, || client.patch(&url).json(&payload_json), &token).await?;

    // Consume the response body
    let _: serde_json::Value = resp.json().await?;

    log::info!("Closed issue #{} in {}/{}", issue_number, owner, repo);
    Ok(())
}

/// Create a session from PR review comments.
#[tauri::command]
pub async fn create_session_from_review(
    app: AppHandle,
    state: State<'_, AppState>,
    repo_id: String,
    pr_number: u64,
    comment_ids: Vec<i64>,
) -> AppResult<crate::commands::sessions::Session> {
    // Look up repo info
    let (_github_url, _worktree_path, default_branch) = {
        let db = state.db.lock();
        let result: Result<(String, String, String), _> = db.query_row(
            "SELECT github_url, local_path, default_branch FROM repos WHERE id = ?1",
            [&repo_id],
            |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?)),
        );
        result.map_err(|_| AppError::NotFound(format!("repo {} not found", repo_id)))?
    };

    // Fetch all review comments for the PR
    let all_comments = fetch_pr_review_comments(state.clone(), repo_id.clone(), pr_number).await?;

    // Filter to only the requested comment ids
    let selected: Vec<&ReviewComment> = all_comments
        .iter()
        .filter(|c| comment_ids.contains(&c.id))
        .collect();

    if selected.is_empty() {
        return Err(AppError::NotFound(
            "no matching review comments found for the provided IDs".to_string(),
        ));
    }

    // Build prompt
    let comment_text = selected
        .iter()
        .map(|c| {
            let line_info = c.line.map(|l| format!(" (line {})", l)).unwrap_or_default();
            format!("- `{}`{}:\n  {}", c.path, line_info, c.body)
        })
        .collect::<Vec<_>>()
        .join("\n\n");

    let prompt = format!(
        "Address the following PR review comments on PR #{}:\n\n{}",
        pr_number, comment_text
    );

    let session_name = format!("Review PR #{}", pr_number);
    let branch = default_branch.clone();

    // Delegate to spawn_session
    let params = crate::commands::sessions::SpawnSessionParams {
        repo_id,
        branch,
        prompt,
        name: Some(session_name),
        issue_number: None,
        pr_number: Some(pr_number as i64),
        force: None,
        dangerously_skip_permissions: None,
    };
    crate::commands::sessions::spawn_session(app, state, params).await
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parse_https_url() {
        let (owner, repo) = parse_owner_repo("https://github.com/octocat/hello-world").unwrap();
        assert_eq!(owner, "octocat");
        assert_eq!(repo, "hello-world");
    }

    #[test]
    fn parse_https_url_with_git_suffix() {
        let (owner, repo) = parse_owner_repo("https://github.com/octocat/hello-world.git").unwrap();
        assert_eq!(owner, "octocat");
        assert_eq!(repo, "hello-world");
    }

    #[test]
    fn parse_ssh_url() {
        let (owner, repo) = parse_owner_repo("git@github.com:octocat/hello-world.git").unwrap();
        assert_eq!(owner, "octocat");
        assert_eq!(repo, "hello-world");
    }

    #[test]
    fn parse_url_with_trailing_slash() {
        let (owner, repo) = parse_owner_repo("https://github.com/octocat/hello-world/").unwrap();
        assert_eq!(owner, "octocat");
        assert_eq!(repo, "hello-world");
    }

    #[test]
    fn parse_invalid_url_returns_error() {
        let result = parse_owner_repo("https://gitlab.com/octocat/hello-world");
        assert!(result.is_err());
    }

    #[test]
    fn categorize_401_as_auth_failed() {
        let err = categorize_github_error(reqwest::StatusCode::UNAUTHORIZED, "bad creds");
        assert!(matches!(err, AppError::AuthFailed(_)));
    }

    #[test]
    fn categorize_403_as_auth_failed() {
        let err = categorize_github_error(reqwest::StatusCode::FORBIDDEN, "forbidden");
        assert!(matches!(err, AppError::AuthFailed(_)));
    }

    #[test]
    fn categorize_404_as_not_found() {
        let err = categorize_github_error(reqwest::StatusCode::NOT_FOUND, "not found");
        assert!(matches!(err, AppError::NotFound(_)));
    }

    #[test]
    fn categorize_429_as_rate_limited() {
        let err = categorize_github_error(reqwest::StatusCode::TOO_MANY_REQUESTS, "rate limited");
        assert!(matches!(err, AppError::RateLimited(_)));
    }

    #[test]
    fn categorize_500_as_server_error() {
        let err =
            categorize_github_error(reqwest::StatusCode::INTERNAL_SERVER_ERROR, "server error");
        assert!(matches!(err, AppError::Custom(_)));
        assert!(err.to_string().contains("server error"));
    }

    #[test]
    fn categorize_409_as_conflict() {
        let err = categorize_github_error(reqwest::StatusCode::CONFLICT, "merge conflict");
        assert!(matches!(err, AppError::Custom(_)));
        assert!(err.to_string().contains("conflict"));
    }

    #[test]
    fn categorize_502_as_server_error() {
        let err = categorize_github_error(reqwest::StatusCode::BAD_GATEWAY, "bad gateway");
        assert!(matches!(err, AppError::Custom(_)));
        assert!(err.to_string().contains("server error"));
    }

    #[test]
    fn categorize_422_as_generic_api_error() {
        let err = categorize_github_error(reqwest::StatusCode::UNPROCESSABLE_ENTITY, "validation");
        assert!(matches!(err, AppError::Custom(_)));
        assert!(err.to_string().contains("API error"));
    }

    #[test]
    fn parse_ssh_url_without_git_suffix() {
        let (owner, repo) = parse_owner_repo("git@github.com:org/repo-name").unwrap();
        assert_eq!(owner, "org");
        assert_eq!(repo, "repo-name");
    }

    #[test]
    fn parse_https_url_complex_repo_name() {
        let (owner, repo) =
            parse_owner_repo("https://github.com/my-org/my.dotted.repo.git").unwrap();
        assert_eq!(owner, "my-org");
        assert_eq!(repo, "my.dotted.repo");
    }

    #[test]
    fn lookup_github_url_found() {
        let conn = rusqlite::Connection::open_in_memory().expect("open");
        conn.execute_batch("PRAGMA foreign_keys=ON;").expect("fk");
        crate::db::create_schema(&conn).expect("schema");
        conn.execute(
            "INSERT INTO repos (id, github_url, local_path, default_branch, added_at)
             VALUES (?1, ?2, ?3, ?4, ?5)",
            rusqlite::params![
                "r1",
                "https://github.com/owner/repo",
                "/tmp/repo",
                "main",
                "2024-01-01"
            ],
        )
        .expect("insert");

        let state = crate::state::AppState::new(conn);
        let url = lookup_github_url(&state, "r1").unwrap();
        assert_eq!(url, "https://github.com/owner/repo");
    }

    #[test]
    fn lookup_github_url_not_found() {
        let conn = rusqlite::Connection::open_in_memory().expect("open");
        conn.execute_batch("PRAGMA foreign_keys=ON;").expect("fk");
        crate::db::create_schema(&conn).expect("schema");

        let state = crate::state::AppState::new(conn);
        let result = lookup_github_url(&state, "nonexistent");
        assert!(result.is_err());
        assert!(matches!(result.unwrap_err(), AppError::NotFound(_)));
    }

    #[test]
    fn lookup_default_branch_found() {
        let conn = rusqlite::Connection::open_in_memory().expect("open");
        conn.execute_batch("PRAGMA foreign_keys=ON;").expect("fk");
        crate::db::create_schema(&conn).expect("schema");
        conn.execute(
            "INSERT INTO repos (id, github_url, local_path, default_branch, added_at)
             VALUES (?1, ?2, ?3, ?4, ?5)",
            rusqlite::params![
                "r1",
                "https://github.com/owner/repo",
                "/tmp/repo",
                "develop",
                "2024-01-01"
            ],
        )
        .expect("insert");

        let state = crate::state::AppState::new(conn);
        let branch = lookup_default_branch(&state, "https://github.com/owner/repo");
        assert_eq!(branch, "develop");
    }

    #[test]
    fn lookup_default_branch_falls_back_to_main() {
        let conn = rusqlite::Connection::open_in_memory().expect("open");
        conn.execute_batch("PRAGMA foreign_keys=ON;").expect("fk");
        crate::db::create_schema(&conn).expect("schema");

        let state = crate::state::AppState::new(conn);
        let branch = lookup_default_branch(&state, "https://github.com/unknown/repo");
        assert_eq!(branch, "main");
    }

    #[test]
    fn github_issue_serializes_to_camel_case() {
        let issue = GitHubIssue {
            number: 1,
            title: "Bug".to_string(),
            body: Some("details".to_string()),
            state: "open".to_string(),
            html_url: "https://github.com/a/b/issues/1".to_string(),
            labels: vec![LabelInfo {
                name: "bug".to_string(),
                color: "d73a4a".to_string(),
            }],
            user: "octocat".to_string(),
            comments: 3,
            created_at: "2024-01-01".to_string(),
            updated_at: "2024-01-02".to_string(),
        };

        let json = serde_json::to_value(&issue).unwrap();
        assert!(json.get("htmlUrl").is_some());
        assert!(json.get("createdAt").is_some());
        assert!(json.get("updatedAt").is_some());
        assert!(json.get("html_url").is_none());
    }

    #[test]
    fn github_pr_serializes_to_camel_case() {
        let pr = GitHubPR {
            number: 42,
            title: "Feature".to_string(),
            body: None,
            state: "open".to_string(),
            html_url: "https://github.com/a/b/pull/42".to_string(),
            head_ref: "feat-branch".to_string(),
            base_ref: "main".to_string(),
            user: "dev".to_string(),
            comments: 0,
            created_at: "2024-01-01".to_string(),
            updated_at: "2024-01-02".to_string(),
        };

        let json = serde_json::to_value(&pr).unwrap();
        assert!(json.get("headRef").is_some());
        assert!(json.get("baseRef").is_some());
        assert!(json.get("htmlUrl").is_some());
    }

    #[test]
    fn check_run_serializes_to_camel_case() {
        let check = CheckRun {
            id: 1,
            name: "CI".to_string(),
            status: "completed".to_string(),
            conclusion: Some("success".to_string()),
            html_url: "https://github.com/a/b/runs/1".to_string(),
            started_at: Some("2024-01-01".to_string()),
            completed_at: Some("2024-01-02".to_string()),
        };

        let json = serde_json::to_value(&check).unwrap();
        assert!(json.get("htmlUrl").is_some());
        assert!(json.get("startedAt").is_some());
        assert!(json.get("completedAt").is_some());
    }

    #[test]
    fn merge_result_serialization() {
        let result = MergeResult {
            sha: "abc123".to_string(),
            merged: true,
            message: "Merged".to_string(),
        };
        let json = serde_json::to_string(&result).unwrap();
        let parsed: serde_json::Value = serde_json::from_str(&json).unwrap();
        assert_eq!(parsed["sha"], "abc123");
        assert_eq!(parsed["merged"], true);
        assert_eq!(parsed["message"], "Merged");
    }

    #[test]
    fn review_comment_serializes_to_camel_case() {
        let comment = ReviewComment {
            id: 1,
            body: "Fix this".to_string(),
            path: "src/main.rs".to_string(),
            line: Some(42),
            user: "reviewer".to_string(),
            created_at: "2024-01-01".to_string(),
            updated_at: "2024-01-02".to_string(),
        };

        let json = serde_json::to_value(&comment).unwrap();
        assert!(json.get("createdAt").is_some());
        assert!(json.get("updatedAt").is_some());
    }
}
