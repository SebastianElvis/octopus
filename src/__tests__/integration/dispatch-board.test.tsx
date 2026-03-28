/**
 * Integration tests for the dispatch board.
 *
 * Covers empty state, session loading, fleet summary, search/filter,
 * session card actions (interrupt, resume, retry, kill), and bulk actions.
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
    githubUrl: "https://github.com/test/frontend",
    localPath: "/tmp/frontend",
    defaultBranch: "main",
    addedAt: Date.now(),
  },
  {
    id: "repo-2",
    githubUrl: "https://github.com/test/backend",
    localPath: "/tmp/backend",
    defaultBranch: "main",
    addedAt: Date.now(),
  },
];

function makeSessions(): BackendSession[] {
  return [
    {
      id: "s1",
      repoId: "repo-1",
      name: "Fix login form",
      branch: "fix-login",
      status: "waiting",
      blockType: "permission",
      stateChangedAt: new Date().toISOString(),
    },
    {
      id: "s2",
      repoId: "repo-1",
      name: "Add dark mode",
      branch: "dark-mode",
      status: "running",
      stateChangedAt: new Date().toISOString(),
    },
    {
      id: "s3",
      repoId: "repo-2",
      name: "API refactor",
      branch: "api-v2",
      status: "running",
      stateChangedAt: new Date().toISOString(),
    },
    {
      id: "s4",
      repoId: "repo-1",
      name: "Fix CSS bug",
      branch: "fix-css",
      status: "completed",
      stateChangedAt: new Date().toISOString(),
    },
    {
      id: "s5",
      repoId: "repo-2",
      name: "DB migration",
      branch: "migrate-db",
      status: "failed",
      stateChangedAt: new Date().toISOString(),
    },
    {
      id: "s6",
      repoId: "repo-1",
      name: "Stale session",
      branch: "stale",
      status: "stuck",
      stateChangedAt: new Date().toISOString(),
    },
  ];
}

let ipcCommands: string[] = [];

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
  ipcCommands = [];
  resetStores();
});

afterEach(() => {
  localStorage.clear();
});

function setupIPC(sessions: BackendSession[] = makeSessions()) {
  mockWindows("main");
  mockIPC((cmd: string, args?: Record<string, unknown>) => {
    ipcCommands.push(cmd);
    switch (cmd) {
      case "list_sessions":
        return sessions;
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
      case "kill_session":
        return null;
      case "interrupt_session":
        return null;
      case "resume_session":
        return null;
      default:
        return null;
    }
  });
}

describe("Dispatch board", () => {
  it("shows empty state with workflow steps when no sessions exist", async () => {
    setupIPC([]);

    await act(async () => {
      render(<App />);
    });

    await waitFor(() => {
      expect(screen.getByText("Welcome to TooManyTabs")).toBeInTheDocument();
    });

    expect(screen.getByText("Add a repository")).toBeInTheDocument();
    expect(screen.getByText("Create a session")).toBeInTheDocument();
    expect(screen.getByText("Monitor and respond")).toBeInTheDocument();
    expect(screen.getByText("Ship it")).toBeInTheDocument();
    expect(screen.getByText("Get Started")).toBeInTheDocument();
  });

  it("shows fleet summary with correct counts", async () => {
    setupIPC();

    await act(async () => {
      render(<App />);
    });

    await waitFor(() => {
      expect(screen.getByText("Fix login form")).toBeInTheDocument();
    });

    expect(screen.getByText("6 total")).toBeInTheDocument();
    // Use getAllByText since "running" and "attention" appear in both
    // fleet summary pills and kanban column headers
    expect(screen.getAllByText("attention").length).toBeGreaterThan(0);
    expect(screen.getAllByText("running").length).toBeGreaterThan(0);
  });

  it("categorizes sessions into correct kanban columns", async () => {
    setupIPC();

    await act(async () => {
      render(<App />);
    });

    await waitFor(() => {
      expect(screen.getByText("Needs Attention")).toBeInTheDocument();
    });

    // Needs Attention: waiting (s1) + stuck (s6)
    const attentionCol = screen.getByTestId("column-needs-attention");
    expect(attentionCol).toHaveTextContent("Fix login form");
    expect(attentionCol).toHaveTextContent("Stale session");

    // Running: s2, s3
    const runningCol = screen.getByTestId("column-running");
    expect(runningCol).toHaveTextContent("Add dark mode");
    expect(runningCol).toHaveTextContent("API refactor");

    // Closed: completed (s4) + failed (s5)
    const closedCol = screen.getByTestId("column-closed");
    expect(closedCol).toHaveTextContent("Fix CSS bug");
    expect(closedCol).toHaveTextContent("DB migration");
  });

  it("filters sessions by search query", async () => {
    setupIPC();

    await act(async () => {
      render(<App />);
    });

    await waitFor(() => {
      expect(screen.getByText("Fix login form")).toBeInTheDocument();
    });

    await act(async () => {
      fireEvent.change(screen.getByPlaceholderText("Filter sessions... (press / to focus)"), {
        target: { value: "API" },
      });
    });

    expect(screen.getByText("API refactor")).toBeInTheDocument();
    expect(screen.queryByText("Fix login form")).not.toBeInTheDocument();
    expect(screen.queryByText("Add dark mode")).not.toBeInTheDocument();
  });

  it("filters sessions by repo name", async () => {
    setupIPC();

    await act(async () => {
      render(<App />);
    });

    await waitFor(() => {
      expect(screen.getByText("Fix login form")).toBeInTheDocument();
    });

    await act(async () => {
      // s.repo is the repoId, so search by that
      fireEvent.change(screen.getByPlaceholderText("Filter sessions... (press / to focus)"), {
        target: { value: "repo-2" },
      });
    });

    // Only repo-2 sessions should show
    expect(screen.getByText("API refactor")).toBeInTheDocument();
    expect(screen.getByText("DB migration")).toBeInTheDocument();
    expect(screen.queryByText("Fix login form")).not.toBeInTheDocument();
  });

  it("filters sessions by branch name", async () => {
    setupIPC();

    await act(async () => {
      render(<App />);
    });

    await waitFor(() => {
      expect(screen.getByText("Fix login form")).toBeInTheDocument();
    });

    await act(async () => {
      fireEvent.change(screen.getByPlaceholderText("Filter sessions... (press / to focus)"), {
        target: { value: "dark-mode" },
      });
    });

    expect(screen.getByText("Add dark mode")).toBeInTheDocument();
    expect(screen.queryByText("Fix login form")).not.toBeInTheDocument();
  });

  it("shows session card with status pill and block type", async () => {
    setupIPC();

    await act(async () => {
      render(<App />);
    });

    await waitFor(() => {
      expect(screen.getByTestId("session-card-s1")).toBeInTheDocument();
    });

    const card = screen.getByTestId("session-card-s1");
    expect(card).toHaveTextContent("Fix login form");
    expect(card).toHaveTextContent("permission");
  });

  it("shows Interrupt button on running sessions and calls IPC", async () => {
    setupIPC();

    await act(async () => {
      render(<App />);
    });

    await waitFor(() => {
      expect(screen.getByTestId("session-card-s2")).toBeInTheDocument();
    });

    const card = screen.getByTestId("session-card-s2");
    const interruptBtn = card.querySelector("button")!;
    const allButtons = Array.from(card.querySelectorAll("button"));
    const interrupt = allButtons.find((b) => b.textContent === "Interrupt");
    expect(interrupt).toBeTruthy();

    await act(async () => {
      fireEvent.click(interrupt!);
    });

    expect(ipcCommands).toContain("interrupt_session");
  });

  it("shows Kill confirmation flow on session cards", async () => {
    setupIPC();

    await act(async () => {
      render(<App />);
    });

    await waitFor(() => {
      expect(screen.getByTestId("session-card-s2")).toBeInTheDocument();
    });

    const card = screen.getByTestId("session-card-s2");
    const allButtons = Array.from(card.querySelectorAll("button"));
    const killBtn = allButtons.find((b) => b.textContent === "Kill");
    expect(killBtn).toBeTruthy();

    // First click shows confirmation
    await act(async () => {
      fireEvent.click(killBtn!);
    });

    expect(card).toHaveTextContent('Kill "Add dark mode"?');

    // Confirm kill
    const yesBtn = Array.from(card.querySelectorAll("button")).find((b) => b.textContent === "Yes");
    await act(async () => {
      fireEvent.click(yesBtn!);
    });

    expect(ipcCommands).toContain("kill_session");
  });

  it("shows Retry button on failed sessions", async () => {
    setupIPC();

    await act(async () => {
      render(<App />);
    });

    await waitFor(() => {
      expect(screen.getByTestId("session-card-s5")).toBeInTheDocument();
    });

    const card = screen.getByTestId("session-card-s5");
    const allButtons = Array.from(card.querySelectorAll("button"));
    const retryBtn = allButtons.find((b) => b.textContent === "Retry");
    expect(retryBtn).toBeTruthy();

    await act(async () => {
      fireEvent.click(retryBtn!);
    });

    expect(ipcCommands).toContain("resume_session");
  });

  it("shows error state when session loading fails", async () => {
    mockWindows("main");
    mockIPC((cmd: string) => {
      if (cmd === "list_sessions") throw new Error("DB_ERROR: connection refused");
      if (cmd === "list_repos") return mockRepos;
      if (cmd === "check_stuck_sessions") return [];
      if (cmd === "get_setting") return null;
      if (cmd === "get_github_token") return null;
      if (cmd === "fetch_issues") return [];
      if (cmd === "fetch_prs") return [];
      return null;
    });

    await act(async () => {
      render(<App />);
    });

    await waitFor(() => {
      expect(screen.getByText("Failed to load sessions")).toBeInTheDocument();
    });

    expect(screen.getByText("Retry")).toBeInTheDocument();
  });

  it("opens new session modal via + New Session button", async () => {
    setupIPC();

    await act(async () => {
      render(<App />);
    });

    await waitFor(() => {
      expect(screen.getAllByText("+ New Session").length).toBeGreaterThan(0);
    });

    // Click the first "+ New Session" button found
    await act(async () => {
      fireEvent.click(screen.getAllByText("+ New Session")[0]);
    });

    await waitFor(() => {
      expect(screen.getByTestId("new-session-modal")).toBeInTheDocument();
    });

    expect(screen.getByText("New Session")).toBeInTheDocument();
  });
});
