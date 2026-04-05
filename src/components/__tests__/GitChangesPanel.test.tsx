import { render, screen, act } from "@testing-library/react";
import { GitChangesPanel } from "../GitChangesPanel";
import { useGitStore } from "../../stores/gitStore";

vi.mock("../../lib/tauri", () => ({
  getChangedFiles: vi.fn(() => Promise.resolve([])),
  gitStageFiles: vi.fn(() => Promise.resolve()),
  gitUnstageFiles: vi.fn(() => Promise.resolve()),
  gitDiscardFiles: vi.fn(() => Promise.resolve()),
  getFileDiff: vi.fn(() => Promise.resolve("")),
  sendFollowup: vi.fn(() => Promise.resolve()),
}));

function resetStore(overrides: Record<string, unknown> = {}) {
  useGitStore.setState({
    worktreePath: null,
    changedFiles: [],
    selectedFile: null,
    selectedFileDiff: null,
    selectedFileStaged: false,
    loading: false,
    commitMessage: "",
    pushing: false,
    committing: false,
    error: null,
    ...overrides,
  });
}

beforeEach(() => {
  resetStore();
});

describe("GitChangesPanel", () => {
  it("shows 'No worktree' when worktreePath is undefined", () => {
    render(<GitChangesPanel worktreePath={undefined} />);
    expect(screen.getByText("No worktree")).toBeInTheDocument();
  });

  it("shows 'Changes' header", () => {
    render(<GitChangesPanel worktreePath="/tmp/wt" />);
    expect(screen.getByText("Changes")).toBeInTheDocument();
  });

  it("shows loading state", async () => {
    resetStore({ loading: true });
    render(<GitChangesPanel worktreePath="/tmp/wt" />);
    // Wait for effects to settle
    await act(async () => {});
    // Force loading state again since setWorktreePath may have reset it
    act(() => {
      useGitStore.setState({ loading: true, changedFiles: [] });
    });
    expect(screen.getByText("Loading...")).toBeInTheDocument();
  });

  it("renders unstaged files", async () => {
    render(<GitChangesPanel worktreePath="/tmp/wt" />);
    await act(async () => {});
    act(() => {
      useGitStore.setState({
        changedFiles: [
          {
            path: "src/main.ts",
            status: "modified",
            staged: false,
            oldPath: null,
            insertions: null,
            deletions: null,
          },
          {
            path: "README.md",
            status: "added",
            staged: false,
            oldPath: null,
            insertions: null,
            deletions: null,
          },
        ],
      });
    });
    expect(screen.getByText("main.ts")).toBeInTheDocument();
    expect(screen.getByText("README.md")).toBeInTheDocument();
  });

  it("renders staged files separately", async () => {
    render(<GitChangesPanel worktreePath="/tmp/wt" />);
    await act(async () => {});
    act(() => {
      useGitStore.setState({
        changedFiles: [
          {
            path: "src/main.ts",
            status: "modified",
            staged: true,
            oldPath: null,
            insertions: null,
            deletions: null,
          },
          {
            path: "test.ts",
            status: "added",
            staged: false,
            oldPath: null,
            insertions: null,
            deletions: null,
          },
        ],
      });
    });
    expect(screen.getByText("Staged (1)")).toBeInTheDocument();
    expect(screen.getByText("Changes (1)")).toBeInTheDocument();
  });

  it("shows error message", async () => {
    render(<GitChangesPanel worktreePath="/tmp/wt" />);
    await act(async () => {});
    act(() => {
      useGitStore.setState({ error: "Something went wrong" });
    });
    expect(screen.getByText("Something went wrong")).toBeInTheDocument();
  });

  it("shows worktree cleaned up message for done sessions with missing path", async () => {
    render(<GitChangesPanel worktreePath="/tmp/wt" sessionStatus="done" />);
    await act(async () => {});
    act(() => {
      useGitStore.setState({ error: "No such file or directory" });
    });
    expect(screen.getByText(/Worktree has been cleaned up/)).toBeInTheDocument();
  });

  it("renders commit message textarea when there are changed files", async () => {
    render(<GitChangesPanel worktreePath="/tmp/wt" />);
    await act(async () => {});
    act(() => {
      useGitStore.setState({
        changedFiles: [
          {
            path: "src/main.ts",
            status: "modified",
            staged: false,
            oldPath: null,
            insertions: null,
            deletions: null,
          },
        ],
      });
    });
    expect(screen.getByPlaceholderText("Commit message...")).toBeInTheDocument();
  });

  it("shows commit as primary action when files are staged", async () => {
    render(<GitChangesPanel worktreePath="/tmp/wt" />);
    await act(async () => {});
    act(() => {
      useGitStore.setState({
        commitMessage: "test commit",
        changedFiles: [
          {
            path: "src/main.ts",
            status: "modified",
            staged: true,
            oldPath: null,
            insertions: null,
            deletions: null,
          },
        ],
      });
    });
    expect(screen.getByText("Commit 1 file")).toBeInTheDocument();
  });

  it("shows Create PR as secondary action when files exist and sessionId provided", async () => {
    render(<GitChangesPanel worktreePath="/tmp/wt" sessionId="s1" />);
    await act(async () => {});
    act(() => {
      useGitStore.setState({
        changedFiles: [
          {
            path: "src/main.ts",
            status: "modified",
            staged: false,
            oldPath: null,
            insertions: null,
            deletions: null,
          },
        ],
      });
    });
    expect(screen.getByText("Create PR")).toBeInTheDocument();
  });

  it("shows create pull request as primary when in PR phase", async () => {
    render(<GitChangesPanel worktreePath="/tmp/wt" sessionId="s1" />);
    await act(async () => {});
    act(() => {
      useGitStore.setState({
        changedFiles: [],
        syncStatus: { ahead: 0, behind: 0, hasUpstream: true },
        successMessage: "Pushed 1 commit",
      });
    });
    expect(screen.getByText("Create pull request")).toBeInTheDocument();
  });
});
