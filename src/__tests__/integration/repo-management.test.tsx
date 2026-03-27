/**
 * Integration tests for repository management.
 *
 * Covers the repos view: listing repos, adding a repo via IPC,
 * removing a repo, empty state, and error handling.
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

async function navigateToRepos() {
  await act(async () => {
    render(<App />);
  });

  await waitFor(() => {
    expect(screen.getByTestId("nav-repos")).toBeInTheDocument();
  });

  await act(async () => {
    fireEvent.click(screen.getByTestId("nav-repos"));
  });

  await waitFor(() => {
    expect(screen.getByText("Repositories")).toBeInTheDocument();
  });
}

describe("Repo management", () => {
  it("displays existing repos with URL, path, and default branch", async () => {
    setupIPC();
    await navigateToRepos();

    expect(screen.getByText("https://github.com/test/frontend")).toBeInTheDocument();
    expect(screen.getByText("/Users/me/code/frontend")).toBeInTheDocument();
    expect(screen.getByText("Default branch: main")).toBeInTheDocument();
  });

  it("shows empty state when no repos exist", async () => {
    setupIPC([]);
    await navigateToRepos();

    expect(screen.getByText("No repositories connected yet.")).toBeInTheDocument();
  });

  it("opens add repo form when clicking + Add Repo", async () => {
    setupIPC();
    await navigateToRepos();

    await act(async () => {
      fireEvent.click(screen.getByText("+ Add Repo"));
    });

    expect(screen.getByText("Add Repository")).toBeInTheDocument();
    expect(screen.getByPlaceholderText("owner/repo")).toBeInTheDocument();
  });

  it("adds a repo via IPC", async () => {
    setupIPC();
    await navigateToRepos();

    await act(async () => {
      fireEvent.click(screen.getByText("+ Add Repo"));
    });

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

  it("closes add form via Cancel button", async () => {
    setupIPC();
    await navigateToRepos();

    await act(async () => {
      fireEvent.click(screen.getByText("+ Add Repo"));
    });

    expect(screen.getByText("Add Repository")).toBeInTheDocument();

    await act(async () => {
      // There are two Cancel buttons (modal header and form), click the form one
      const cancelButtons = screen.getAllByText("Cancel");
      fireEvent.click(cancelButtons[cancelButtons.length - 1]);
    });

    expect(screen.queryByText("Add Repository")).not.toBeInTheDocument();
  });

  it("shows Remove button and calls IPC on click", async () => {
    setupIPC();
    await navigateToRepos();

    const removeBtn = screen.getByText("Remove");
    expect(removeBtn).toBeInTheDocument();

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
