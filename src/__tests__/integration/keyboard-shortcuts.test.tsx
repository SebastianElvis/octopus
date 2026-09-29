/**
 * Integration tests for keyboard shortcuts.
 *
 * Verifies that Cmd+K, Cmd+N, Cmd+1, and Escape work correctly
 * when the full App component is rendered with mocked IPC.
 */
import { render, screen, act, fireEvent, waitFor } from "@testing-library/react";
import { mockIPC, mockWindows } from "@tauri-apps/api/mocks";
import App from "../../App";
import { useSessionStore } from "../../stores/sessionStore";
import { useRepoStore } from "../../stores/repoStore";
import { useUIStore } from "../../stores/uiStore";

let mockSessions: unknown[] = [];

beforeEach(() => {
  localStorage.setItem("tmt-onboarding-completed", "true");
  mockSessions = [];

  useSessionStore.setState({
    sessions: [],
    outputBuffers: {},
    sessionsLoading: true,
    sessionsError: null,
  });
  useRepoStore.setState({
    repos: [
      {
        id: "repo-1",
        githubUrl: "https://github.com/test/repo",
        localPath: "/tmp/repo",
        defaultBranch: "main",
        addedAt: Date.now(),
      },
    ],
  });
  useUIStore.setState({ sidebarCollapsed: false });

  mockWindows("main");
  mockIPC((cmd: string) => {
    switch (cmd) {
      case "list_sessions":
        return mockSessions;
      case "list_repos":
        return [
          {
            id: "repo-1",
            githubUrl: "https://github.com/test/repo",
            localPath: "/tmp/repo",
            defaultBranch: "main",
            addedAt: Date.now(),
          },
        ];
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
      case "interrupt_session":
        return null;
      case "write_to_session":
        return null;
      case "scan_slash_commands":
        return [];
      case "read_session_events":
        return [];
      default:
        return null;
    }
  });
});

afterEach(() => {
  localStorage.clear();
});

describe("Keyboard shortcuts", () => {
  it("Cmd+K toggles the command palette", async () => {
    await act(async () => {
      render(<App />);
    });

    await waitFor(() => {
      expect(screen.getByText("Octopus")).toBeInTheDocument();
    });

    // Open command palette
    await act(async () => {
      fireEvent.keyDown(window, { key: "k", metaKey: true });
    });

    await waitFor(() => {
      expect(screen.getByTestId("command-palette")).toBeInTheDocument();
    });

    // Close with Escape
    await act(async () => {
      fireEvent.keyDown(window, { key: "Escape" });
    });

    await waitFor(() => {
      expect(screen.queryByTestId("command-palette")).not.toBeInTheDocument();
    });
  });

  it("Cmd+1 navigates to Home view", async () => {
    await act(async () => {
      render(<App />);
    });

    await waitFor(() => {
      expect(screen.getByTestId("nav-home")).toBeInTheDocument();
    });

    // Navigate somewhere else first via + Add Repo
    const addRepoBtn = screen.getByTestId("add-repo-button");
    await act(async () => {
      fireEvent.click(addRepoBtn);
    });

    // Back to home with Cmd+1
    await act(async () => {
      fireEvent.keyDown(window, { key: "1", metaKey: true });
    });

    const homeNav = screen.getByTestId("nav-home");
    expect(homeNav.className).toContain("bg-hover");
  });

  it("Ctrl+O toggles verbose mode globally", async () => {
    await act(async () => {
      render(<App />);
    });

    expect(useUIStore.getState().verboseMode).toBe(false);

    await act(async () => {
      fireEvent.keyDown(window, { key: "o", ctrlKey: true });
    });
    expect(useUIStore.getState().verboseMode).toBe(true);

    await act(async () => {
      fireEvent.keyDown(window, { key: "o", ctrlKey: true });
    });
    expect(useUIStore.getState().verboseMode).toBe(false);
  });

  it("Shift+Tab cycles permission modes when viewing a session", async () => {
    mockSessions = [
      {
        id: "s1",
        name: "Test Session",
        repo: "repo-1",
        repoId: "repo-1",
        branch: "main",
        status: "attention",
        stateChangedAt: new Date().toISOString(),
      },
    ];

    await act(async () => {
      render(<App />);
    });

    // Navigate to session
    const card = screen.getAllByText("Test Session")[0];
    await act(async () => {
      fireEvent.click(card);
    });

    expect(useSessionStore.getState().sessionModes.s1 ?? "default").toBe("default");

    await act(async () => {
      fireEvent.keyDown(window, { key: "Tab", shiftKey: true });
    });
    expect(useSessionStore.getState().sessionModes.s1).toBe("accept-edits");

    await act(async () => {
      fireEvent.keyDown(window, { key: "Tab", shiftKey: true });
    });
    expect(useSessionStore.getState().sessionModes.s1).toBe("plan");
  });

  it("Ctrl+L clears session messages when viewing a session", async () => {
    mockSessions = [
      {
        id: "s1",
        name: "Test Session",
        repo: "repo-1",
        repoId: "repo-1",
        branch: "main",
        status: "running",
        stateChangedAt: new Date().toISOString(),
      },
    ];

    useSessionStore.setState({
      messageBuffers: {
        s1: [{ id: "m1", role: "assistant", blocks: [], timestamp: 1 }],
      },
      outputBuffers: {
        s1: ["some output"],
      },
    });

    await act(async () => {
      render(<App />);
    });

    const card = screen.getAllByText("Test Session")[0];
    await act(async () => {
      fireEvent.click(card);
    });

    await act(async () => {
      fireEvent.keyDown(window, { key: "l", ctrlKey: true });
    });

    expect(useSessionStore.getState().messageBuffers.s1).toEqual([]);
    expect(useSessionStore.getState().outputBuffers.s1).toEqual([]);
  });

  it("Cmd+? toggles keyboard shortcuts overlay for discoverability", async () => {
    await act(async () => {
      render(<App />);
    });

    expect(screen.queryByText("Keyboard Shortcuts")).not.toBeInTheDocument();

    await act(async () => {
      fireEvent.keyDown(window, { key: "?", metaKey: true });
    });

    expect(screen.getByText("Keyboard Shortcuts")).toBeInTheDocument();
    expect(screen.getByText("Toggle verbose output")).toBeInTheDocument();
    expect(screen.getByText("Cycle permission modes")).toBeInTheDocument();

    await act(async () => {
      fireEvent.keyDown(window, { key: "Escape" });
    });

    expect(screen.queryByText("Keyboard Shortcuts")).not.toBeInTheDocument();
  });

  it("respects keybindings.json overrides from storage", async () => {
    localStorage.setItem(
      "keybindings.json",
      JSON.stringify({
        "toggle-verbose": "Ctrl+Shift+V",
      }),
    );

    const { getKeybinding } = await import("../../lib/keybindings");
    const kb = getKeybinding("toggle-verbose");
    expect(kb?.keys).toBe("Ctrl+Shift+V");
  });
});
