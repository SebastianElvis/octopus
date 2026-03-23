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
    expect(getByText("Go to Settings")).toBeInTheDocument();
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
    expect(getByPlaceholderText("Search issues and PRs...")).toBeInTheDocument();
  });

  it("renders issues when loaded", async () => {
    const mockIssues: GitHubIssue[] = [
      {
        number: 42,
        title: "Fix the login bug",
        body: "Login is broken",
        labels: ["bug"],
        state: "open",
        url: "https://github.com/owner/repo-1/issues/42",
      },
      {
        number: 43,
        title: "Add dark mode",
        labels: ["enhancement"],
        state: "open",
        url: "https://github.com/owner/repo-1/issues/43",
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
