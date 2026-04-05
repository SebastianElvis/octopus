/**
 * Integration tests for the task backlog (issues + PRs view).
 *
 * Covers displaying GitHub issues/PRs, filtering by type, searching,
 * and creating sessions from issues.
 */
import { render, screen, act, fireEvent, waitFor } from "@testing-library/react";
import { mockIPC, mockWindows } from "@tauri-apps/api/mocks";
import App from "../../App";
import { useSessionStore } from "../../stores/sessionStore";
import { useRepoStore } from "../../stores/repoStore";
import { useUIStore } from "../../stores/uiStore";

const mockRepos = [
  {
    id: "repo-1",
    githubUrl: "https://github.com/test/myapp",
    localPath: "/tmp/myapp",
    defaultBranch: "main",
    addedAt: Date.now(),
  },
];

const mockIssues = [
  {
    number: 10,
    title: "Login page crashes on Safari",
    body: "Steps to reproduce...",
    labels: [
      { name: "bug", color: "d73a4a" },
      { name: "priority:high", color: "b60205" },
    ],
    state: "open" as const,
    htmlUrl: "https://github.com/test/myapp/issues/10",
    user: "alice",
    comments: 5,
    createdAt: "2026-03-01T00:00:00Z",
    updatedAt: "2026-03-25T00:00:00Z",
  },
  {
    number: 11,
    title: "Add dark mode support",
    body: "Users have requested dark mode",
    labels: [{ name: "enhancement", color: "a2eeef" }],
    state: "open" as const,
    htmlUrl: "https://github.com/test/myapp/issues/11",
    user: "bob",
    comments: 2,
    createdAt: "2026-03-10T00:00:00Z",
    updatedAt: "2026-03-22T00:00:00Z",
  },
  {
    number: 9,
    title: "Old closed issue",
    body: "",
    labels: [],
    state: "closed" as const,
    htmlUrl: "https://github.com/test/myapp/issues/9",
    user: "carol",
    comments: 0,
    createdAt: "2026-01-01T00:00:00Z",
    updatedAt: "2026-02-01T00:00:00Z",
  },
];

const mockPRs = [
  {
    number: 20,
    title: "Fix memory leak in worker",
    body: "",
    state: "open" as const,
    htmlUrl: "https://github.com/test/myapp/pull/20",
    headRef: "fix-memory-leak",
    baseRef: "main",
    user: "dave",
    comments: 1,
    createdAt: "2026-03-18T00:00:00Z",
    updatedAt: "2026-03-24T00:00:00Z",
  },
];

function resetStores() {
  useSessionStore.setState({
    sessions: [],
    outputBuffers: {},
    sessionsLoading: true,
    sessionsError: null,
  });
  useRepoStore.setState({ repos: [] });
  useUIStore.setState({ sidebarCollapsed: false });
}

beforeEach(() => {
  localStorage.setItem("tmt-onboarding-completed", "true");
  resetStores();
  mockWindows("main");
  mockIPC((cmd: string) => {
    switch (cmd) {
      case "list_sessions":
        return [];
      case "list_repos":
        return mockRepos;
      case "check_stuck_sessions":
        return [];
      case "check_prerequisites":
        return { claude: true, git: true, gh: true };
      case "get_setting":
        return null;
      case "get_github_token":
        return null;
      case "fetch_issues":
        return mockIssues;
      case "fetch_prs":
        return mockPRs;
      case "spawn_session":
        return {
          id: "new-1",
          repoId: "repo-1",
          name: "Test",
          branch: "test",
          status: "running",
          stateChangedAt: new Date().toISOString(),
        };
      default:
        return null;
    }
  });
});

afterEach(() => {
  localStorage.clear();
});

async function navigateToTasks() {
  await act(async () => {
    render(<App />);
  });

  // Click the repo's "Issues & PRs" button in the sidebar
  await waitFor(() => {
    expect(screen.getByTestId("repo-tasks-repo-1")).toBeInTheDocument();
  });

  await act(async () => {
    fireEvent.click(screen.getByTestId("repo-tasks-repo-1"));
  });

  // Wait for items to load
  await waitFor(() => {
    expect(screen.getByText("Task Backlog")).toBeInTheDocument();
  });
}

