/**
 * Integration tests for repository management.
 *
 * Covers the add-repo dialog: opening via sidebar button, adding a repo via IPC,
 * cancelling, and removing a repo from the sidebar.
 */
import { render, screen, act, fireEvent, waitFor } from "@testing-library/react";
import { mockIPC, mockWindows } from "@tauri-apps/api/mocks";
import App from "../../App";
import { useSessionStore } from "../../stores/sessionStore";
import { useRepoStore } from "../../stores/repoStore";
import { useUIStore } from "../../stores/uiStore";

let ipcCalls: { cmd: string; args?: Record<string, unknown> }[] = [];

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

const existingRepos = [
  {
    id: "repo-1",
    githubUrl: "https://github.com/test/frontend",
    localPath: "/Users/me/code/frontend",
    defaultBranch: "main",
    addedAt: Date.now(),
  },
];

beforeEach(() => {
  localStorage.setItem("tmt-onboarding-completed", "true");
  ipcCalls = [];
  resetStores();
});

afterEach(() => {
  localStorage.clear();
});

function setupIPC(repos = existingRepos) {
  mockWindows("main");
  mockIPC((cmd: string, args?: Record<string, unknown>) => {
    ipcCalls.push({ cmd, args });
    switch (cmd) {
      case "list_sessions":
        return [];
      case "list_repos":
        return repos;
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
      case "add_repo":
        return {
          id: "repo-new",
          githubUrl: args?.githubUrl as string,
          localPath: args?.localPath ?? "/tmp/cloned",
          defaultBranch: "main",
          addedAt: Date.now(),
        };
      case "remove_repo":
        return null;
      default:
        return null;
    }
  });
}

async function openAddRepoDialog() {
  await act(async () => {
    render(<App />);
  });

  // Click the + Add Repo button in the sidebar to open the dialog
  await waitFor(() => {
    expect(screen.getByTestId("add-repo-button")).toBeInTheDocument();
  });

  await act(async () => {
    fireEvent.click(screen.getByTestId("add-repo-button"));
  });

  await waitFor(() => {
    expect(screen.getByText("Add Repository")).toBeInTheDocument();
  });
}

describe("Repo management", () => {
  it("opens add repo dialog when clicking + Add Repo in sidebar", async () => {
    setupIPC();
    await openAddRepoDialog();

    expect(screen.getByText("Add Repository")).toBeInTheDocument();
    expect(screen.getByPlaceholderText("owner/repo")).toBeInTheDocument();
  });

  it("adds a repo via IPC", async () => {
    setupIPC();
    await openAddRepoDialog();

    const urlInput = screen.getByPlaceholderText("owner/repo");
    await act(async () => {
      fireEvent.change(urlInput, { target: { value: "test/newrepo" } });
    });

    await act(async () => {
      fireEvent.click(screen.getByText("Add"));
    });

    // Verify add_repo was called
    await waitFor(() => {
      const addCall = ipcCalls.find((c) => c.cmd === "add_repo");
      expect(addCall).toBeTruthy();
      expect(addCall!.args?.githubUrl).toBe("https://github.com/test/newrepo");
    });
  });

  it("closes add repo dialog via Cancel button", async () => {
    setupIPC();
    await openAddRepoDialog();

    expect(screen.getByText("Add Repository")).toBeInTheDocument();

    await act(async () => {
      fireEvent.click(screen.getByText("Cancel"));
    });

    expect(screen.queryByText("Add Repository")).not.toBeInTheDocument();
  });

  it("removes a repo from sidebar via IPC", async () => {
    setupIPC();
    await act(async () => {
      render(<App />);
    });

    // Wait for repo to appear in sidebar
    await waitFor(() => {
      expect(screen.getByText("test/frontend")).toBeInTheDocument();
    });

    // Click the remove button (X icon) on the repo in the sidebar
    const removeBtn = screen.getByTitle("Remove repo");
    await act(async () => {
      fireEvent.click(removeBtn);
    });

    await waitFor(() => {
      const removeCall = ipcCalls.find((c) => c.cmd === "remove_repo");
      expect(removeCall).toBeTruthy();
      expect(removeCall!.args?.id).toBe("repo-1");
    });
  });
});
