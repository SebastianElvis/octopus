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
      if (
        cmd === "spawn_session" ||
        cmd === "get_session" ||
        cmd === "create_session_from_review"
      ) {
        return Promise.resolve({
          id: "test-id",
          name: "test",
          status: "running",
          stateChangedAt: "2025-01-01T00:00:00Z",
        });
      }
      if (cmd === "list_sessions") return Promise.resolve([]);
      if (cmd === "add_repo") {
        return Promise.resolve({
          id: "test-id",
          githubUrl: "https://github.com/a/b",
          localPath: "/tmp/repo",
          defaultBranch: "main",
          addedAt: "2025-01-01T00:00:00Z",
        });
      }
      if (cmd === "check_prerequisites") {
        return Promise.resolve({ claude: true, git: true, gh: true });
      }
      if (cmd === "get_setting") return Promise.resolve(null);
      if (cmd === "get_changed_files") return Promise.resolve([]);
      if (cmd === "list_dir") return Promise.resolve([]);
      if (cmd === "read_file") return Promise.resolve("");
      if (cmd === "get_diff" || cmd === "get_file_diff" || cmd === "get_file_at_head")
        return Promise.resolve("");
      if (cmd === "fetch_check_runs") return Promise.resolve([]);
      if (cmd === "check_stuck_sessions") return Promise.resolve([]);
      if (cmd === "read_session_log") return Promise.resolve("");
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
    expect(invokedArgs).toBeDefined();
    const params = invokedArgs?.params as Record<string, unknown>;
    expect(params).toHaveProperty("repoId");
    expect(params).toHaveProperty("branch");
    expect(params).toHaveProperty("prompt");
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

  // ── list_sessions ──────────────────────────────────────────────────
  // Rust: list_sessions() — no params
  it("listSessions sends no args", async () => {
    const { listSessions } = await import("../tauri");
    await listSessions();
    expect(invokedCmd).toBe("list_sessions");
    expect(invokedArgs).toBeUndefined();
  });

  // ── get_session ────────────────────────────────────────────────────
  // Rust: get_session(id: String)
  it("getSession sends { id }", async () => {
    const { getSession } = await import("../tauri");
    await getSession("s1");
    expect(invokedCmd).toBe("get_session");
    expect(invokedArgs).toEqual({ id: "s1" });
  });

  // ── pause_session ──────────────────────────────────────────────────
  // Rust: pause_session(id: String)
  it("pauseSession sends { id }", async () => {
    const { pauseSession } = await import("../tauri");
    await pauseSession("s1");
    expect(invokedCmd).toBe("pause_session");
    expect(invokedArgs).toEqual({ id: "s1" });
  });

  // ── resume_session ─────────────────────────────────────────────────
  // Rust: resume_session(id: String)
  it("resumeSession sends { id }", async () => {
    const { resumeSession } = await import("../tauri");
    await resumeSession("s1");
    expect(invokedCmd).toBe("resume_session");
    expect(invokedArgs).toEqual({ id: "s1" });
  });

  // ── check_stuck_sessions ───────────────────────────────────────────
  // Rust: check_stuck_sessions() — no params
  it("checkStuckSessions sends no args", async () => {
    const { checkStuckSessions } = await import("../tauri");
    await checkStuckSessions();
    expect(invokedCmd).toBe("check_stuck_sessions");
    expect(invokedArgs).toBeUndefined();
  });

  // ── read_session_log ───────────────────────────────────────────────
  // Rust: read_session_log(id: String)
  it("readSessionLog sends { id }", async () => {
    const { readSessionLog } = await import("../tauri");
    await readSessionLog("s1");
    expect(invokedCmd).toBe("read_session_log");
    expect(invokedArgs).toEqual({ id: "s1" });
  });

  // ── retry_session ──────────────────────────────────────────────────
  // Frontend retrySession delegates to resume_session
  it("retrySession sends { id } via resume_session", async () => {
    const { retrySession } = await import("../tauri");
    await retrySession("s1");
    expect(invokedCmd).toBe("resume_session");
    expect(invokedArgs).toEqual({ id: "s1" });
  });

  // ── remove_repo ────────────────────────────────────────────────────
  // Rust: remove_repo(id: String)
  it("removeRepo sends { id }", async () => {
    const { removeRepo } = await import("../tauri");
    await removeRepo("r1");
    expect(invokedCmd).toBe("remove_repo");
    expect(invokedArgs).toEqual({ id: "r1" });
  });

  // ── list_repos ─────────────────────────────────────────────────────
  // Rust: list_repos() — no params
  it("listRepos sends no args", async () => {
    const { listRepos } = await import("../tauri");
    await listRepos();
    expect(invokedCmd).toBe("list_repos");
    expect(invokedArgs).toBeUndefined();
  });

  // ── fetch_check_runs ───────────────────────────────────────────────
  // Rust: fetch_check_runs(repo_id: String, git_ref: String)
  it("fetchCheckRuns sends { repoId, gitRef }", async () => {
    const { fetchCheckRuns } = await import("../tauri");
    await fetchCheckRuns("r1", "abc123");
    expect(invokedCmd).toBe("fetch_check_runs");
    expect(invokedArgs).toEqual({ repoId: "r1", gitRef: "abc123" });
  });

  // ── merge_pr ───────────────────────────────────────────────────────
  // Rust: merge_pr(repo_id: String, pr_number: u64, merge_method: String)
  it("mergePR sends { repoId, prNumber, mergeMethod }", async () => {
    const { mergePR } = await import("../tauri");
    await mergePR({ repoId: "r1", prNumber: 42, mergeMethod: "squash" });
    expect(invokedCmd).toBe("merge_pr");
    expect(invokedArgs).toEqual({ repoId: "r1", prNumber: 42, mergeMethod: "squash" });
  });

  // ── delete_remote_branch ───────────────────────────────────────────
  // Rust: delete_remote_branch(repo_id: String, branch: String)
  it("deleteRemoteBranch sends { repoId, branch }", async () => {
    const { deleteRemoteBranch } = await import("../tauri");
    await deleteRemoteBranch("r1", "feat/old");
    expect(invokedCmd).toBe("delete_remote_branch");
    expect(invokedArgs).toEqual({ repoId: "r1", branch: "feat/old" });
  });

  // ── close_issue ────────────────────────────────────────────────────
  // Rust: close_issue(repo_id: String, issue_number: u64)
  it("closeIssue sends { repoId, issueNumber }", async () => {
    const { closeIssue } = await import("../tauri");
    await closeIssue("r1", 99);
    expect(invokedCmd).toBe("close_issue");
    expect(invokedArgs).toEqual({ repoId: "r1", issueNumber: 99 });
  });

  // ── git_commit ─────────────────────────────────────────────────────
  // Rust: git_commit(worktree_path: String, commit_message: String)
  it("gitCommit sends { worktreePath, commitMessage }", async () => {
    const { gitCommit } = await import("../tauri");
    await gitCommit("/tmp/wt", "Initial commit");
    expect(invokedCmd).toBe("git_commit");
    expect(invokedArgs).toEqual({ worktreePath: "/tmp/wt", commitMessage: "Initial commit" });
  });

  // ── git_push ───────────────────────────────────────────────────────
  // Rust: git_push(worktree_path: String)
  it("gitPush sends { worktreePath }", async () => {
    const { gitPush } = await import("../tauri");
    await gitPush("/tmp/wt");
    expect(invokedCmd).toBe("git_push");
    expect(invokedArgs).toEqual({ worktreePath: "/tmp/wt" });
  });

  // ── list_dir ───────────────────────────────────────────────────────
  // Rust: list_dir(path: String)
  it("listDir sends { path }", async () => {
    const { listDir } = await import("../tauri");
    await listDir("/tmp/project");
    expect(invokedCmd).toBe("list_dir");
    expect(invokedArgs).toEqual({ path: "/tmp/project" });
  });

  // ── read_file ──────────────────────────────────────────────────────
  // Rust: read_file(path: String)
  it("readFile sends { path }", async () => {
    const { readFile } = await import("../tauri");
    await readFile("/tmp/file.txt");
    expect(invokedCmd).toBe("read_file");
    expect(invokedArgs).toEqual({ path: "/tmp/file.txt" });
  });

  // ── get_changed_files ──────────────────────────────────────────────
  // Rust: get_changed_files(worktree_path: String)
  it("getChangedFiles sends { worktreePath }", async () => {
    const { getChangedFiles } = await import("../tauri");
    await getChangedFiles("/tmp/wt");
    expect(invokedCmd).toBe("get_changed_files");
    expect(invokedArgs).toEqual({ worktreePath: "/tmp/wt" });
  });

  // ── git_stage_files ────────────────────────────────────────────────
  // Rust: git_stage_files(worktree_path: String, paths: Vec<String>)
  it("gitStageFiles sends { worktreePath, paths }", async () => {
    const { gitStageFiles } = await import("../tauri");
    await gitStageFiles("/tmp/wt", ["a.ts", "b.ts"]);
    expect(invokedCmd).toBe("git_stage_files");
    expect(invokedArgs).toEqual({ worktreePath: "/tmp/wt", paths: ["a.ts", "b.ts"] });
  });

  // ── git_unstage_files ──────────────────────────────────────────────
  // Rust: git_unstage_files(worktree_path: String, paths: Vec<String>)
  it("gitUnstageFiles sends { worktreePath, paths }", async () => {
    const { gitUnstageFiles } = await import("../tauri");
    await gitUnstageFiles("/tmp/wt", ["a.ts"]);
    expect(invokedCmd).toBe("git_unstage_files");
    expect(invokedArgs).toEqual({ worktreePath: "/tmp/wt", paths: ["a.ts"] });
  });

  // ── git_discard_files ──────────────────────────────────────────────
  // Rust: git_discard_files(worktree_path: String, paths: Vec<String>)
  it("gitDiscardFiles sends { worktreePath, paths }", async () => {
    const { gitDiscardFiles } = await import("../tauri");
    await gitDiscardFiles("/tmp/wt", ["a.ts"]);
    expect(invokedCmd).toBe("git_discard_files");
    expect(invokedArgs).toEqual({ worktreePath: "/tmp/wt", paths: ["a.ts"] });
  });

  // ── get_file_diff ──────────────────────────────────────────────────
  // Rust: get_file_diff(worktree_path: String, file_path: String, staged: bool)
  it("getFileDiff sends { worktreePath, filePath, staged }", async () => {
    const { getFileDiff } = await import("../tauri");
    await getFileDiff("/tmp/wt", "src/main.ts", true);
    expect(invokedCmd).toBe("get_file_diff");
    expect(invokedArgs).toEqual({ worktreePath: "/tmp/wt", filePath: "src/main.ts", staged: true });
  });

  // ── get_file_at_head ───────────────────────────────────────────────
  // Rust: get_file_at_head(worktree_path: String, file_path: String)
  it("getFileAtHead sends { worktreePath, filePath }", async () => {
    const { getFileAtHead } = await import("../tauri");
    await getFileAtHead("/tmp/wt", "src/main.ts");
    expect(invokedCmd).toBe("get_file_at_head");
    expect(invokedArgs).toEqual({ worktreePath: "/tmp/wt", filePath: "src/main.ts" });
  });

  // ── get_setting ────────────────────────────────────────────────────
  // Rust: get_setting(key: String)
  it("getSetting sends { key }", async () => {
    const { getSetting } = await import("../tauri");
    await getSetting("api_key");
    expect(invokedCmd).toBe("get_setting");
    expect(invokedArgs).toEqual({ key: "api_key" });
  });

  // ── set_setting ────────────────────────────────────────────────────
  // Rust: set_setting(key: String, value: String)
  it("setSetting sends { key, value }", async () => {
    const { setSetting } = await import("../tauri");
    await setSetting("api_key", "sk-123");
    expect(invokedCmd).toBe("set_setting");
    expect(invokedArgs).toEqual({ key: "api_key", value: "sk-123" });
  });

  // ── check_prerequisites ────────────────────────────────────────────
  // Rust: check_prerequisites() — no params
  it("checkPrerequisites sends no args", async () => {
    const { checkPrerequisites } = await import("../tauri");
    await checkPrerequisites();
    expect(invokedCmd).toBe("check_prerequisites");
    expect(invokedArgs).toBeUndefined();
  });

  // ── spawn_shell ────────────────────────────────────────────────────
  // Rust: spawn_shell(cwd: String)
  it("spawnShell sends { cwd }", async () => {
    const { spawnShell } = await import("../tauri");
    await spawnShell("/tmp/project");
    expect(invokedCmd).toBe("spawn_shell");
    expect(invokedArgs).toEqual({ cwd: "/tmp/project" });
  });

  // ── write_to_shell ─────────────────────────────────────────────────
  // Rust: write_to_shell(shell_id: String, data: String)
  it("writeToShell sends { shellId, data }", async () => {
    const { writeToShell } = await import("../tauri");
    await writeToShell("sh1", "ls -la\n");
    expect(invokedCmd).toBe("write_to_shell");
    expect(invokedArgs).toEqual({ shellId: "sh1", data: "ls -la\n" });
  });

  // ── resize_shell ───────────────────────────────────────────────────
  // Rust: resize_shell(shell_id: String, rows: u16, cols: u16)
  it("resizeShell sends { shellId, rows, cols }", async () => {
    const { resizeShell } = await import("../tauri");
    await resizeShell("sh1", 24, 80);
    expect(invokedCmd).toBe("resize_shell");
    expect(invokedArgs).toEqual({ shellId: "sh1", rows: 24, cols: 80 });
  });

  // ── kill_shell ─────────────────────────────────────────────────────
  // Rust: kill_shell(shell_id: String)
  it("killShell sends { shellId }", async () => {
    const { killShell } = await import("../tauri");
    await killShell("sh1");
    expect(invokedCmd).toBe("kill_shell");
    expect(invokedArgs).toEqual({ shellId: "sh1" });
  });
});
