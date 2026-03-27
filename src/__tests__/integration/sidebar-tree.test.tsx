/**
 * Integration tests for the sidebar session tree.
 *
 * Covers sessions grouped by repo, collapsible repo sections,
 * session status dots, clicking to view a session, and the
 * sidebar + New Session button.
 */
import { render, screen, act, fireEvent, waitFor } from "@testing-library/react";
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
    status: "waiting",
    stateChangedAt: new Date().toISOString(),
  },
  {
    id: "s3",
    repoId: "repo-2",
    name: "Database indexes",
    branch: "add-indexes",
    status: "completed",
    stateChangedAt: new Date().toISOString(),
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
        return [];
      case "fetch_prs":
        return [];
      default:
        return null;
    }
  });
});

afterEach(() => {
  localStorage.clear();
});

describe("Sidebar session tree", () => {
  it("groups sessions under their repo names", async () => {
    await act(async () => {
      render(<App />);
    });

    await waitFor(() => {
      expect(screen.getByText("Fix CSS layout")).toBeInTheDocument();
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
      expect(screen.getByText("Fix CSS layout")).toBeInTheDocument();
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
      expect(screen.getByText("Fix CSS layout")).toBeInTheDocument();
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
      expect(screen.getByText("Fix CSS layout")).toBeInTheDocument();
    });

    // Repo sections may start collapsed (expandedRepos initializes before repos load).
    // Click repo headers to expand them.
    const sidebar = document.querySelector("aside")!;

    await waitFor(() => {
      expect(sidebar).toHaveTextContent("acme/frontend");
    });

    // Click acme/frontend header to toggle expand
    await act(async () => {
      fireEvent.click(screen.getByText("acme/frontend"));
    });

    // Click acme/backend header to toggle expand
    await act(async () => {
      fireEvent.click(screen.getByText("acme/backend"));
    });

    // Now session names and branches should be visible in the sidebar
    await waitFor(() => {
      expect(sidebar).toHaveTextContent("fix-css");
    });

    expect(sidebar).toHaveTextContent("Fix CSS layout");
    expect(sidebar).toHaveTextContent("modal-anim");
    expect(sidebar).toHaveTextContent("Add modal animation");
    expect(sidebar).toHaveTextContent("add-indexes");
    expect(sidebar).toHaveTextContent("Database indexes");
  });

  it("shows empty state when no sessions exist", async () => {
    mockWindows("main");
    mockIPC((cmd: string) => {
      switch (cmd) {
        case "list_sessions":
          return [];
        case "list_repos":
          return mockRepos;
        case "check_stuck_sessions":
          return [];
        case "get_setting":
          return null;
        case "get_github_token":
          return null;
        case "fetch_issues":
          return [];
        case "fetch_prs":
          return [];
        default:
          return null;
      }
    });
    resetStores();

    await act(async () => {
      render(<App />);
    });

    await waitFor(() => {
      expect(screen.getByText("TooManyTabs")).toBeInTheDocument();
    });

    const sidebar = document.querySelector("aside")!;
    expect(sidebar).toHaveTextContent("No sessions yet.");
  });

  it("has a + New Session button in the sidebar", async () => {
    await act(async () => {
      render(<App />);
    });

    await waitFor(() => {
      expect(screen.getByText("Fix CSS layout")).toBeInTheDocument();
    });

    const sidebar = document.querySelector("aside")!;
    const newSessionBtn = sidebar.querySelector("button")!;
    const allSidebarButtons = Array.from(sidebar.querySelectorAll("button"));
    const newBtn = allSidebarButtons.find((b) => b.textContent === "+ New Session");
    expect(newBtn).toBeTruthy();

    // Clicking should open new session modal
    await act(async () => {
      fireEvent.click(newBtn!);
    });

    await waitFor(() => {
      expect(screen.getByTestId("new-session-modal")).toBeInTheDocument();
    });
  });

  it("collapses and expands sidebar", async () => {
    await act(async () => {
      render(<App />);
    });

    await waitFor(() => {
      expect(screen.getByText("TooManyTabs")).toBeInTheDocument();
    });

    // Click collapse button
    const collapseBtn = screen.getByTitle("Collapse sidebar");
    await act(async () => {
      fireEvent.click(collapseBtn);
    });

    // Sidebar should be collapsed — brand name not visible
    expect(screen.queryByText("TooManyTabs")).not.toBeInTheDocument();

    // Expand button should appear
    const expandBtn = screen.getByTitle("Expand sidebar");
    await act(async () => {
      fireEvent.click(expandBtn);
    });

    expect(screen.getByText("TooManyTabs")).toBeInTheDocument();
  });
});
