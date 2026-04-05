/**
 * Integration tests for the first-time onboarding flow.
 *
 * Verifies that new users see the onboarding dialog, can step through it,
 * and that returning users skip it.
 */
import { render, screen, act, fireEvent, waitFor } from "@testing-library/react";
import { mockIPC, mockWindows } from "@tauri-apps/api/mocks";
import App from "../../App";
import { useSessionStore } from "../../stores/sessionStore";
import { useRepoStore } from "../../stores/repoStore";
import { useUIStore } from "../../stores/uiStore";

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

function setupDefaultIPC() {
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
}

beforeEach(() => {
  resetStores();
  setupDefaultIPC();
});

afterEach(() => {
  localStorage.clear();
});

describe("Onboarding flow", () => {
  it("shows onboarding dialog on first launch", async () => {
    // Do NOT set tmt-onboarding-completed
    await act(async () => {
      render(<App />);
    });

    await waitFor(() => {
      expect(screen.getByTestId("onboarding-dialog")).toBeInTheDocument();
    });

    // "Welcome to TooManyTabs" may appear in both onboarding dialog and empty state
    const dialog = screen.getByTestId("onboarding-dialog");
    expect(dialog).toHaveTextContent("Welcome to TooManyTabs");
    expect(screen.getByText("01 / check prerequisites")).toBeInTheDocument();
  });

  it("skips onboarding for returning users", async () => {
    localStorage.setItem("tmt-onboarding-completed", "true");

    await act(async () => {
      render(<App />);
    });

    await waitFor(() => {
      expect(screen.getByText("TooManyTabs")).toBeInTheDocument();
    });

    expect(screen.queryByTestId("onboarding-dialog")).not.toBeInTheDocument();
  });

  it("advances through onboarding steps when prerequisites pass", async () => {
    await act(async () => {
      render(<App />);
    });

    await waitFor(() => {
      expect(screen.getByTestId("onboarding-dialog")).toBeInTheDocument();
    });

    // Step 1: prerequisites check auto-passes (mocked check_prerequisites returns all true)
    // Wait for the Next button to become enabled
    await waitFor(() => {
      const nextBtn = screen.getByText("Next");
      expect(nextBtn).not.toBeDisabled();
    });

    // Advance to step 2
    await act(async () => {
      fireEvent.click(screen.getByText("Next"));
    });

    expect(screen.getByText("02 / connect a repository")).toBeInTheDocument();

    // Skip to step 3
    await act(async () => {
      fireEvent.click(screen.getByText("Skip"));
    });

    expect(screen.getByText("03 / create your first session")).toBeInTheDocument();

    // Skip to step 4
    await act(async () => {
      fireEvent.click(screen.getByText("Skip"));
    });

    expect(screen.getByText("04 / the dispatch board")).toBeInTheDocument();
  });

  it("dismisses onboarding via close button and persists", async () => {
    await act(async () => {
      render(<App />);
    });

    await waitFor(() => {
      expect(screen.getByTestId("onboarding-dialog")).toBeInTheDocument();
    });

    // Click the X close button (first button with SVG in the dialog header)
    const dialog = screen.getByTestId("onboarding-dialog");
    const closeBtn = dialog.querySelectorAll("button")[0];
    await act(async () => {
      fireEvent.click(closeBtn);
    });

    await waitFor(() => {
      expect(screen.queryByTestId("onboarding-dialog")).not.toBeInTheDocument();
    });

    // Verify persistence
    expect(localStorage.getItem("tmt-onboarding-completed")).toBe("true");
  });

  it("onboarding step 2 can open add repo dialog", async () => {
    await act(async () => {
      render(<App />);
    });

    await waitFor(() => {
      const nextBtn = screen.getByText("Next");
      expect(nextBtn).not.toBeDisabled();
    });

    await act(async () => {
      fireEvent.click(screen.getByText("Next"));
    });

    // Click "Open Repo Settings" — should dismiss onboarding and open add repo dialog
    await act(async () => {
      fireEvent.click(screen.getByText("Open Repo Settings"));
    });

    await waitFor(() => {
      expect(screen.queryByTestId("onboarding-dialog")).not.toBeInTheDocument();
    });

    expect(screen.getByText("Add Repository")).toBeInTheDocument();
  });
});
