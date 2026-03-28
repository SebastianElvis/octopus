/**
 * Tauri backend bridge.
 *
 * Every function guards on `isTauri()` so the frontend can run standalone
 * in a plain browser for development (`pnpm dev` without `tauri dev`).
 * When outside Tauri, commands return sensible defaults and event listeners
 * are silently skipped.
 */

import { isTauri } from "./env";
import type {
  Session,
  BackendSession,
  Repo,
  GitHubIssue,
  GitHubPR,
  ReviewComment,
  FileEntry,
  ChangedFile,
  CheckRun,
  ClaudeStreamEvent,
} from "./types";
import { mapBackendSession } from "./types";

/** No-op unlisten stub for when Tauri is not available. */
// eslint-disable-next-line @typescript-eslint/no-empty-function
const noop = (): void => {};

/** Throw a clear error when a command requires Tauri but we're in browser-only mode. */
function requireTauri(cmd: string): void {
  if (!isTauri()) {
    throw new Error(`"${cmd}" requires the Tauri backend. Run with \`pnpm tauri dev\`.`);
  }
}

// Lazy imports — `@tauri-apps/api` throws at import time when __TAURI_INTERNALS__
// is missing, so we dynamic-import only when we know we're inside Tauri.
async function tauriInvoke<T>(
  cmd: string,
  args?: Record<string, unknown>,
  timeoutMs = 30000,
): Promise<T> {
  const { invoke } = await import("@tauri-apps/api/core");
  const result = await Promise.race([
    invoke<T>(cmd, args),
    new Promise<never>((_, reject) =>
      setTimeout(
        () => reject(new Error(`Command "${cmd}" timed out after ${timeoutMs}ms`)),
        timeoutMs,
      ),
    ),
  ]);
  return result;
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
  force?: boolean;
  dangerouslySkipPermissions?: boolean;
}): Promise<Session> {
  requireTauri("spawn_session");
  const raw = await tauriInvoke<BackendSession>("spawn_session", { params });
  return mapBackendSession(raw);
}

export async function writeToSession(id: string, data: string): Promise<void> {
  requireTauri("write_to_session");
  return tauriInvoke<void>("write_to_session", { id, data });
}

export async function resizeSession(id: string, rows: number, cols: number): Promise<void> {
  requireTauri("resize_session");
  return tauriInvoke<void>("resize_session", { id, rows, cols });
}

export async function interruptSession(id: string, message?: string): Promise<void> {
  requireTauri("interrupt_session");
  return tauriInvoke<void>("interrupt_session", { id, message: message ?? null });
}

export async function killSession(id: string): Promise<void> {
  requireTauri("kill_session");
  return tauriInvoke<void>("kill_session", { id });
}

export async function listSessions(): Promise<Session[]> {
  if (!isTauri()) return [];
  const raw = await tauriInvoke<BackendSession[]>("list_sessions");
  return raw.map(mapBackendSession);
}

export async function getSession(id: string): Promise<Session> {
  requireTauri("get_session");
  const raw = await tauriInvoke<BackendSession>("get_session", { id });
  return mapBackendSession(raw);
}

export async function pauseSession(id: string): Promise<void> {
  requireTauri("pause_session");
  return tauriInvoke<void>("pause_session", { id });
}

export async function resumeSession(id: string): Promise<void> {
  requireTauri("resume_session");
  return tauriInvoke<void>("resume_session", { id });
}

export async function checkStuckSessions(): Promise<string[]> {
  if (!isTauri()) return [];
  return tauriInvoke<string[]>("check_stuck_sessions");
}

export async function readSessionLog(id: string): Promise<string> {
  if (!isTauri()) return "";
  return tauriInvoke<string>("read_session_log", { id });
}

export async function readSessionEvents(id: string): Promise<ClaudeStreamEvent[]> {
  if (!isTauri()) return [];
  return tauriInvoke<ClaudeStreamEvent[]>("read_session_events", { id });
}

export async function retrySession(sessionId: string): Promise<void> {
  requireTauri("resume_session");
  return tauriInvoke<void>("resume_session", { id: sessionId });
}

export async function fetchPrReviewComments(
  repoId: string,
  prNumber: number,
): Promise<ReviewComment[]> {
  if (!isTauri()) return [];
  return tauriInvoke<ReviewComment[]>("fetch_pr_review_comments", { repoId, prNumber });
}

export async function createSessionFromReview(params: {
  repoId: string;
  prNumber: number;
  commentIds: number[];
}): Promise<Session> {
  requireTauri("create_session_from_review");
  const raw = await tauriInvoke<BackendSession>("create_session_from_review", {
    repoId: params.repoId,
    prNumber: params.prNumber,
    commentIds: params.commentIds,
  });
  return mapBackendSession(raw);
}

// ── Worktree commands ────────────────────────────────────────────────────────

export async function createWorktree(params: {
  repoLocalPath: string;
  branch: string;
  sessionId: string;
  force?: boolean;
}): Promise<string> {
  requireTauri("create_worktree");
  return tauriInvoke<string>("create_worktree", {
    repoLocalPath: params.repoLocalPath,
    branch: params.branch,
    sessionId: params.sessionId,
    force: params.force ?? null,
  });
}

