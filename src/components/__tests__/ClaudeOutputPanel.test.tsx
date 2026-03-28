import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { ClaudeOutputPanel } from "../claude/ClaudeOutputPanel";
import { useSessionStore } from "../../stores/sessionStore";
import type { ClaudeMessage } from "../../lib/types";

// Mock react-markdown to avoid ESM issues in jsdom
vi.mock("react-markdown", () => ({
  default: ({ children }: { children: string }) => <span>{children}</span>,
}));
vi.mock("remark-gfm", () => ({ default: () => {} }));

// Mock env and tauri
vi.mock("../../lib/env", () => ({
  isTauri: vi.fn(() => false),
}));
vi.mock("../../lib/tauri", () => ({
  respondToSession: vi.fn(),
  interruptSession: vi.fn(),
  readSessionEvents: vi.fn(() => Promise.resolve([])),
}));

// Mock scrollIntoView
beforeEach(() => {
  Element.prototype.scrollIntoView = vi.fn();
  useSessionStore.setState({
    sessions: [],
    outputBuffers: {},
    messageBuffers: {},
    streamingMessage: {},
    sessionsLoading: false,
    sessionsError: null,
  });
});

describe("ClaudeOutputPanel", () => {
  it("shows 'No messages yet' when empty and not running", async () => {
    render(
      <ClaudeOutputPanel sessionId="s1" sessionStatus="idle" />,
    );
    await waitFor(() => {
      expect(screen.getByText("No messages yet")).toBeInTheDocument();
    });
  });

  it("shows waiting indicator when running with no messages", async () => {
    render(
      <ClaudeOutputPanel sessionId="s1" sessionStatus="running" />,
    );
    await waitFor(() => {
      expect(screen.getByText("Waiting for Claude output...")).toBeInTheDocument();
    });
  });

  it("renders messages from the store", () => {
    const messages: ClaudeMessage[] = [
      {
        id: "msg-1",
        role: "system",
        blocks: [{ type: "text", text: "Session initialized" }],
        timestamp: Date.now(),
      },
      {
        id: "msg-2",
        role: "assistant",
        blocks: [{ type: "text", text: "Hello, I can help!" }],
        timestamp: Date.now(),
        isStreaming: false,
      },
    ];

    useSessionStore.setState({
      messageBuffers: { s1: messages },
      streamingMessage: { s1: null },
    });

    render(
      <ClaudeOutputPanel sessionId="s1" sessionStatus="running" />,
    );

    expect(screen.getByText("Session initialized")).toBeInTheDocument();
    expect(screen.getByText("Hello, I can help!")).toBeInTheDocument();
  });

  it("renders a streaming message alongside completed messages", () => {
    const completedMsg: ClaudeMessage = {
      id: "msg-1",
      role: "assistant",
      blocks: [{ type: "text", text: "First response" }],
      timestamp: Date.now(),
      isStreaming: false,
    };
    const streamingMsg: ClaudeMessage = {
      id: "msg-2",
      role: "assistant",
      blocks: [{ type: "text", text: "Typing..." }],
      timestamp: Date.now(),
      isStreaming: true,
    };

    useSessionStore.setState({
      messageBuffers: { s1: [completedMsg] },
      streamingMessage: { s1: streamingMsg },
    });

    render(
      <ClaudeOutputPanel sessionId="s1" sessionStatus="running" />,
    );

    expect(screen.getByText("First response")).toBeInTheDocument();
    expect(screen.getByText("Typing...")).toBeInTheDocument();
  });

  it("shows Interrupt button when session is running", () => {
    render(
      <ClaudeOutputPanel sessionId="s1" sessionStatus="running" />,
    );
    expect(screen.getByText("Interrupt")).toBeInTheDocument();
  });

  it("shows Allow/Deny buttons when waiting for permission", () => {
    render(
      <ClaudeOutputPanel
        sessionId="s1"
        sessionStatus="waiting"
        blockType="permission"
      />,
    );
    expect(screen.getByText("Allow")).toBeInTheDocument();
    expect(screen.getByText("Deny")).toBeInTheDocument();
  });

  it("shows text input when waiting for text input", () => {
    render(
      <ClaudeOutputPanel
        sessionId="s1"
        sessionStatus="waiting"
        blockType="question"
      />,
    );
    expect(screen.getByPlaceholderText("Type your response...")).toBeInTheDocument();
    expect(screen.getByTitle("Send")).toBeInTheDocument();
  });

  it("shows completion message for completed sessions", () => {
    render(
      <ClaudeOutputPanel sessionId="s1" sessionStatus="completed" />,
    );
    expect(screen.getByText("Session completed")).toBeInTheDocument();
  });

  it("shows failure message for failed sessions", () => {
    render(
      <ClaudeOutputPanel sessionId="s1" sessionStatus="failed" />,
    );
    expect(screen.getByText("Session failed")).toBeInTheDocument();
  });

  it("shows killed message for killed sessions", () => {
    render(
      <ClaudeOutputPanel sessionId="s1" sessionStatus="killed" />,
    );
    expect(screen.getByText("Session killed")).toBeInTheDocument();
  });

  it("shows lastMessage in permission mode", () => {
    render(
      <ClaudeOutputPanel
        sessionId="s1"
        sessionStatus="waiting"
        blockType="permission"
        lastMessage="Claude wants to write to file.txt"
      />,
    );
    expect(screen.getByText("Claude wants to write to file.txt")).toBeInTheDocument();
  });

  it("shows loading indicator while fetching history", async () => {
    // Mock readSessionEvents to return a delayed promise
    const { readSessionEvents } = await import("../../lib/tauri");
    vi.mocked(readSessionEvents).mockImplementation(
      () => new Promise(() => {}), // never resolves — keeps loading state
    );

    render(
      <ClaudeOutputPanel sessionId="s-new" sessionStatus="idle" />,
    );
    expect(screen.getByText("Loading history...")).toBeInTheDocument();
  });
});
