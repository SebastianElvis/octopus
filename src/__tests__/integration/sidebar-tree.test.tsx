/**
 * Integration tests for the sidebar session tree.
 *
 * Covers sessions grouped by repo, collapsible repo sections,
 * session status dots, clicking to view a session, per-repo
 * Issues & PRs rows, per-repo + New Session, and + Add Repo button.
 */
import { render, screen, act, fireEvent, waitFor, cleanup } from "@testing-library/react";
import { mockIPC, mockWindows } from "@tauri-apps/api/mocks";
import type { BackendSession } from "../../lib/types";
import App from "../../App";
import { useSessionStore } from "../../stores/sessionStore";
import { useRepoStore } from "../../stores/repoStore";
import { useUIStore } from "../../stores/uiStore";

const mockRepos = [
  {
    id: "repo-1",
    githubUrl: "https://github.com/acme/frontend",
    localPath: "/tmp/frontend",
    defaultBranch: "main",
    addedAt: Date.now(),
  },
  {
    id: "repo-2",
    githubUrl: "https://github.com/acme/backend",
    localPath: "/tmp/backend",
    defaultBranch: "main",
    addedAt: Date.now(),
  },
];

const mockSessions: BackendSession[] = [
  {
    id: "s1",
    repoId: "repo-1",
    name: "Fix CSS layout",
    branch: "fix-css",
    status: "running",
    stateChangedAt: new Date().toISOString(),
  },
  {
    id: "s2",
    repoId: "repo-1",
    name: "Add modal animation",
    branch: "modal-anim",
    status: "attention",
    stateChangedAt: new Date().toISOString(),
  },
  {
    id: "s3",
    repoId: "repo-2",
    name: "Database indexes",
    branch: "add-indexes",
    status: "done",
    stateChangedAt: new Date().toISOString(),
  },
];

const mockIssues = [
  {
    number: 1,
    title: "Bug",
    body: "",
    labels: [],
    state: "open" as const,
    htmlUrl: "https://github.com/acme/frontend/issues/1",
    user: "alice",
    comments: 0,
    createdAt: "2026-03-01T00:00:00Z",
    updatedAt: "2026-03-01T00:00:00Z",
  },
  {
    number: 2,
    title: "Feature",
    body: "",
    labels: [],
    state: "open" as const,
    htmlUrl: "https://github.com/acme/frontend/issues/2",
    user: "bob",
    comments: 0,
    createdAt: "2026-03-01T00:00:00Z",
    updatedAt: "2026-03-01T00:00:00Z",
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
  mockIPC((cmd: string, args?: unknown) => {
    const a = args as Record<string, unknown> | undefined;
    switch (cmd) {
      case "list_sessions":
        return mockSessions;
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
        // Return issues only for repo-1
        if (a?.repoId === "repo-1") return mockIssues;
        return [];
      case "fetch_prs":
        return [];
      default:
        return null;
    }
  });
});

afterEach(() => {
  cleanup();
  localStorage.clear();
});

