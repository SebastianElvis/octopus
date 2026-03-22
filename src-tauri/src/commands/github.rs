use std::process::Command;

use serde::{Deserialize, Serialize};
use tauri::State;

use crate::error::{AppError, AppResult};
use crate::state::AppState;

// ---------------------------------------------------------------------------
// Data types
// ---------------------------------------------------------------------------

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct GitHubIssue {
    pub number: u64,
    pub title: String,
    pub body: Option<String>,
    pub state: String,
    pub html_url: String,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct GitHubPR {
    pub number: u64,
    pub title: String,
    pub body: Option<String>,
    pub state: String,
    pub html_url: String,
    pub head_ref: String,
    pub base_ref: String,
}

#[derive(Debug, Deserialize)]
struct ApiIssue {
    number: u64,
    title: String,
    body: Option<String>,
    state: String,
    html_url: String,
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
}

#[derive(Debug, Deserialize)]
struct ApiRef {
    #[serde(rename = "ref")]
    ref_name: String,
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

fn parse_owner_repo(github_url: &str) -> AppResult<(String, String)> {
    // Handles:
    //   https://github.com/owner/repo
    //   https://github.com/owner/repo.git
    //   git@github.com:owner/repo.git
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
    let db = match state.db.lock() {
        Ok(db) => db,
        Err(e) => {
            log::warn!("db lock poisoned in lookup_default_branch: {}", e);
            return "main".to_string();
        }
    };
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

// ---------------------------------------------------------------------------
// Commands
// ---------------------------------------------------------------------------

/// Run `gh auth token` and return the token string.
#[tauri::command]
pub async fn get_github_token() -> AppResult<String> {
    let output = Command::new("gh")
        .args(["auth", "token"])
        .output()
        .map_err(|e| AppError::Custom(format!("failed to run gh: {}", e)))?;

    if output.status.success() {
        Ok(String::from_utf8_lossy(&output.stdout).trim().to_string())
    } else {
        let stderr = String::from_utf8_lossy(&output.stderr);
        Err(AppError::Custom(format!(
            "gh auth token failed: {}",
            stderr.trim()
        )))
    }
}

/// Fetch open issues for a repository via the GitHub REST API.
#[tauri::command]
pub async fn fetch_issues(github_url: String) -> AppResult<Vec<GitHubIssue>> {
    let token = get_github_token().await?;
    let (owner, repo) = parse_owner_repo(&github_url)?;

    let url = format!(
        "https://api.github.com/repos/{}/{}/issues?state=open&per_page=100",
        owner, repo
    );

    let client = reqwest::Client::new();
    let resp = client
        .get(&url)
        .header("Authorization", format!("Bearer {}", token))
        .header("User-Agent", "toomanytabs/0.1")
        .header("Accept", "application/vnd.github+json")
        .send()
        .await?;

    if !resp.status().is_success() {
        let status = resp.status();
        let text = resp.text().await.unwrap_or_default();
        return Err(AppError::Custom(format!(
            "GitHub API error {}: {}",
            status, text
        )));
    }

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
        })
        .collect())
}

/// Fetch open pull requests for a repository via the GitHub REST API.
#[tauri::command]
pub async fn fetch_prs(github_url: String) -> AppResult<Vec<GitHubPR>> {
    let token = get_github_token().await?;
    let (owner, repo) = parse_owner_repo(&github_url)?;

    let url = format!(
        "https://api.github.com/repos/{}/{}/pulls?state=open&per_page=100",
        owner, repo
    );

    let client = reqwest::Client::new();
    let resp = client
        .get(&url)
        .header("Authorization", format!("Bearer {}", token))
        .header("User-Agent", "toomanytabs/0.1")
        .header("Accept", "application/vnd.github+json")
        .send()
        .await?;

    if !resp.status().is_success() {
        let status = resp.status();
        let text = resp.text().await.unwrap_or_default();
        return Err(AppError::Custom(format!(
            "GitHub API error {}: {}",
            status, text
        )));
    }

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

    // git commit
    let commit_output = Command::new("git")
        .args(["commit", "-m", &commit_message])
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
///
/// Uses the repo's stored `default_branch` from the database as the base
/// branch instead of hardcoding "main".
#[tauri::command]
pub async fn create_pr(
    state: State<'_, AppState>,
    github_url: String,
    branch: String,
    title: String,
    body: String,
) -> AppResult<GitHubPR> {
    let token = get_github_token().await?;
    let (owner, repo) = parse_owner_repo(&github_url)?;

    // Look up the default branch from the DB instead of hardcoding "main"
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
        body: body.clone(),
        head: branch.clone(),
        base,
    };

    let client = reqwest::Client::new();
    let resp = client
        .post(&url)
        .header("Authorization", format!("Bearer {}", token))
        .header("User-Agent", "toomanytabs/0.1")
        .header("Accept", "application/vnd.github+json")
        .json(&payload)
        .send()
        .await?;

    if !resp.status().is_success() {
        let status = resp.status();
        let text = resp.text().await.unwrap_or_default();
        return Err(AppError::Custom(format!(
            "GitHub API error {}: {}",
            status, text
        )));
    }

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
    })
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
}