export async function removeWorktree(
  repoLocalPath: string,
  worktreePath: string,
  branch: string,
): Promise<void> {
  requireTauri("remove_worktree");
  return tauriInvoke<void>("remove_worktree", { repoLocalPath, worktreePath, branch });
}

// ── Repo commands ────────────────────────────────────────────────────────────

export async function getGithubToken(): Promise<string | null> {
  if (!isTauri()) return null;
  return tauriInvoke<string | null>("get_github_token");
}

export async function addRepo(githubUrl: string, localPath?: string): Promise<Repo> {
  requireTauri("add_repo");
  return tauriInvoke<Repo>("add_repo", { githubUrl, localPath: localPath ?? null });
}

export async function removeRepo(id: string): Promise<void> {
  requireTauri("remove_repo");
  return tauriInvoke<void>("remove_repo", { id });
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

export async function fetchCheckRuns(repoId: string, gitRef: string): Promise<CheckRun[]> {
  if (!isTauri()) return [];
  return tauriInvoke<CheckRun[]>("fetch_check_runs", { repoId, gitRef });
}

export async function mergePR(params: {
  repoId: string;
  prNumber: number;
  mergeMethod: "merge" | "squash" | "rebase";
}): Promise<void> {
  requireTauri("merge_pr");
  return tauriInvoke<void>("merge_pr", params);
}

export async function deleteRemoteBranch(repoId: string, branch: string): Promise<void> {
  requireTauri("delete_remote_branch");
  return tauriInvoke<void>("delete_remote_branch", { repoId, branch });
}

export async function closeIssue(repoId: string, issueNumber: number): Promise<void> {
  requireTauri("close_issue");
  return tauriInvoke<void>("close_issue", { repoId, issueNumber });
}

// ── Git commands ─────────────────────────────────────────────────────────────

export async function gitCommitAndPush(params: {
  worktreePath: string;
  message: string;
}): Promise<void> {
  requireTauri("git_commit_and_push");
  return tauriInvoke<void>("git_commit_and_push", {
    worktreePath: params.worktreePath,
    commitMessage: params.message,
  });
}

export async function gitCommit(worktreePath: string, message: string): Promise<void> {
  requireTauri("git_commit");
  return tauriInvoke<void>("git_commit", { worktreePath, commitMessage: message });
}

export async function gitPush(worktreePath: string): Promise<void> {
  requireTauri("git_push");
  return tauriInvoke<void>("git_push", { worktreePath });
}

export async function createPR(params: {
  repoId: string;
  headBranch: string;
  title: string;
  body?: string;
}): Promise<GitHubPR> {
  requireTauri("create_pr");
  return tauriInvoke<GitHubPR>("create_pr", {
    repoId: params.repoId,
    headBranch: params.headBranch,
    title: params.title,
    body: params.body ?? null,
  });
}

export async function getDiff(worktreePath: string): Promise<string> {
  if (!isTauri()) return "";
  return tauriInvoke<string>("get_diff", { worktreePath });
}

// ── Filesystem commands ──────────────────────────────────────────────────────

export async function listDir(path: string): Promise<FileEntry[]> {
  if (!isTauri()) return [];
  return tauriInvoke<FileEntry[]>("list_dir", { path });
}

export async function readFile(path: string): Promise<string> {
  if (!isTauri()) return "";
  return tauriInvoke<string>("read_file", { path });
}

export interface DiscoveredCommand {
  command: string;
  description: string;
  source: string;
}

export async function scanSlashCommands(worktreePath?: string): Promise<DiscoveredCommand[]> {
  if (!isTauri()) return [];
  return tauriInvoke<DiscoveredCommand[]>("scan_slash_commands", {
    worktreePath: worktreePath ?? null,
  });
}

// ── Git operations ──────────────────────────────────────────────────────────

export async function getChangedFiles(worktreePath: string): Promise<ChangedFile[]> {
  if (!isTauri()) return [];
  return tauriInvoke<ChangedFile[]>("get_changed_files", { worktreePath });
}

export async function gitStageFiles(worktreePath: string, paths: string[]): Promise<void> {
  requireTauri("git_stage_files");
  return tauriInvoke<void>("git_stage_files", { worktreePath, paths });
}

export async function gitUnstageFiles(worktreePath: string, paths: string[]): Promise<void> {
  requireTauri("git_unstage_files");
  return tauriInvoke<void>("git_unstage_files", { worktreePath, paths });
}

export async function gitDiscardFiles(worktreePath: string, paths: string[]): Promise<void> {
  requireTauri("git_discard_files");
  return tauriInvoke<void>("git_discard_files", { worktreePath, paths });
}

export async function getFileDiff(
  worktreePath: string,
  filePath: string,
  staged: boolean,
): Promise<string> {
  if (!isTauri()) return "";
  return tauriInvoke<string>("get_file_diff", { worktreePath, filePath, staged });
}

export async function getFileAtHead(worktreePath: string, filePath: string): Promise<string> {
  if (!isTauri()) return "";
  return tauriInvoke<string>("get_file_at_head", { worktreePath, filePath });
}

// ── Settings commands ────────────────────────────────────────────────────────

export async function getSetting(key: string): Promise<string | null> {
  if (!isTauri()) return null;
  return tauriInvoke<string | null>("get_setting", { key });
}

export async function setSetting(key: string, value: string): Promise<void> {
  requireTauri("set_setting");
  return tauriInvoke<void>("set_setting", { key, value });
}

// ── Prerequisites commands ───────────────────────────────────────────────────

export type PrerequisiteStatus = {
  claude: boolean;
  git: boolean;
  gh: boolean;
};

export async function checkPrerequisites(): Promise<PrerequisiteStatus> {
  if (!isTauri()) return { claude: true, git: true, gh: true };
  return tauriInvoke<PrerequisiteStatus>("check_prerequisites");
}

// ── Shell commands (plain shell PTY, not Claude sessions) ────────────────────

export async function spawnShell(cwd: string): Promise<string> {
  requireTauri("spawn_shell");
  return tauriInvoke<string>("spawn_shell", { cwd });
}

export async function writeToShell(shellId: string, data: string): Promise<void> {
  requireTauri("write_to_shell");
  return tauriInvoke<void>("write_to_shell", { shellId, data });
}

export async function resizeShell(shellId: string, rows: number, cols: number): Promise<void> {
  requireTauri("resize_shell");
  return tauriInvoke<void>("resize_shell", { shellId, rows, cols });
}

export async function killShell(shellId: string): Promise<void> {
  requireTauri("kill_shell");
  return tauriInvoke<void>("kill_shell", { shellId });
}

export type ShellOutputPayload = {
  shellId: string;
  data: string;
};

export async function onShellOutput(
  callback: (payload: ShellOutputPayload) => void,
): Promise<() => void> {
  if (!isTauri()) return noop;
  return tauriListen("shell-output", (event) => callback(event.payload as ShellOutputPayload));
}

// ── Event listeners ──────────────────────────────────────────────────────────

export type SessionStateChangedPayload = {
  session: Session;
};

type BackendSessionStateChangedPayload = {
  session: BackendSession;
};

export type SessionOutputPayload = {
  sessionId: string;
  data: string;
};

export type SessionStructuredPayload = {
  sessionId: string;
  event: ClaudeStreamEvent;
};

/** Returns a no-op unlisten function when outside Tauri. */
export async function onSessionStateChanged(
  callback: (payload: SessionStateChangedPayload) => void,
): Promise<() => void> {
  if (!isTauri()) return noop;
  return tauriListen("session-state-changed", (event) => {
    const raw = event.payload as BackendSessionStateChangedPayload;
    callback({ session: mapBackendSession(raw.session) });
  });
}

/** Returns a no-op unlisten function when outside Tauri. */
export async function onSessionOutput(
  callback: (payload: SessionOutputPayload) => void,
): Promise<() => void> {
  if (!isTauri()) return noop;
  return tauriListen("session-output", (event) => callback(event.payload as SessionOutputPayload));
}

/** Returns a no-op unlisten function when outside Tauri. */
export async function onSessionStructuredOutput(
  callback: (payload: SessionStructuredPayload) => void,
): Promise<() => void> {
  if (!isTauri()) return noop;
  return tauriListen("session-structured-output", (event) =>
    callback(event.payload as SessionStructuredPayload),
  );
}

export async function respondToSession(id: string, response: string): Promise<void> {
  requireTauri("respond_to_session");
  return tauriInvoke<void>("respond_to_session", { id, response });
}

export async function sendFollowup(id: string, prompt: string): Promise<void> {
  requireTauri("send_followup");
  return tauriInvoke<void>("send_followup", { id, prompt });
}

// ---------------------------------------------------------------------------
// Hook events
// ---------------------------------------------------------------------------

export async function respondToHook(
  requestId: string,
  decision: "allow" | "deny",
  reason?: string,
): Promise<void> {
  requireTauri("respond_to_hook");
  return tauriInvoke<void>("respond_to_hook", { requestId, decision, reason });
}

export async function getSessionAnalytics(
  sessionId: string,
): Promise<import("./types").SessionAnalytics | null> {
  if (!isTauri()) return null;
  return tauriInvoke<import("./types").SessionAnalytics | null>("get_session_analytics", {
    sessionId,
  });
}

export async function onHookEvent(
  callback: (payload: import("./types").HookEventPayload) => void,
): Promise<() => void> {
  if (!isTauri()) return noop;
  return tauriListen("hook-event", (event) =>
    callback(event.payload as import("./types").HookEventPayload),
  );
}

export async function onHookPermissionRequest(
  callback: (payload: import("./types").HookEventPayload) => void,
): Promise<() => void> {
  if (!isTauri()) return noop;
  return tauriListen("hook-permission-request", (event) =>
    callback(event.payload as import("./types").HookEventPayload),
  );
}
