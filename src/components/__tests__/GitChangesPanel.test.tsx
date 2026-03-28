import { render, screen, fireEvent, act } from "@testing-library/react";
import { GitChangesPanel } from "../GitChangesPanel";
import { useGitStore } from "../../stores/gitStore";

vi.mock("../../lib/tauri", () => ({
  getChangedFiles: vi.fn(() => Promise.resolve([])),
  gitStageFiles: vi.fn(() => Promise.resolve()),
  gitUnstageFiles: vi.fn(() => Promise.resolve()),
  gitDiscardFiles: vi.fn(() => Promise.resolve()),
  getFileDiff: vi.fn(() => Promise.resolve("")),
  gitCommitAndPush: vi.fn(() => Promise.resolve()),
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
          { path: "src/main.ts", status: "modified", staged: false, oldPath: null, insertions: null, deletions: null },
          { path: "README.md", status: "added", staged: false, oldPath: null, insertions: null, deletions: null },
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
          { path: "src/main.ts", status: "modified", staged: true, oldPath: null, insertions: null, deletions: null },
          { path: "test.ts", status: "added", staged: false, oldPath: null, insertions: null, deletions: null },
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
    render(<GitChangesPanel worktreePath="/tmp/wt" sessionStatus="completed" />);
    await act(async () => {});
    act(() => {
      useGitStore.setState({ error: "No such file or directory" });
    });
    expect(screen.getByText(/Worktree has been cleaned up/)).toBeInTheDocument();
  });

  it("renders commit message textarea", () => {
    render(<GitChangesPanel worktreePath="/tmp/wt" />);
    expect(screen.getByPlaceholderText("Commit message...")).toBeInTheDocument();
  });

  it("disables commit button when no staged files", async () => {
    render(<GitChangesPanel worktreePath="/tmp/wt" />);
    await act(async () => {});
    act(() => {
      useGitStore.setState({ commitMessage: "test commit" });
    });
    const button = screen.getByText("Commit & Push");
    expect(button).toBeDisabled();
  });

  it("disables commit button when no commit message", async () => {
    render(<GitChangesPanel worktreePath="/tmp/wt" />);
    await act(async () => {});
    act(() => {
      useGitStore.setState({
        changedFiles: [{ path: "a.ts", status: "modified", staged: true, oldPath: null, insertions: null, deletions: null }],
        commitMessage: "",
      });
    });
    const button = screen.getByText("Commit & Push");
    expect(button).toBeDisabled();
  });

  it("shows 'Pushing...' while pushing", async () => {
    render(<GitChangesPanel worktreePath="/tmp/wt" />);
    await act(async () => {});
    act(() => {
      useGitStore.setState({
        changedFiles: [{ path: "a.ts", status: "modified", staged: true, oldPath: null, insertions: null, deletions: null }],
        commitMessage: "test",
        pushing: true,
      });
    });
    expect(screen.getByText("Pushing...")).toBeInTheDocument();
  });

  it("pre-populates commit message with session name", async () => {
    render(<GitChangesPanel worktreePath="/tmp/wt" sessionName="Fix auth" />);
    await act(async () => {});
    expect(screen.getByDisplayValue("Fix auth")).toBeInTheDocument();
  });

  it("updates commit message on input", () => {
    render(<GitChangesPanel worktreePath="/tmp/wt" />);
    const textarea = screen.getByPlaceholderText("Commit message...");
    fireEvent.change(textarea, { target: { value: "new message" } });
    expect(useGitStore.getState().commitMessage).toBe("new message");
  });
});
