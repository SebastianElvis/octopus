/**
 * Contract tests: verify that frontend tauri.ts invoke calls send parameter
 * names that match the Rust backend command signatures.
 *
 * These tests mock `@tauri-apps/api/core` invoke and assert that the args
 * object passed to invoke contains the expected keys. This catches mismatches
 * that compile independently on each side but fail at runtime.
 */
import { describe, it, expect, beforeEach, vi } from "vitest";

// Every test dynamically imports from tauri.ts, which lazy-imports
// @tauri-apps/api/core. Our mock intercepts that.
let invokedArgs: Record<string, unknown> | undefined;
let invokedCmd: string | undefined;

beforeEach(() => {
  invokedArgs = undefined;
  invokedCmd = undefined;
  vi.restoreAllMocks();

  // Make isTauri() return true for all contract tests
  vi.doMock("../env", () => ({ isTauri: () => true }));

  // Capture invoke calls
  vi.doMock("@tauri-apps/api/core", () => ({
    invoke: vi.fn((cmd: string, args?: Record<string, unknown>) => {
      invokedCmd = cmd;
      invokedArgs = args;
      // Return a minimal valid response for each command
      if (cmd === "spawn_session" || cmd === "get_session" || cmd === "create_session_from_review") {
        return Promise.resolve({
          id: "test-id",
          name: "test",
          status: "running",
          stateChangedAt: "2025-01-01T00:00:00Z",
        });
      }
      if (cmd === "list_sessions") return Promise.resolve([]);
      if (cmd === "create_pr") {
        return Promise.resolve({
          number: 1,
          title: "test",
          state: "open",
          htmlUrl: "",
          headRef: "main",
          baseRef: "main",
          user: "test",
          comments: 0,
          createdAt: "2025-01-01T00:00:00Z",
          updatedAt: "2025-01-01T00:00:00Z",
        });
      }
      return Promise.resolve(undefined);
    }),
  }));
});

