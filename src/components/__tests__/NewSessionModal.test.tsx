import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { NewSessionModal } from "../NewSessionModal";
import type { Repo } from "../../lib/types";

// Mock tauri module
vi.mock("../../lib/tauri", () => ({
  fetchIssues: vi.fn(() => Promise.resolve([])),
  spawnSession: vi.fn(),
}));

const mockRepo: Repo = {
  id: "repo-1",
  githubUrl: "https://github.com/owner/repo",
  localPath: "/tmp/repo",
  defaultBranch: "main",
  addedAt: Date.now(),
};

describe("NewSessionModal", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("renders with repo selector and prompt textarea", () => {
    render(<NewSessionModal repos={[mockRepo]} onClose={vi.fn()} />);
    expect(screen.getByText("New Session")).toBeInTheDocument();
    expect(screen.getByText("Repository")).toBeInTheDocument();
    expect(screen.getByPlaceholderText(/Describe the task/)).toBeInTheDocument();
  });

  it("shows message when no repos are added", () => {
    render(<NewSessionModal repos={[]} onClose={vi.fn()} />);
    expect(screen.getByText("No repositories added yet.")).toBeInTheDocument();
  });

  it("shows error when submitting without prompt", async () => {
    render(<NewSessionModal repos={[mockRepo]} onClose={vi.fn()} />);
    fireEvent.click(screen.getByText("Create Session"));
    expect(screen.getByText(/Please select a repository and provide a prompt/)).toBeInTheDocument();
  });

  it("calls onClose when Cancel is clicked", () => {
    const onClose = vi.fn();
    render(<NewSessionModal repos={[mockRepo]} onClose={onClose} />);
    fireEvent.click(screen.getByText("Cancel"));
    expect(onClose).toHaveBeenCalledOnce();
  });

  it("shows worktree conflict error and Replace button", async () => {
    const { spawnSession } = await import("../../lib/tauri");
    vi.mocked(spawnSession).mockRejectedValueOnce(
      "WORKTREE_CONFLICT: Branch 'test' is already used by worktree at '/tmp/wt'",
    );

    render(<NewSessionModal repos={[mockRepo]} onClose={vi.fn()} />);

    // Type a prompt
    const textarea = screen.getByPlaceholderText(/Describe the task/);
    fireEvent.change(textarea, { target: { value: "fix the bug" } });

    // Submit
    fireEvent.click(screen.getByText("Create Session"));

    // Wait for the error to appear
    await waitFor(() => {
      expect(
        screen.getByText(/Branch 'test' is already used by worktree/),
      ).toBeInTheDocument();
    });

    // "Replace & Create" button should appear
    expect(screen.getByText("Replace & Create")).toBeInTheDocument();
  });

  it("retries with force=true when Replace & Create is clicked", async () => {
    const { spawnSession } = await import("../../lib/tauri");
    vi.mocked(spawnSession)
      .mockRejectedValueOnce(
        "WORKTREE_CONFLICT: Branch 'test' is already used by worktree at '/tmp/wt'",
      )
      .mockResolvedValueOnce({
        id: "session-1",
        name: "test",
        repo: "owner/repo",
        repoId: "repo-1",
        branch: "test",
        status: "running",
        stateChangedAt: Date.now(),
      });

    const onClose = vi.fn();
    render(<NewSessionModal repos={[mockRepo]} onClose={onClose} />);

    // Type a prompt
    const textarea = screen.getByPlaceholderText(/Describe the task/);
    fireEvent.change(textarea, { target: { value: "fix the bug" } });

    // Submit → triggers conflict
    fireEvent.click(screen.getByText("Create Session"));

    await waitFor(() => {
      expect(screen.getByText("Replace & Create")).toBeInTheDocument();
    });

    // Click Replace & Create
    fireEvent.click(screen.getByText("Replace & Create"));

    await waitFor(() => {
      // At least one call should have force=true
      const calls = vi.mocked(spawnSession).mock.calls;
      const forceCall = calls.find((c) => c[0].force === true);
      expect(forceCall).toBeTruthy();
    });
  });

  it("shows source type tabs: Issue URL, PR URL, Ad-hoc", () => {
    render(<NewSessionModal repos={[mockRepo]} onClose={vi.fn()} />);
    expect(screen.getByText("Issue URL")).toBeInTheDocument();
    expect(screen.getByText("PR URL")).toBeInTheDocument();
    expect(screen.getByText("Ad-hoc")).toBeInTheDocument();
  });

  it("shows URL input when Issue URL source is selected", () => {
    render(<NewSessionModal repos={[mockRepo]} onClose={vi.fn()} />);
    fireEvent.click(screen.getByText("Issue URL"));
    expect(screen.getByPlaceholderText(/github\.com.*issues/)).toBeInTheDocument();
  });

  it("Create Session button is disabled when no repos exist", () => {
    render(<NewSessionModal repos={[]} onClose={vi.fn()} />);
    const button = screen.getByText("Create Session");
    expect(button).toBeDisabled();
  });
});
