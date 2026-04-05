/**
 * Integration tests for the Claude structured output panel.
 *
 * Covers: navigation to session detail, structured event rendering (including
 * stream_event wrapper), message persistence across tab switches, history
 * loading from backend, and full conversation flow.
 */
import { render, screen, act, fireEvent, waitFor } from "@testing-library/react";
import { mockIPC, mockWindows } from "@tauri-apps/api/mocks";
import type { BackendSession, ClaudeStreamEvent } from "../../lib/types";
import App from "../../App";
import { useSessionStore } from "../../stores/sessionStore";
import { useRepoStore } from "../../stores/repoStore";
import { useUIStore } from "../../stores/uiStore";
import { useEditorStore } from "../../stores/editorStore";

const mockRepos = [
  {
    id: "repo-1",
    githubUrl: "https://github.com/test/repo",
    localPath: "/tmp/repo",
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
      status: "running",
      stateChangedAt: new Date().toISOString(),
    },
    {
      id: "s2",
      repoId: "repo-1",
      name: "Waiting session",
      branch: "waiting-branch",
      status: "attention",
      blockType: "permission",
      lastMessage: "Claude wants to edit main.ts",
      stateChangedAt: new Date().toISOString(),
    },
    {
      id: "s3",
      repoId: "repo-1",
      name: "Completed task",
      branch: "done-branch",
      status: "done",
      stateChangedAt: new Date().toISOString(),
    },
  ];
}

/** Backend history events returned by read_session_events for session s3 */
const completedSessionHistory: ClaudeStreamEvent[] = [
  { type: "system", subtype: "init", session_id: "s3" },
  {
    type: "assistant",
    message: {
      role: "assistant",
      content: [{ type: "text", text: "Task completed from history." }],
    },
  },
  { type: "result", subtype: "success", result: "All done" },
];

function resetStores() {
  useSessionStore.setState({
    sessions: [],
    outputBuffers: {},
    messageBuffers: {},
    streamingMessage: {},
    sessionsLoading: true,
    sessionsError: null,
  });
  useRepoStore.setState({ repos: [] });
  useUIStore.setState({ sidebarCollapsed: false, rightPanelCollapsed: true });
  useEditorStore.setState({ tabs: [], activeTabId: null, contents: {} });
}

function setupIPC(
  sessions: BackendSession[] = makeSessions(),
  historyEvents: Record<string, ClaudeStreamEvent[]> = {},
) {
  mockWindows("main");
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  mockIPC((cmd: string, args?: any) => {
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
      case "respond_to_session":
        return null;
      case "interrupt_session":
        return null;
      case "scan_slash_commands":
        return [];
      case "read_session_events": {
        const id = (args as { id: string } | undefined)?.id ?? "";
        return historyEvents[id] ?? [];
      }
      default:
        return null;
    }
  });
}

beforeEach(() => {
  localStorage.setItem("tmt-onboarding-completed", "true");
  resetStores();
});

afterEach(() => {
  localStorage.clear();
});