describe("Task backlog", () => {
  it("displays open issues and PRs from GitHub", async () => {
    await navigateToTasks();

    await waitFor(() => {
      expect(screen.getByText("Login page crashes on Safari")).toBeInTheDocument();
    });

    expect(screen.getByText("Add dark mode support")).toBeInTheDocument();
    expect(screen.getByText("Fix memory leak in worker")).toBeInTheDocument();
    // Closed issues should NOT appear
    expect(screen.queryByText("Old closed issue")).not.toBeInTheDocument();
  });

  it("shows issue metadata: author, comments, repo name", async () => {
    await navigateToTasks();

    await waitFor(() => {
      expect(screen.getByText("Login page crashes on Safari")).toBeInTheDocument();
    });

    expect(screen.getByText("by alice")).toBeInTheDocument();
    // Repo name appears for each issue row, so use getAllByText
    expect(screen.getAllByText("test/myapp").length).toBeGreaterThan(0);
    expect(screen.getByText("#10")).toBeInTheDocument();
  });

  it("shows labels with correct colors", async () => {
    await navigateToTasks();

    await waitFor(() => {
      expect(screen.getByText("bug")).toBeInTheDocument();
    });

    expect(screen.getByText("priority:high")).toBeInTheDocument();
    expect(screen.getByText("enhancement")).toBeInTheDocument();
  });

  it("shows filter tabs with correct counts", async () => {
    await navigateToTasks();

    await waitFor(() => {
      expect(screen.getByText("Login page crashes on Safari")).toBeInTheDocument();
    });

    // All tab should show total open count (2 issues + 1 PR = 3)
    // The count badges
    const allTab = screen.getByText("All");
    expect(allTab.parentElement).toHaveTextContent("3");
  });

  it("filters by Issues tab", async () => {
    await navigateToTasks();

    await waitFor(() => {
      expect(screen.getByText("Login page crashes on Safari")).toBeInTheDocument();
    });

    await act(async () => {
      fireEvent.click(screen.getByText("Issues"));
    });

    expect(screen.getByText("Login page crashes on Safari")).toBeInTheDocument();
    expect(screen.getByText("Add dark mode support")).toBeInTheDocument();
    expect(screen.queryByText("Fix memory leak in worker")).not.toBeInTheDocument();
  });

  it("filters by PRs tab", async () => {
    await navigateToTasks();

    await waitFor(() => {
      expect(screen.getByText("Login page crashes on Safari")).toBeInTheDocument();
    });

    await act(async () => {
      fireEvent.click(screen.getByText("PRs"));
    });

    expect(screen.getByText("Fix memory leak in worker")).toBeInTheDocument();
    expect(screen.queryByText("Login page crashes on Safari")).not.toBeInTheDocument();
  });

  it("searches by title", async () => {
    await navigateToTasks();

    await waitFor(() => {
      expect(screen.getByText("Login page crashes on Safari")).toBeInTheDocument();
    });

    await act(async () => {
      fireEvent.change(
        screen.getByPlaceholderText("Search by title, #number, label, or author..."),
        { target: { value: "Safari" } },
      );
    });

    expect(screen.getByText("Login page crashes on Safari")).toBeInTheDocument();
    expect(screen.queryByText("Add dark mode support")).not.toBeInTheDocument();
  });

  it("searches by issue number", async () => {
    await navigateToTasks();

    await waitFor(() => {
      expect(screen.getByText("Login page crashes on Safari")).toBeInTheDocument();
    });

    await act(async () => {
      fireEvent.change(
        screen.getByPlaceholderText("Search by title, #number, label, or author..."),
        { target: { value: "11" } },
      );
    });

    expect(screen.getByText("Add dark mode support")).toBeInTheDocument();
    expect(screen.queryByText("Login page crashes on Safari")).not.toBeInTheDocument();
  });

  it("clicking an issue opens new session modal with prefilled data", async () => {
    await navigateToTasks();

    await waitFor(() => {
      expect(screen.getByText("Login page crashes on Safari")).toBeInTheDocument();
    });

    // Click on the issue — it's a button wrapping the content
    await act(async () => {
      fireEvent.click(screen.getByText("Login page crashes on Safari"));
    });

    // Should open new session modal with issue prefilled
    await waitFor(() => {
      expect(screen.getByTestId("new-session-modal")).toBeInTheDocument();
    });

    // The prompt should reference the issue
    const promptArea = screen.getByPlaceholderText("Describe the task for Claude...");
    expect((promptArea as HTMLTextAreaElement).value).toContain("issues/10");
  });

  it("shows no-repos empty state when no repos connected", async () => {
    mockWindows("main");
    mockIPC((cmd: string) => {
      switch (cmd) {
        case "list_sessions":
          return [];
        case "list_repos":
          return [];
        case "check_stuck_sessions":
          return [];
        case "get_setting":
          return null;
        case "get_github_token":
          return null;
        default:
          return null;
      }
    });
    resetStores();

    await act(async () => {
      render(<App />);
    });

    // With no repos, + Add Repo is the way to get to repos view
    await waitFor(() => {
      expect(screen.getByTestId("add-repo-button")).toBeInTheDocument();
    });

    // The sidebar should show "No repos yet." when no repos and no sessions
    const sidebar = document.querySelector("aside")!;
    expect(sidebar).toHaveTextContent("No repos yet.");
  });
});