describe("tauri.ts ↔ Rust command parameter contracts", () => {
  // ── spawn_session ────────────────────────────────────────────────────
  // Rust: spawn_session(params: SpawnSessionParams)
  // SpawnSessionParams has: repo_id, branch, prompt, name?, issue_number?, pr_number?, force?
  it("spawnSession sends { params } with correct fields", async () => {
    const { spawnSession } = await import("../tauri");
    await spawnSession({
      repoId: "r1",
      branch: "fix/123",
      prompt: "Fix the bug",
      name: "Fix bug",
      issueNumber: 123,
      prNumber: undefined,
      force: true,
    });
    expect(invokedCmd).toBe("spawn_session");
    expect(invokedArgs).toHaveProperty("params");
    const params = invokedArgs!.params as Record<string, unknown>;
    expect(params).toHaveProperty("repoId");
    expect(params).toHaveProperty("branch");
    expect(params).toHaveProperty("prompt");
  });

  // ── reply_to_session ─────────────────────────────────────────────────
  // Rust: reply_to_session(id: String, message: String)
  it("replyToSession sends { id, message }", async () => {
    const { replyToSession } = await import("../tauri");
    await replyToSession("s1", "yes");
    expect(invokedCmd).toBe("reply_to_session");
    expect(invokedArgs).toEqual({ id: "s1", message: "yes" });
  });

  // ── write_to_session ─────────────────────────────────────────────────
  // Rust: write_to_session(id: String, data: String)
  it("writeToSession sends { id, data }", async () => {
    const { writeToSession } = await import("../tauri");
    await writeToSession("s1", "hello");
    expect(invokedCmd).toBe("write_to_session");
    expect(invokedArgs).toEqual({ id: "s1", data: "hello" });
  });

  // ── resize_session ───────────────────────────────────────────────────
  // Rust: resize_session(id: String, rows: u16, cols: u16)
  it("resizeSession sends { id, rows, cols }", async () => {
    const { resizeSession } = await import("../tauri");
    await resizeSession("s1", 24, 80);
    expect(invokedCmd).toBe("resize_session");
    expect(invokedArgs).toEqual({ id: "s1", rows: 24, cols: 80 });
  });

  // ── interrupt_session ────────────────────────────────────────────────
  // Rust: interrupt_session(id: String, message: Option<String>)
  it("interruptSession sends { id, message }", async () => {
    const { interruptSession } = await import("../tauri");
    await interruptSession("s1", "stop that");
    expect(invokedCmd).toBe("interrupt_session");
    expect(invokedArgs).toEqual({ id: "s1", message: "stop that" });
  });

  it("interruptSession sends null message when omitted", async () => {
    const { interruptSession } = await import("../tauri");
    await interruptSession("s1");
    expect(invokedArgs).toEqual({ id: "s1", message: null });
  });

  // ── kill_session ─────────────────────────────────────────────────────
  // Rust: kill_session(id: String)
  it("killSession sends { id }", async () => {
    const { killSession } = await import("../tauri");
    await killSession("s1");
    expect(invokedCmd).toBe("kill_session");
    expect(invokedArgs).toEqual({ id: "s1" });
  });

  // ── git_commit_and_push ──────────────────────────────────────────────
  // Rust: git_commit_and_push(worktree_path: String, commit_message: String)
  // camelCase → worktreePath, commitMessage
  it("gitCommitAndPush sends flat { worktreePath, commitMessage }", async () => {
    const { gitCommitAndPush } = await import("../tauri");
    await gitCommitAndPush({ worktreePath: "/tmp/wt", message: "fix stuff" });
    expect(invokedCmd).toBe("git_commit_and_push");
    expect(invokedArgs).toEqual({ worktreePath: "/tmp/wt", commitMessage: "fix stuff" });
  });

  // ── create_pr ────────────────────────────────────────────────────────
  // Rust: create_pr(repo_id: String, head_branch: String, title: String, body: Option<String>)
  // camelCase → repoId, headBranch, title, body
  it("createPR sends flat { repoId, headBranch, title, body }", async () => {
    const { createPR } = await import("../tauri");
    await createPR({ repoId: "r1", headBranch: "feat/x", title: "Add X", body: "Closes #1" });
    expect(invokedCmd).toBe("create_pr");
    expect(invokedArgs).toEqual({
      repoId: "r1",
      headBranch: "feat/x",
      title: "Add X",
      body: "Closes #1",
    });
  });

  it("createPR sends null body when omitted", async () => {
    const { createPR } = await import("../tauri");
    await createPR({ repoId: "r1", headBranch: "feat/x", title: "Add X" });
    expect(invokedArgs).toHaveProperty("body", null);
  });

  // ── create_session_from_review ───────────────────────────────────────
  // Rust: create_session_from_review(repo_id: String, pr_number: u64, comment_ids: Vec<i64>)
  it("createSessionFromReview sends flat { repoId, prNumber, commentIds }", async () => {
    const { createSessionFromReview } = await import("../tauri");
    await createSessionFromReview({ repoId: "r1", prNumber: 42, commentIds: [1, 2, 3] });
    expect(invokedCmd).toBe("create_session_from_review");
    expect(invokedArgs).toEqual({ repoId: "r1", prNumber: 42, commentIds: [1, 2, 3] });
  });

  // ── remove_worktree ──────────────────────────────────────────────────
  // Rust: remove_worktree(repo_local_path: String, worktree_path: String, branch: String)
  it("removeWorktree sends flat { repoLocalPath, worktreePath, branch }", async () => {
    const { removeWorktree } = await import("../tauri");
    await removeWorktree("/repos/foo", "/tmp/wt", "feature-branch");
    expect(invokedCmd).toBe("remove_worktree");
    expect(invokedArgs).toEqual({
      repoLocalPath: "/repos/foo",
      worktreePath: "/tmp/wt",
      branch: "feature-branch",
    });
  });

  // ── create_worktree ──────────────────────────────────────────────────
  // Rust: create_worktree(repo_local_path: String, branch: String, session_id: String, force: Option<bool>)
  it("createWorktree sends flat { repoLocalPath, branch, sessionId, force }", async () => {
    const { createWorktree } = await import("../tauri");
    await createWorktree({
      repoLocalPath: "/repos/foo",
      branch: "feat/x",
      sessionId: "s1",
      force: true,
    });
    expect(invokedCmd).toBe("create_worktree");
    expect(invokedArgs).toEqual({
      repoLocalPath: "/repos/foo",
      branch: "feat/x",
      sessionId: "s1",
      force: true,
    });
  });

  // ── fetch_issues ─────────────────────────────────────────────────────
  // Rust: fetch_issues(repo_id: String)
  it("fetchIssues sends { repoId }", async () => {
    const { fetchIssues } = await import("../tauri");
    await fetchIssues("r1");
    expect(invokedCmd).toBe("fetch_issues");
    expect(invokedArgs).toEqual({ repoId: "r1" });
  });

  // ── fetch_prs ────────────────────────────────────────────────────────
  // Rust: fetch_prs(repo_id: String)
  it("fetchPRs sends { repoId }", async () => {
    const { fetchPRs } = await import("../tauri");
    await fetchPRs("r1");
    expect(invokedCmd).toBe("fetch_prs");
    expect(invokedArgs).toEqual({ repoId: "r1" });
  });

  // ── fetch_pr_review_comments ─────────────────────────────────────────
  // Rust: fetch_pr_review_comments(repo_id: String, pr_number: u64)
  it("fetchPrReviewComments sends { repoId, prNumber }", async () => {
    const { fetchPrReviewComments } = await import("../tauri");
    await fetchPrReviewComments("r1", 42);
    expect(invokedCmd).toBe("fetch_pr_review_comments");
    expect(invokedArgs).toEqual({ repoId: "r1", prNumber: 42 });
  });

  // ── add_repo ─────────────────────────────────────────────────────────
  // Rust: add_repo(github_url: String, local_path: Option<String>)
  it("addRepo sends { githubUrl, localPath }", async () => {
    const { addRepo } = await import("../tauri");
    await addRepo("https://github.com/owner/repo", "/local/path");
    expect(invokedCmd).toBe("add_repo");
    expect(invokedArgs).toEqual({
      githubUrl: "https://github.com/owner/repo",
      localPath: "/local/path",
    });
  });

  // ── get_diff ─────────────────────────────────────────────────────────
  // Rust: get_diff(worktree_path: String)
  it("getDiff sends { worktreePath }", async () => {
    const { getDiff } = await import("../tauri");
    await getDiff("/tmp/wt");
    expect(invokedCmd).toBe("get_diff");
    expect(invokedArgs).toEqual({ worktreePath: "/tmp/wt" });
  });
});
