import { describe, it, expect, vi, beforeEach } from "vitest";
import { render } from "@testing-library/react";
import { IssueBacklog } from "../IssueBacklog";
import type { Repo, GitHubIssue } from "../../lib/types";
import * as tauri from "../../lib/tauri";

// Mock the tauri bridge
vi.mock("../../lib/tauri", () => ({
  fetchIssues: vi.fn(() => Promise.resolve([])),
  fetchPRs: vi.fn(() => Promise.resolve([])),
}));

const makeRepo = (id: string): Repo => ({
  id,
  githubUrl: `https://github.com/owner/repo-${id}`,
  localPath: `/tmp/repo-${id}`,
  defaultBranch: "main",
  addedAt: Date.now(),
});

const noop = () => {};

beforeEach(() => {
  vi.restoreAllMocks();
});

describe("IssueBacklog", () => {
  it("renders empty state when no repos are connected", () => {
    const { getByText } = render(
      <IssueBacklog repos={[]} onSelectIssue={noop} onSelectPR={noop} onNavigateSettings={noop} />,
    );

    expect(getByText("No repos connected")).toBeInTheDocument();
    expect(getByText("Add a Repo")).toBeInTheDocument();
  });

  it("renders loading state while fetching", () => {
    vi.mocked(tauri.fetchIssues).mockReturnValue(new Promise(() => {}));
    vi.mocked(tauri.fetchPRs).mockReturnValue(new Promise(() => {}));

    const { getByText, getByPlaceholderText } = render(
      <IssueBacklog
        repos={[makeRepo("1")]}
        onSelectIssue={noop}
        onSelectPR={noop}
        onNavigateSettings={noop}
      />,
    );

    expect(getByText("Issue Backlog")).toBeInTheDocument();
    expect(getByPlaceholderText("Search by title, #number, label, or author...")).toBeInTheDocument();
  });

  it("renders issues when loaded", async () => {
    const mockIssues: GitHubIssue[] = [
      {
        number: 42,
        title: "Fix the login bug",
        body: "Login is broken",
        labels: [{ name: "bug", color: "d73a4a" }],
        state: "open",
        htmlUrl: "https://github.com/owner/repo-1/issues/42",
        user: "alice",
        comments: 3,
        createdAt: "2026-01-01T00:00:00Z",
        updatedAt: "2026-01-02T00:00:00Z",
      },
      {
        number: 43,
        title: "Add dark mode",
        labels: [{ name: "enhancement", color: "a2eeef" }],
        state: "open",
        htmlUrl: "https://github.com/owner/repo-1/issues/43",
        user: "bob",
        comments: 0,
        createdAt: "2026-01-01T00:00:00Z",
        updatedAt: "2026-01-02T00:00:00Z",
      },
    ];

    vi.mocked(tauri.fetchIssues).mockResolvedValue(mockIssues);
    vi.mocked(tauri.fetchPRs).mockResolvedValue([]);

    const { findByText, getByText } = render(
      <IssueBacklog
        repos={[makeRepo("1")]}
        onSelectIssue={noop}
        onSelectPR={noop}
        onNavigateSettings={noop}
      />,
    );

    // Wait for issues to appear
    expect(await findByText("Fix the login bug")).toBeInTheDocument();
    expect(getByText("Add dark mode")).toBeInTheDocument();
  });
});