describe("Claude output integration", () => {
  it("shows Claude tab as default when navigating to a session", async () => {
    setupIPC();

    await act(async () => {
      render(<App />);
    });

    await waitFor(() => {
      expect(screen.getAllByText("Fix login form").length).toBeGreaterThan(0);
    });

    await act(async () => {
      fireEvent.click(screen.getByTestId("session-card-s1"));
    });

    await waitFor(() => {
      expect(screen.getByText("Claude")).toBeInTheDocument();
    });
    expect(screen.queryByText("Raw")).not.toBeInTheDocument();
  });

  it("shows waiting output and empty state when no messages", async () => {
    setupIPC();

    await act(async () => {
      render(<App />);
    });

    await waitFor(() => {
      expect(screen.getAllByText("Fix login form").length).toBeGreaterThan(0);
    });

    await act(async () => {
      fireEvent.click(screen.getByTestId("session-card-s1"));
    });

    await waitFor(() => {
      expect(screen.getByText("Waiting for Claude output...")).toBeInTheDocument();
    });
  });

  it("renders structured messages from the store in session detail", async () => {
    setupIPC();

    useSessionStore.setState({
      messageBuffers: {
        s1: [
          {
            id: "msg-init",
            role: "system",
            blocks: [{ type: "text", text: "Session initialized" }],
            timestamp: Date.now(),
          },
          {
            id: "msg-1",
            role: "assistant",
            blocks: [{ type: "text", text: "I will fix the login form now." }],
            timestamp: Date.now(),
            isStreaming: false,
          },
        ],
      },
      streamingMessage: { s1: null },
    });

    await act(async () => {
      render(<App />);
    });

    await waitFor(() => {
      expect(screen.getAllByText("Fix login form").length).toBeGreaterThan(0);
    });

    await act(async () => {
      fireEvent.click(screen.getByTestId("session-card-s1"));
    });

    await waitFor(() => {
      expect(screen.getByText("Session initialized")).toBeInTheDocument();
      expect(screen.getByText("I will fix the login form now.")).toBeInTheDocument();
    });
  });

  it("shows permission UI for waiting session with permission blockType", async () => {
    setupIPC();

    await act(async () => {
      render(<App />);
    });

    await waitFor(() => {
      expect(screen.getAllByText("Waiting session").length).toBeGreaterThan(0);
    });

    await act(async () => {
      fireEvent.click(screen.getByTestId("session-card-s2"));
    });

    await waitFor(() => {
      expect(screen.getByText("Permission Required")).toBeInTheDocument();
    });

    expect(screen.getByText("Claude wants to edit main.ts")).toBeInTheDocument();
  });

  it("shows completion status for completed session", async () => {
    setupIPC();

    await act(async () => {
      render(<App />);
    });

    await waitFor(() => {
      expect(screen.getAllByText("Completed task").length).toBeGreaterThan(0);
    });

    await act(async () => {
      fireEvent.click(screen.getByTestId("session-card-s3"));
    });

    await waitFor(() => {
      expect(screen.getByText("Session done")).toBeInTheDocument();
    });
  });

  it("can navigate back to board from session detail", async () => {
    setupIPC();

    await act(async () => {
      render(<App />);
    });

    await waitFor(() => {
      expect(screen.getAllByText("Fix login form").length).toBeGreaterThan(0);
    });

    await act(async () => {
      fireEvent.click(screen.getByTestId("session-card-s1"));
    });

    await waitFor(() => {
      expect(screen.getByText("← Board")).toBeInTheDocument();
    });

    await act(async () => {
      fireEvent.click(screen.getByText("← Board"));
    });

    await waitFor(() => {
      expect(screen.getByText("Needs Input")).toBeInTheDocument();
    });
  });

  it("processes structured events added to store and renders them", async () => {
    setupIPC();

    await act(async () => {
      render(<App />);
    });

    await waitFor(() => {
      expect(screen.getAllByText("Fix login form").length).toBeGreaterThan(0);
    });

    await act(async () => {
      fireEvent.click(screen.getByTestId("session-card-s1"));
    });

    // Simulate system init event
    await act(async () => {
      useSessionStore.getState().appendStructuredEvent("s1", {
        type: "system",
        subtype: "init",
        session_id: "s1",
      });
    });

    await waitFor(() => {
      expect(screen.getByText("Session initialized")).toBeInTheDocument();
    });

    // Add an assistant message
    await act(async () => {
      useSessionStore.getState().appendStructuredEvent("s1", {
        type: "assistant",
        message: {
          role: "assistant",
          content: [{ type: "text", text: "I found the issue in the login form." }],
        },
      });
    });

    await waitFor(() => {
      expect(screen.getByText("I found the issue in the login form.")).toBeInTheDocument();
    });
  });

  it("processes stream_event wrapped events (real CLI format)", async () => {
    setupIPC();

    await act(async () => {
      render(<App />);
    });

    await waitFor(() => {
      expect(screen.getAllByText("Fix login form").length).toBeGreaterThan(0);
    });

    await act(async () => {
      fireEvent.click(screen.getByTestId("session-card-s1"));
    });

    // Simulate the real stream_event wrapper format that Claude CLI outputs
    await act(async () => {
      // content_block_start wrapped in stream_event
      useSessionStore.getState().appendStructuredEvent("s1", {
        type: "stream_event",
        event: {
          type: "content_block_start",
          index: 0,
          content_block: { type: "text", text: "Starting " },
        },
      } as ClaudeStreamEvent);

      // content_block_delta wrapped in stream_event
      useSessionStore.getState().appendStructuredEvent("s1", {
        type: "stream_event",
        event: {
          type: "content_block_delta",
          index: 0,
          delta: { type: "text_delta", text: "analysis of your code." },
        },
      } as ClaudeStreamEvent);
    });

    // The streaming message should be visible with accumulated text
    await waitFor(() => {
      expect(screen.getByText("Starting analysis of your code.")).toBeInTheDocument();
    });

    // Finalize with an assistant message
    await act(async () => {
      useSessionStore.getState().appendStructuredEvent("s1", {
        type: "assistant",
        message: {
          role: "assistant",
          content: [{ type: "text", text: "Starting analysis of your code." }],
        },
      });
    });

    // After assistant event, the message should still be visible (now finalized)
    await waitFor(() => {
      expect(screen.getByText("Starting analysis of your code.")).toBeInTheDocument();
    });
  });

  it("preserves messages when switching sessions and coming back", async () => {
    setupIPC();

    // Pre-populate messages for s1
    useSessionStore.setState({
      messageBuffers: {
        s1: [
          {
            id: "msg-1",
            role: "assistant",
            blocks: [{ type: "text", text: "Message that should persist" }],
            timestamp: Date.now(),
            isStreaming: false,
          },
        ],
      },
      streamingMessage: { s1: null },
    });

    await act(async () => {
      render(<App />);
    });

    await waitFor(() => {
      expect(screen.getAllByText("Fix login form").length).toBeGreaterThan(0);
    });

    // Navigate to session s1
    await act(async () => {
      fireEvent.click(screen.getByTestId("session-card-s1"));
    });

    await waitFor(() => {
      expect(screen.getByText("Message that should persist")).toBeInTheDocument();
    });

    // Go back to board
    await act(async () => {
      fireEvent.click(screen.getByText("← Board"));
    });

    await waitFor(() => {
      expect(screen.getByText("Needs Input")).toBeInTheDocument();
    });

    // Navigate to s2 (different session)
    await act(async () => {
      fireEvent.click(screen.getByTestId("session-card-s2"));
    });

    // Go back
    await act(async () => {
      fireEvent.click(screen.getByText("← Board"));
    });

    await waitFor(() => {
      expect(screen.getByText("Needs Input")).toBeInTheDocument();
    });

    // Navigate back to s1 — messages should still be there
    await act(async () => {
      fireEvent.click(screen.getByTestId("session-card-s1"));
    });

    await waitFor(() => {
      expect(screen.getByText("Message that should persist")).toBeInTheDocument();
    });
  });

  it("loads session history from backend via read_session_events", async () => {
    // Provide history events for s3 via the IPC mock
    setupIPC(makeSessions(), { s3: completedSessionHistory });

    await act(async () => {
      render(<App />);
    });

    await waitFor(() => {
      expect(screen.getAllByText("Completed task").length).toBeGreaterThan(0);
    });

    // Navigate to the completed session — it has no in-memory messages
    // but should load history from the backend
    await act(async () => {
      fireEvent.click(screen.getByTestId("session-card-s3"));
    });

    // History should be loaded and rendered
    await waitFor(() => {
      expect(screen.getByText("Task completed from history.")).toBeInTheDocument();
    });
  });

  it("renders a full conversation flow: system → streaming → assistant → result", async () => {
    setupIPC();

    await act(async () => {
      render(<App />);
    });

    await waitFor(() => {
      expect(screen.getAllByText("Fix login form").length).toBeGreaterThan(0);
    });

    await act(async () => {
      fireEvent.click(screen.getByTestId("session-card-s1"));
    });

    // Full flow simulating real Claude CLI output
    await act(async () => {
      const store = useSessionStore.getState();

      // 1. System init
      store.appendStructuredEvent("s1", {
        type: "system",
        subtype: "init",
        session_id: "s1",
      });

      // 2. Streaming content via stream_event wrapper
      store.appendStructuredEvent("s1", {
        type: "stream_event",
        event: {
          type: "content_block_start",
          index: 0,
          content_block: { type: "text", text: "Let me " },
        },
      } as ClaudeStreamEvent);

      store.appendStructuredEvent("s1", {
        type: "stream_event",
        event: {
          type: "content_block_delta",
          index: 0,
          delta: { type: "text_delta", text: "fix that bug." },
        },
      } as ClaudeStreamEvent);

      // 3. Complete assistant message (replaces streaming)
      store.appendStructuredEvent("s1", {
        type: "assistant",
        message: {
          role: "assistant",
          content: [{ type: "text", text: "Let me fix that bug." }],
        },
      });

      // 4. Result
      store.appendStructuredEvent("s1", {
        type: "result",
        subtype: "success",
        result: "Bug fixed successfully",
      });
    });

    await waitFor(() => {
      expect(screen.getByText("Session initialized")).toBeInTheDocument();
      expect(screen.getByText("Let me fix that bug.")).toBeInTheDocument();
      expect(screen.getByText("Bug fixed successfully")).toBeInTheDocument();
    });
  });

  it("renders tool_use blocks from stream_event wrapper", async () => {
    setupIPC();

    await act(async () => {
      render(<App />);
    });

    await waitFor(() => {
      expect(screen.getAllByText("Fix login form").length).toBeGreaterThan(0);
    });

    await act(async () => {
      fireEvent.click(screen.getByTestId("session-card-s1"));
    });

    // Add a complete assistant message with a tool_use block
    await act(async () => {
      useSessionStore.getState().appendStructuredEvent("s1", {
        type: "assistant",
        message: {
          role: "assistant",
          content: [
            { type: "text", text: "I need to read a file." },
            {
              type: "tool_use",
              id: "tool-1",
              name: "Read",
              input: { file_path: "/src/login.ts" },
            },
          ],
        },
      });
    });

    await waitFor(() => {
      expect(screen.getByText("I need to read a file.")).toBeInTheDocument();
      // Tool use block should show the tool name
      expect(screen.getByText("Read")).toBeInTheDocument();
    });
  });

  it("handles batch events correctly", async () => {
    setupIPC();

    await act(async () => {
      render(<App />);
    });

    await waitFor(() => {
      expect(screen.getAllByText("Fix login form").length).toBeGreaterThan(0);
    });

    await act(async () => {
      fireEvent.click(screen.getByTestId("session-card-s1"));
    });

    // Simulate batched events (as the requestAnimationFrame handler does)
    await act(async () => {
      useSessionStore.getState().appendStructuredEvents([
        {
          sessionId: "s1",
          event: { type: "system", subtype: "init", session_id: "s1" } as ClaudeStreamEvent,
        },
        {
          sessionId: "s1",
          event: {
            type: "stream_event",
            event: {
              type: "content_block_start",
              index: 0,
              content_block: { type: "text", text: "Batched message" },
            },
          } as ClaudeStreamEvent,
        },
      ]);
    });

    await waitFor(() => {
      expect(screen.getByText("Session initialized")).toBeInTheDocument();
      expect(screen.getByText("Batched message")).toBeInTheDocument();
    });
  });
});
