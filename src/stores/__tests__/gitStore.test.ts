import { useGitStore } from "../gitStore";

vi.mock("../../lib/tauri", () => ({
  getChangedFiles: vi.fn(() => Promise.resolve([])),
  gitStageFiles: vi.fn(() => Promise.resolve()),
  gitUnstageFiles: vi.fn(() => Promise.resolve()),
  gitDiscardFiles: vi.fn(() => Promise.resolve()),
  getFileDiff: vi.fn(() => Promise.resolve("diff content")),
  gitCommitAndPush: vi.fn(() => Promise.resolve()),
  gitCommit: vi.fn(() => Promise.resolve()),
  gitPush: vi.fn(() => Promise.resolve()),
}));

function resetStore() {
  useGitStore.setState({
    worktreePath: null,
    changedFiles: [],
    selectedFile: null,
    selectedFileDiff: null,
    selectedFileStaged: false,
    loading: false,
    commitMessage: "",
    pushing: false,
    error: null,
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  resetStore();
});

describe("gitStore", () => {
  it("has correct initial state", () => {
    const state = useGitStore.getState();
    expect(state.worktreePath).toBeNull();
    expect(state.changedFiles).toEqual([]);
    expect(state.loading).toBe(false);
    expect(state.commitMessage).toBe("");
    expect(state.pushing).toBe(false);
    expect(state.error).toBeNull();
  });

  it("setWorktreePath resets state and triggers refreshChanges", async () => {
    const { getChangedFiles } = await import("../../lib/tauri");
    vi.mocked(getChangedFiles).mockResolvedValueOnce([
      { path: "a.ts", status: "modified", staged: false, oldPath: null, insertions: null, deletions: null },
    ]);

    useGitStore.getState().setWorktreePath("/tmp/wt");
    // Wait for async refreshChanges
    await vi.waitFor(() => expect(useGitStore.getState().changedFiles).toHaveLength(1));
    expect(useGitStore.getState().worktreePath).toBe("/tmp/wt");
  });

  it("setWorktreePath to null does not trigger refresh", () => {
    useGitStore.getState().setWorktreePath(null);
    expect(useGitStore.getState().worktreePath).toBeNull();
  });

  it("refreshChanges does nothing without worktreePath", async () => {
    await useGitStore.getState().refreshChanges();
    expect(useGitStore.getState().loading).toBe(false);
  });

  it("refreshChanges sets error on failure", async () => {
    const { getChangedFiles } = await import("../../lib/tauri");
    vi.mocked(getChangedFiles).mockRejectedValueOnce(new Error("git error"));
    const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    useGitStore.setState({ worktreePath: "/tmp/wt" });
    await useGitStore.getState().refreshChanges();
    expect(useGitStore.getState().error).toContain("git error");
    consoleSpy.mockRestore();
  });

  it("stageFiles calls gitStageFiles and refreshes", async () => {
    const { gitStageFiles, getChangedFiles } = await import("../../lib/tauri");
    useGitStore.setState({ worktreePath: "/tmp/wt" });
    await useGitStore.getState().stageFiles(["a.ts"]);
    expect(gitStageFiles).toHaveBeenCalledWith("/tmp/wt", ["a.ts"]);
    expect(getChangedFiles).toHaveBeenCalled();
  });

  it("stageFiles does nothing without worktreePath", async () => {
    const { gitStageFiles } = await import("../../lib/tauri");
    await useGitStore.getState().stageFiles(["a.ts"]);
    expect(gitStageFiles).not.toHaveBeenCalled();
  });

  it("unstageFiles calls gitUnstageFiles", async () => {
    const { gitUnstageFiles } = await import("../../lib/tauri");
    useGitStore.setState({ worktreePath: "/tmp/wt" });
    await useGitStore.getState().unstageFiles(["a.ts"]);
    expect(gitUnstageFiles).toHaveBeenCalledWith("/tmp/wt", ["a.ts"]);
  });

  it("discardFiles calls gitDiscardFiles", async () => {
    const { gitDiscardFiles } = await import("../../lib/tauri");
    useGitStore.setState({ worktreePath: "/tmp/wt" });
    await useGitStore.getState().discardFiles(["a.ts"]);
    expect(gitDiscardFiles).toHaveBeenCalledWith("/tmp/wt", ["a.ts"]);
  });

  it("selectFile loads diff content", async () => {
    const { getFileDiff } = await import("../../lib/tauri");
    useGitStore.setState({ worktreePath: "/tmp/wt" });
    await useGitStore.getState().selectFile("a.ts", true);
    expect(getFileDiff).toHaveBeenCalledWith("/tmp/wt", "a.ts", true);
    expect(useGitStore.getState().selectedFile).toBe("a.ts");
    expect(useGitStore.getState().selectedFileStaged).toBe(true);
    expect(useGitStore.getState().selectedFileDiff).toBe("diff content");
  });

  it("selectFile handles diff failure", async () => {
    const { getFileDiff } = await import("../../lib/tauri");
    vi.mocked(getFileDiff).mockRejectedValueOnce(new Error("diff fail"));
    const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    useGitStore.setState({ worktreePath: "/tmp/wt" });
    await useGitStore.getState().selectFile("a.ts", false);
    expect(useGitStore.getState().selectedFileDiff).toBeNull();
    consoleSpy.mockRestore();
  });

  it("clearSelection resets selected file state", () => {
    useGitStore.setState({
      selectedFile: "a.ts",
      selectedFileDiff: "diff",
    });
    useGitStore.getState().clearSelection();
    expect(useGitStore.getState().selectedFile).toBeNull();
    expect(useGitStore.getState().selectedFileDiff).toBeNull();
  });

  it("setCommitMessage updates message", () => {
    useGitStore.getState().setCommitMessage("fix: something");
    expect(useGitStore.getState().commitMessage).toBe("fix: something");
  });

  it("commitAndPush calls gitCommitAndPush and clears message", async () => {
    const { gitCommitAndPush } = await import("../../lib/tauri");
    useGitStore.setState({
      worktreePath: "/tmp/wt",
      commitMessage: "fix bug",
    });
    await useGitStore.getState().commitAndPush();
    expect(gitCommitAndPush).toHaveBeenCalledWith({
      worktreePath: "/tmp/wt",
      message: "fix bug",
    });
    expect(useGitStore.getState().commitMessage).toBe("");
    expect(useGitStore.getState().pushing).toBe(false);
  });

  it("commitAndPush does nothing without worktreePath", async () => {
    const { gitCommitAndPush } = await import("../../lib/tauri");
    useGitStore.setState({ commitMessage: "msg" });
    await useGitStore.getState().commitAndPush();
    expect(gitCommitAndPush).not.toHaveBeenCalled();
  });

  it("commitAndPush does nothing with empty message", async () => {
    const { gitCommitAndPush } = await import("../../lib/tauri");
    useGitStore.setState({ worktreePath: "/tmp/wt", commitMessage: "  " });
    await useGitStore.getState().commitAndPush();
    expect(gitCommitAndPush).not.toHaveBeenCalled();
  });

  it("commitAndPush sets error on failure", async () => {
    const { gitCommitAndPush } = await import("../../lib/tauri");
    vi.mocked(gitCommitAndPush).mockRejectedValueOnce(new Error("push failed"));
    useGitStore.setState({
      worktreePath: "/tmp/wt",
      commitMessage: "msg",
    });
    await useGitStore.getState().commitAndPush();
    expect(useGitStore.getState().pushing).toBe(false);
    expect(useGitStore.getState().error).toContain("push failed");
  });
});
