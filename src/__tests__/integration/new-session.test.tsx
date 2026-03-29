/**
 * Integration tests for new session creation.
 *
 * Covers the new session modal: repo selection, issue/PR linking,
 * prompt editing, session spawning via IPC, and error handling.
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
    githubUrl: "https://github.com/test/myapp",
    localPath: "/tmp/myapp",
    defaultBranch: "main",
    addedAt: Date.now(),
  },
];

const mockIssues = [
  {
    number: 42,
    title: "Fix authentication timeout",
    body: "Users get logged out after 5 minutes",
    labels: [{ name: "bug", color: "d73a4a" }],
    state: "open" as const,
    htmlUrl: "https://github.com/test/myapp/issues/42",
    user: "alice",
    comments: 3,
    createdAt: "2026-03-01T00:00:00Z",
    updatedAt: "2026-03-20T00:00:00Z",
  },
];

const mockPRs = [
  {
    number: 55,
    title: "Add rate limiting",
    body: "Implements rate limiting for API endpoints",
    state: "open" as const,
    htmlUrl: "https://github.com/test/myapp/pull/55",
    headRef: "feature/rate-limit",
    baseRef: "main",
    user: "bob",
    comments: 1,
    createdAt: "2026-03-15T00:00:00Z",
    updatedAt: "2026-03-22T00:00:00Z",
  },
];

let spawnedParams: Record<string, unknown> | null = null;

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

function setupIPC() {
  spawnedParams = null;
  mockWindows("main");
  mockIPC((cmd: string, args?: unknown) => {
    switch (cmd) {
      case "list_sessions":
        return [];
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
        return mockIssues;
      case "fetch_prs":
        return mockPRs;
      case "spawn_session": {
        spawnedParams = (args as Record<string, unknown> | null);
        const p = args as { params?: { repoId?: string; name?: string; branch?: string } } | undefined;
        return {
          id: "new-session-1",
          repoId: p?.params?.repoId,
          name: p?.params?.name,
          branch: p?.params?.branch,
          status: "running",
          stateChangedAt: new Date().toISOString(),
        } satisfies BackendSession;
      }
      default:
        return null;
    }
  });
}

beforeEach(() => {
  localStorage.setItem("tmt-onboarding-completed", "true");
  resetStores();
  setupIPC();
});

afterEach(() => {
  localStorage.clear();
});

async function openNewSessionModal() {
  await act(async () => {
    render(<App />);
  });

  // Wait for empty state
  await waitFor(() => {
    expect(screen.getByText("Get Started")).toBeInTheDocument();
  });

  await act(async () => {
    fireEvent.click(screen.getByText("Get Started"));
  });

  await waitFor(() => {
    expect(screen.getByTestId("new-session-modal")).toBeInTheDocument();
  });
}

describe("New session creation", () => {
  it("opens the new session modal and shows repo selector", async () => {
    await openNewSessionModal();

    expect(screen.getByText("Repository")).toBeInTheDocument();
    // The repo URL should be in the select
    expect(screen.getByText("https://github.com/test/myapp")).toBeInTheDocument();
  });

  it("shows issues and PRs in the link dropdown", async () => {
    await openNewSessionModal();

    const linkInput = screen.getByPlaceholderText("Paste URL, type #number, or search...");

    // Focus to open dropdown
    await act(async () => {
      fireEvent.focus(linkInput);
    });

    await waitFor(() => {
      expect(screen.getByText("Fix authentication timeout")).toBeInTheDocument();
    });

    expect(screen.getByText("Add rate limiting")).toBeInTheDocument();
  });

  it("links an issue by typing #number and auto-generates prompt", async () => {
    await openNewSessionModal();

    const linkInput = screen.getByPlaceholderText("Paste URL, type #number, or search...");

    await act(async () => {
      fireEvent.focus(linkInput);
      fireEvent.change(linkInput, { target: { value: "#42" } });
    });

    // Should show the linked issue card
    await waitFor(() => {
      expect(screen.getByText("Fix authentication timeout")).toBeInTheDocument();
    });

    // Prompt should be auto-generated
    const promptArea = screen.getByPlaceholderText("Describe the task for Claude...");
    expect((promptArea as HTMLTextAreaElement).value).toContain("issues/42");
  });

  it("shows branch name preview based on linked issue", async () => {
    await openNewSessionModal();

    const linkInput = screen.getByPlaceholderText("Paste URL, type #number, or search...");

    await act(async () => {
      fireEvent.focus(linkInput);
      fireEvent.change(linkInput, { target: { value: "#42" } });
    });

    await waitFor(() => {
      expect(screen.getByText("Fix authentication timeout")).toBeInTheDocument();
    });

    // Branch preview should contain issue number
    expect(screen.getByText(/issue-42/)).toBeInTheDocument();
  });

  it("creates a session via IPC with correct params", async () => {
    await openNewSessionModal();

    // Write a prompt directly
    const promptArea = screen.getByPlaceholderText("Describe the task for Claude...");
    await act(async () => {
      fireEvent.change(promptArea, { target: { value: "Fix the flaky test in auth.spec.ts" } });
    });

    // Click Create Session
    await act(async () => {
      fireEvent.click(screen.getByText("Create Session"));
    });

    // Modal should close after creation
    await waitFor(() => {
      expect(screen.queryByTestId("new-session-modal")).not.toBeInTheDocument();
    });

    // Verify IPC was called with the params
    expect(spawnedParams).toBeTruthy();
    const params = spawnedParams!.params as Record<string, unknown>;
    expect(params.prompt).toBe("Fix the flaky test in auth.spec.ts");
    expect(params.repoId).toBe("repo-1");
  });

  it("creates a session linked to an issue", async () => {
    await openNewSessionModal();

    const linkInput = screen.getByPlaceholderText("Paste URL, type #number, or search...");

    await act(async () => {
      fireEvent.focus(linkInput);
      fireEvent.change(linkInput, { target: { value: "#42" } });
    });

    await waitFor(() => {
      expect(screen.getByText("Fix authentication timeout")).toBeInTheDocument();
    });

    await act(async () => {
      fireEvent.click(screen.getByText("Create Session"));
    });

    await waitFor(() => {
      expect(screen.queryByTestId("new-session-modal")).not.toBeInTheDocument();
    });

    const params = spawnedParams!.params as Record<string, unknown>;
    expect(params.issueNumber).toBe(42);
    expect(params.branch).toContain("issue-42");
  });

  it("disables Create Session button when prompt is empty", async () => {
    await openNewSessionModal();

    const createBtn = screen.getByText("Create Session");
    expect(createBtn).toBeDisabled();
  });

  it("closes modal via Cancel button", async () => {
    await openNewSessionModal();

    await act(async () => {
      fireEvent.click(screen.getByText("Cancel"));
    });

    await waitFor(() => {
      expect(screen.queryByTestId("new-session-modal")).not.toBeInTheDocument();
    });
  });

  it("shows skip permissions checkbox", async () => {
    await openNewSessionModal();

    expect(screen.getByText("Dangerously skip permissions")).toBeInTheDocument();
    expect(screen.getByRole("checkbox")).not.toBeChecked();
  });
});
