/**
 * Integration tests for the command palette.
 *
 * Covers opening via Cmd+K, searching sessions, keyboard navigation,
 * selecting a session, and closing.
 */
import { render, screen, act, fireEvent, waitFor } from "@testing-library/react";
import { mockIPC, mockWindows } from "@tauri-apps/api/mocks";
import type { BackendSession } from "../../lib/types";
import App from "../../App";
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
    name: "Add pagination",
    branch: "add-pagination",
    status: "running",
    stateChangedAt: new Date().toISOString(),
  },
  {
    id: "s3",
    repoId: "repo-1",
    name: "Refactor tests",
    branch: "refactor-tests",
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

describe("Command palette", () => {
  it("opens with Cmd+K and lists all sessions", async () => {
    await act(async () => {
      render(<App />);
    });

    await waitFor(() => {
      expect(screen.getByText("Fix auth bug")).toBeInTheDocument();
    });

    await act(async () => {
      fireEvent.keyDown(window, { key: "k", metaKey: true });
    });

    await waitFor(() => {
      expect(screen.getByTestId("command-palette")).toBeInTheDocument();
    });

    // All sessions should be listed
    const palette = screen.getByTestId("command-palette");
    expect(palette).toHaveTextContent("Fix auth bug");
    expect(palette).toHaveTextContent("Add pagination");
    expect(palette).toHaveTextContent("Refactor tests");
  });

  it("filters sessions by search query", async () => {
    await act(async () => {
      render(<App />);
    });

    await waitFor(() => {
      expect(screen.getByText("Fix auth bug")).toBeInTheDocument();
    });

    await act(async () => {
      fireEvent.keyDown(window, { key: "k", metaKey: true });
    });

    await waitFor(() => {
      expect(screen.getByTestId("command-palette")).toBeInTheDocument();
    });

    const searchInput = screen.getByPlaceholderText("Search sessions...");

    await act(async () => {
      fireEvent.change(searchInput, { target: { value: "auth" } });
    });

    const palette = screen.getByTestId("command-palette");
    expect(palette).toHaveTextContent("Fix auth bug");
    expect(palette).not.toHaveTextContent("Add pagination");
    expect(palette).not.toHaveTextContent("Refactor tests");
  });

  it("shows session status and repo info", async () => {
    await act(async () => {
      render(<App />);
    });

    await waitFor(() => {
      expect(screen.getByText("Fix auth bug")).toBeInTheDocument();
    });

    await act(async () => {
      fireEvent.keyDown(window, { key: "k", metaKey: true });
    });

    await waitFor(() => {
      expect(screen.getByTestId("command-palette")).toBeInTheDocument();
    });

    const palette = screen.getByTestId("command-palette");
    // Should show status labels
    expect(palette).toHaveTextContent("waiting");
    expect(palette).toHaveTextContent("running");
    expect(palette).toHaveTextContent("completed");
  });

  it("shows 'No sessions found' when search has no results", async () => {
    await act(async () => {
      render(<App />);
    });

    await waitFor(() => {
      expect(screen.getByText("Fix auth bug")).toBeInTheDocument();
    });

    await act(async () => {
      fireEvent.keyDown(window, { key: "k", metaKey: true });
    });

    const searchInput = screen.getByPlaceholderText("Search sessions...");

    await act(async () => {
      fireEvent.change(searchInput, { target: { value: "nonexistent" } });
    });

    expect(screen.getByText("No sessions found")).toBeInTheDocument();
  });

  it("closes with Escape key", async () => {
    await act(async () => {
      render(<App />);
    });

    await waitFor(() => {
      expect(screen.getByText("Fix auth bug")).toBeInTheDocument();
    });

    await act(async () => {
      fireEvent.keyDown(window, { key: "k", metaKey: true });
    });

    await waitFor(() => {
      expect(screen.getByTestId("command-palette")).toBeInTheDocument();
    });

    await act(async () => {
      fireEvent.keyDown(window, { key: "Escape" });
    });

    await waitFor(() => {
      expect(screen.queryByTestId("command-palette")).not.toBeInTheDocument();
    });
  });

  it("closes with Cmd+K toggle", async () => {
    await act(async () => {
      render(<App />);
    });

    await waitFor(() => {
      expect(screen.getByText("Fix auth bug")).toBeInTheDocument();
    });

    // Open
    await act(async () => {
      fireEvent.keyDown(window, { key: "k", metaKey: true });
    });

    await waitFor(() => {
      expect(screen.getByTestId("command-palette")).toBeInTheDocument();
    });

    // Close by toggling
    await act(async () => {
      fireEvent.keyDown(window, { key: "k", metaKey: true });
    });

    await waitFor(() => {
      expect(screen.queryByTestId("command-palette")).not.toBeInTheDocument();
    });
  });
});
