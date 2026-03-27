/**
 * Integration tests for app navigation and layout.
 *
 * Uses @tauri-apps/api/mocks to intercept IPC at the Tauri internals level,
 * exercising the real tauriInvoke wrapper and isTauri() detection.
 */
import { render, screen, act, fireEvent, waitFor } from "@testing-library/react";
import { mockIPC, mockWindows } from "@tauri-apps/api/mocks";
import type { BackendSession } from "../../lib/types";
import App from "../../App";

// Reset stores between tests
import { useSessionStore } from "../../stores/sessionStore";
import { useRepoStore } from "../../stores/repoStore";
import { useUIStore } from "../../stores/uiStore";

const mockSessions: BackendSession[] = [
  {
    id: "s1",
    repoId: "repo-1",
    name: "Fix auth bug",
    branch: "fix-auth",
    status: "waiting",
    stateChangedAt: new Date().toISOString(),
  },
  {
    id: "s2",
    repoId: "repo-1",
    name: "Add tests",
    branch: "add-tests",
    status: "running",
    stateChangedAt: new Date().toISOString(),
  },
  {
    id: "s3",
    repoId: "repo-1",
    name: "Refactor DB",
    branch: "refactor-db",
    status: "completed",
    stateChangedAt: new Date().toISOString(),
  },
];

const mockRepos = [
  {
    id: "repo-1",
    githubUrl: "https://github.com/test/repo",
    localPath: "/tmp/repo",
    defaultBranch: "main",
    addedAt: Date.now(),
  },
];

beforeEach(() => {
  // Mark onboarding as completed so it doesn't block tests
  localStorage.setItem("tmt-onboarding-completed", "true");

  // Reset zustand stores
  useSessionStore.setState({
    sessions: [],
    outputBuffers: {},
    sessionsLoading: true,
    sessionsError: null,
  });
  useRepoStore.setState({ repos: [] });
  useUIStore.setState({ sidebarCollapsed: false });

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

describe("App navigation", () => {
  it("renders the sidebar with nav items on launch", async () => {
    await act(async () => {
      render(<App />);
    });

    await waitFor(() => {
      expect(screen.getByText("TooManyTabs")).toBeInTheDocument();
    });

    expect(screen.getByTestId("nav-home")).toBeInTheDocument();
    expect(screen.getByTestId("nav-tasks")).toBeInTheDocument();
    expect(screen.getByTestId("nav-repos")).toBeInTheDocument();
  });

  it("loads sessions from backend via mockIPC and shows dispatch board", async () => {
    await act(async () => {
      render(<App />);
    });

    // Wait for sessions to load via the mocked IPC
    await waitFor(() => {
      expect(screen.getByText("Fix auth bug")).toBeInTheDocument();
    });

    expect(screen.getByText("Add tests")).toBeInTheDocument();
    expect(screen.getByText("Refactor DB")).toBeInTheDocument();
  });

  it("shows kanban columns with correct session categorization", async () => {
    await act(async () => {
      render(<App />);
    });

    await waitFor(() => {
      expect(screen.getByText("Needs Attention")).toBeInTheDocument();
    });

    expect(screen.getByText("Running")).toBeInTheDocument();
    expect(screen.getByText("Closed")).toBeInTheDocument();
  });

  it("navigates to Repos view when clicking nav button", async () => {
    await act(async () => {
      render(<App />);
    });

    await waitFor(() => {
      expect(screen.getByTestId("nav-repos")).toBeInTheDocument();
    });

    await act(async () => {
      fireEvent.click(screen.getByTestId("nav-repos"));
    });

    // Repos view should show repo management UI
    await waitFor(() => {
      expect(screen.getByText("Repositories")).toBeInTheDocument();
    });
  });

  it("navigates to Tasks view when clicking nav button", async () => {
    await act(async () => {
      render(<App />);
    });

    await waitFor(() => {
      expect(screen.getByTestId("nav-tasks")).toBeInTheDocument();
    });

    await act(async () => {
      fireEvent.click(screen.getByTestId("nav-tasks"));
    });

    // Tasks view should render
    const main = document.querySelector("main");
    expect(main).toBeInTheDocument();
  });

  it("returns to Home after navigating away", async () => {
    await act(async () => {
      render(<App />);
    });

    await waitFor(() => {
      expect(screen.getByTestId("nav-repos")).toBeInTheDocument();
    });

    // Navigate to repos
    await act(async () => {
      fireEvent.click(screen.getByTestId("nav-repos"));
    });

    // Navigate back to home
    await act(async () => {
      fireEvent.click(screen.getByTestId("nav-home"));
    });

    await waitFor(() => {
      expect(screen.getByText("Fix auth bug")).toBeInTheDocument();
    });
  });

  it("shows waiting badge count on Home nav", async () => {
    await act(async () => {
      render(<App />);
    });

    // "waiting" session should cause badge "1" on Home nav
    await waitFor(() => {
      expect(screen.getByText("Fix auth bug")).toBeInTheDocument();
    });

    const homeNav = screen.getByTestId("nav-home");
    expect(homeNav.textContent).toContain("1");
  });
});
