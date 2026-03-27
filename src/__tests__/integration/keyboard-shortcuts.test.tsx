/**
 * Integration tests for keyboard shortcuts.
 *
 * Verifies that Cmd+K, Cmd+N, Cmd+1/2/3, and Escape work correctly
 * when the full App component is rendered with mocked IPC.
 */
import { render, screen, act, fireEvent, waitFor } from "@testing-library/react";
import { mockIPC, mockWindows } from "@tauri-apps/api/mocks";
import App from "../../App";
import { useSessionStore } from "../../stores/sessionStore";
import { useRepoStore } from "../../stores/repoStore";
import { useUIStore } from "../../stores/uiStore";

beforeEach(() => {
  localStorage.setItem("tmt-onboarding-completed", "true");

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
        return [];
      case "list_repos":
        return [];
      case "check_stuck_sessions":
        return [];
      case "check_prerequisites":
        return { claude: true, git: true, gh: true };
      case "get_setting":
        return null;
      case "get_github_token":
        return null;
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
      expect(screen.getByText("TooManyTabs")).toBeInTheDocument();
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

  it("Cmd+2 navigates to Tasks view", async () => {
    await act(async () => {
      render(<App />);
    });

    await waitFor(() => {
      expect(screen.getByTestId("nav-home")).toBeInTheDocument();
    });

    await act(async () => {
      fireEvent.keyDown(window, { key: "2", metaKey: true });
    });

    // Tasks nav should be active
    const tasksNav = screen.getByTestId("nav-tasks");
    expect(tasksNav.className).toContain("bg-gray-100");
  });

  it("Cmd+3 navigates to Repos view", async () => {
    await act(async () => {
      render(<App />);
    });

    await waitFor(() => {
      expect(screen.getByTestId("nav-home")).toBeInTheDocument();
    });

    await act(async () => {
      fireEvent.keyDown(window, { key: "3", metaKey: true });
    });

    // Repos nav should be active
    const reposNav = screen.getByTestId("nav-repos");
    expect(reposNav.className).toContain("bg-gray-100");
  });

  it("Cmd+1 returns to Home from Repos view", async () => {
    await act(async () => {
      render(<App />);
    });

    await waitFor(() => {
      expect(screen.getByTestId("nav-home")).toBeInTheDocument();
    });

    // Go to repos
    await act(async () => {
      fireEvent.keyDown(window, { key: "3", metaKey: true });
    });

    // Back to home
    await act(async () => {
      fireEvent.keyDown(window, { key: "1", metaKey: true });
    });

    const homeNav = screen.getByTestId("nav-home");
    expect(homeNav.className).toContain("bg-gray-100");
  });
});