describe("Sidebar session tree", () => {
  it("groups sessions under their repo names", async () => {
    await act(async () => {
      render(<App />);
    });

    await waitFor(() => {
      expect(screen.getAllByText("Fix CSS layout").length).toBeGreaterThan(0);
    });

    const sidebar = document.querySelector("aside")!;
    // Repo names (extracted from URL: owner/repo)
    expect(sidebar).toHaveTextContent("acme/frontend");
    expect(sidebar).toHaveTextContent("acme/backend");
  });

  it("shows session count per repo", async () => {
    await act(async () => {
      render(<App />);
    });

    await waitFor(() => {
      expect(screen.getAllByText("Fix CSS layout").length).toBeGreaterThan(0);
    });

    const sidebar = document.querySelector("aside")!;
    // frontend has 2 sessions, backend has 1
    expect(sidebar).toHaveTextContent("2");
    expect(sidebar).toHaveTextContent("1");
  });

  it("shows waiting badge on repo with waiting sessions", async () => {
    await act(async () => {
      render(<App />);
    });

    await waitFor(() => {
      expect(screen.getAllByText("Fix CSS layout").length).toBeGreaterThan(0);
    });

    // The acme/frontend repo should have a waiting badge (1 waiting session: s2)
    // This is rendered as a red badge with the count
    const sidebar = document.querySelector("aside")!;
    const badges = sidebar.querySelectorAll(".bg-red-500");
    expect(badges.length).toBeGreaterThan(0);
  });

  it("shows session names with branch info when repo section is expanded", async () => {
    await act(async () => {
      render(<App />);
    });

    await waitFor(() => {
      expect(screen.getAllByText("Fix CSS layout").length).toBeGreaterThan(0);
    });

    // Repos auto-expand when loaded, so sessions and branches should already be visible
    const sidebar = document.querySelector("aside")!;

    await waitFor(() => {
      expect(sidebar).toHaveTextContent("fix-css");
    });

    expect(sidebar).toHaveTextContent("Fix CSS layout");
    expect(sidebar).toHaveTextContent("modal-anim");
    expect(sidebar).toHaveTextContent("Add modal animation");
    // Done sessions are collapsed by default in DoneGroup, so
    // "add-indexes" / "Database indexes" are not immediately visible.
  });

  it("shows empty state when no sessions and no repos exist", async () => {
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

    await waitFor(() => {
      expect(screen.getByText("Octopus")).toBeInTheDocument();
    });

    const sidebar = document.querySelector("aside")!;
    expect(sidebar).toHaveTextContent("No repos yet.");
  });

  it("has per-repo + New Session buttons in the sidebar", async () => {
    await act(async () => {
      render(<App />);
    });

    await waitFor(() => {
      expect(screen.getAllByText("Fix CSS layout").length).toBeGreaterThan(0);
    });

    const sidebar = document.querySelector("aside")!;
    const allSidebarButtons = Array.from(sidebar.querySelectorAll("button"));
    const newBtns = allSidebarButtons.filter((b) => b.textContent === "+ New Session");
    // Should have one per expanded repo
    expect(newBtns.length).toBeGreaterThan(0);

    // Clicking should open new session modal
    await act(async () => {
      fireEvent.click(newBtns[0]);
    });

    await waitFor(() => {
      expect(screen.getByTestId("new-session-modal")).toBeInTheDocument();
    });
  });

  it("has a + Add Repo button at the bottom of the sidebar", async () => {
    await act(async () => {
      render(<App />);
    });

    await waitFor(() => {
      expect(screen.getByText("Octopus")).toBeInTheDocument();
    });

    const addRepoBtn = screen.getByTestId("add-repo-button");
    expect(addRepoBtn).toBeInTheDocument();
    expect(addRepoBtn.textContent).toBe("+ Add Repo");
  });

  it("shows Issues & PRs row under each repo", async () => {
    await act(async () => {
      render(<App />);
    });

    await waitFor(() => {
      expect(screen.getAllByText("Fix CSS layout").length).toBeGreaterThan(0);
    });

    // Each expanded repo should have an "Issues & PRs" button
    const sidebar = document.querySelector("aside")!;
    const issueButtons = Array.from(sidebar.querySelectorAll("button")).filter((b) =>
      b.textContent?.includes("Issues & PRs"),
    );
    expect(issueButtons.length).toBeGreaterThan(0);
  });

  it("clicking Issues & PRs navigates to tasks view", async () => {
    await act(async () => {
      render(<App />);
    });

    await waitFor(() => {
      expect(screen.getByTestId("repo-tasks-repo-1")).toBeInTheDocument();
    });

    await act(async () => {
      fireEvent.click(screen.getByTestId("repo-tasks-repo-1"));
    });

    // Should navigate to task backlog
    await waitFor(() => {
      expect(screen.getByText("Task Backlog")).toBeInTheDocument();
    });
  });

  it("collapses and expands sidebar", async () => {
    await act(async () => {
      render(<App />);
    });

    await waitFor(() => {
      expect(screen.getByText("Octopus")).toBeInTheDocument();
    });

    // Click collapse button
    const collapseBtn = screen.getByTitle("Collapse sidebar");
    await act(async () => {
      fireEvent.click(collapseBtn);
    });

    // Sidebar should be collapsed — brand name not visible
    expect(screen.queryByText("Octopus")).not.toBeInTheDocument();

    // Expand button should appear
    const expandBtn = screen.getByTitle("Expand sidebar");
    await act(async () => {
      fireEvent.click(expandBtn);
    });

    expect(screen.getByText("Octopus")).toBeInTheDocument();
  });
});
