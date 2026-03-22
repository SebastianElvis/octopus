/**
 * Tauri backend bridge.
 *
 * Every function guards on `isTauri()` so the frontend can run standalone
 * in a plain browser for development (`pnpm dev` without `tauri dev`).
 * When outside Tauri, commands return sensible defaults and event listeners
 * are silently skipped.
 */

import { isTauri } from "./env";
import type { Session, Repo, GitHubIssue, GitHubPR } from "./types";

/** No-op unlisten stub for when Tauri is not available. */
// eslint-disable-next-line @typescript-eslint/no-empty-function
const noop = (): void => {};

// Lazy imports — `@tauri-apps/api` throws at import time when __TAURI_INTERNALS__
// is missing, so we dynamic-import only when we know we're inside Tauri.
async function tauriInvoke<T>(cmd: string, args?: Record<string, unknown>): Promise<T> {
  const { invoke } = await import("@tauri-apps/api/core");
  return invoke<T>(cmd, args);
}

async function tauriListen(
  event: string,
  handler: (event: { payload: unknown }) => void,
): Promise<() => void> {
  const { listen } = await import("@tauri-apps/api/event");
  return listen(event, handler);
}

// ── Session commands ─────────────────────────────────────────────────────────

export async function spawnSession(params: {
  repoId: string;
  branch: string;
  prompt: string;
  name?: string;
  issueNumber?: number;
  prNumber?: number;
}): Promise<Session> {
  return tauriInvoke<Session>("spawn_session", { params });
}

export async function replyToSession(id: string, message: string): Promise<void> {
  return tauriInvoke<void>("reply_to_session", { id, message });
}

export async function interruptSession(id: string): Promise<void> {
  return tauriInvoke<void>("interrupt_session", { id });
}

export async function killSession(id: string): Promise<void> {
  return tauriInvoke<void>("kill_session", { id });
}

export async function listSessions(): Promise<Session[]> {
  if (!isTauri()) return [];
  return tauriInvoke<Session[]>("list_sessions");
}

export async function getSession(id: string): Promise<Session> {
  return tauriInvoke<Session>("get_session", { id });
}

// ── Worktree commands ────────────────────────────────────────────────────────

export async function createWorktree(params: {
  repoId: string;
  branch: string;
  baseBranch?: string;
}): Promise<string> {
  return tauriInvoke<string>("create_worktree", { params });
}

export async function removeWorktree(worktreePath: string): Promise<void> {
  return tauriInvoke<void>("remove_worktree", { worktreePath });
}

// ── Repo commands ────────────────────────────────────────────────────────────

export async function getGithubToken(): Promise<string | null> {
  if (!isTauri()) return null;
  return tauriInvoke<string | null>("get_github_token");
}

export async function addRepo(githubUrl: string, localPath: string): Promise<Repo> {
  return tauriInvoke<Repo>("add_repo", { githubUrl, localPath });
}

export async function listRepos(): Promise<Repo[]> {
  if (!isTauri()) return [];
  return tauriInvoke<Repo[]>("list_repos");
}

// ── GitHub commands ──────────────────────────────────────────────────────────

export async function fetchIssues(repoId: string): Promise<GitHubIssue[]> {
  if (!isTauri()) return [];
  return tauriInvoke<GitHubIssue[]>("fetch_issues", { repoId });
}

export async function fetchPRs(repoId: string): Promise<GitHubPR[]> {
  if (!isTauri()) return [];
  return tauriInvoke<GitHubPR[]>("fetch_prs", { repoId });
}

// ── Git commands ─────────────────────────────────────────────────────────────

export async function gitCommitAndPush(params: {
  worktreePath: string;
  message: string;
}): Promise<void> {
  return tauriInvoke<void>("git_commit_and_push", { params });
}

export async function createPR(params: {
  repoId: string;
  headBranch: string;
  title: string;
  body?: string;
}): Promise<GitHubPR> {
  return tauriInvoke<GitHubPR>("create_pr", { params });
}

export async function getDiff(worktreePath: string): Promise<string> {
  if (!isTauri()) return "";
  return tauriInvoke<string>("get_diff", { worktreePath });
}

// ── Event listeners ──────────────────────────────────────────────────────────

export type SessionStateChangedPayload = {
  session: Session;
};

export type SessionOutputPayload = {
  sessionId: string;
  line: string;
};

/** Returns a no-op unlisten function when outside Tauri. */
export async function onSessionStateChanged(
  callback: (payload: SessionStateChangedPayload) => void,
): Promise<() => void> {
  if (!isTauri()) return noop;
  return tauriListen("session-state-changed", (event) =>
    callback(event.payload as SessionStateChangedPayload),
  );
}

/** Returns a no-op unlisten function when outside Tauri. */
export async function onSessionOutput(
  callback: (payload: SessionOutputPayload) => void,
): Promise<() => void> {
  if (!isTauri()) return noop;
  return tauriListen("session-output", (event) =>
    callback(event.payload as SessionOutputPayload),
  );
}
