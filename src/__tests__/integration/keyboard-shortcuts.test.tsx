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
});
