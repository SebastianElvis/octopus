import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import type { Session, Repo, GitHubIssue, GitHubPR } from "./types";

// ── Session commands ─────────────────────────────────────────────────────────

export function spawnSession(params: {
  repoId: string;
  branch: string;
  prompt: string;
  name?: string;
  issueNumber?: number;
  prNumber?: number;
}): Promise<Session> {
  return invoke<Session>("spawn_session", { params });
}

export function replyToSession(id: string, message: string): Promise<void> {
  return invoke<void>("reply_to_session", { id, message });
}

export function interruptSession(id: string): Promise<void> {
  return invoke<void>("interrupt_session", { id });
}

export function killSession(id: string): Promise<void> {
  return invoke<void>("kill_session", { id });
}

export function listSessions(): Promise<Session[]> {
  return invoke<Session[]>("list_sessions");
}

export function getSession(id: string): Promise<Session> {
  return invoke<Session>("get_session", { id });
}

// ── Worktree commands ────────────────────────────────────────────────────────

export function createWorktree(params: {
  repoId: string;
  branch: string;
  baseBranch?: string;
}): Promise<string> {
  return invoke<string>("create_worktree", { params });
}

export function removeWorktree(worktreePath: string): Promise<void> {
  return invoke<void>("remove_worktree", { worktreePath });
}

// ── Repo commands ────────────────────────────────────────────────────────────

export function getGithubToken(): Promise<string | null> {
  return invoke<string | null>("get_github_token");
}

export function addRepo(githubUrl: string, localPath: string): Promise<Repo> {
  return invoke<Repo>("add_repo", { githubUrl, localPath });
}

export function listRepos(): Promise<Repo[]> {
  return invoke<Repo[]>("list_repos");
}

// ── GitHub commands ──────────────────────────────────────────────────────────

export function fetchIssues(repoId: string): Promise<GitHubIssue[]> {
  return invoke<GitHubIssue[]>("fetch_issues", { repoId });
}

export function fetchPRs(repoId: string): Promise<GitHubPR[]> {
  return invoke<GitHubPR[]>("fetch_prs", { repoId });
}

// ── Git commands ─────────────────────────────────────────────────────────────

export function gitCommitAndPush(params: { worktreePath: string; message: string }): Promise<void> {
  return invoke<void>("git_commit_and_push", { params });
}

export function createPR(params: {
  repoId: string;
  headBranch: string;
  title: string;
  body?: string;
}): Promise<GitHubPR> {
  return invoke<GitHubPR>("create_pr", { params });
}

export function getDiff(worktreePath: string): Promise<string> {
  return invoke<string>("get_diff", { worktreePath });
}

// ── Event listeners ──────────────────────────────────────────────────────────

export type SessionStateChangedPayload = {
  session: Session;
};

export type SessionOutputPayload = {
  sessionId: string;
  line: string;
};

export function onSessionStateChanged(
  callback: (payload: SessionStateChangedPayload) => void,
): Promise<() => void> {
  return listen<SessionStateChangedPayload>("session-state-changed", (event) =>
    callback(event.payload),
  );
}

export function onSessionOutput(
  callback: (payload: SessionOutputPayload) => void,
): Promise<() => void> {
  return listen<SessionOutputPayload>("session-output", (event) => callback(event.payload));
}
