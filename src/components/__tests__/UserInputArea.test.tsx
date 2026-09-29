import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { UserInputArea } from "../claude/UserInputArea";
import { useSessionStore } from "../../stores/sessionStore";
import { isTauri } from "../../lib/env";

vi.mock("../../lib/env", () => ({
  isTauri: vi.fn(() => false),
}));

const mockInterruptSession = vi.fn();
const mockSendFollowup = vi.fn();

vi.mock("../../lib/tauri", () => ({
  interruptSession: (...args: unknown[]) => mockInterruptSession(...args) as unknown,
  sendFollowup: (...args: unknown[]) => mockSendFollowup(...args) as unknown,
  respondToHook: vi.fn(),
  scanSlashCommands: vi.fn(() => Promise.resolve([])),
}));

beforeEach(() => {
  mockSendFollowup.mockReset();
  mockInterruptSession.mockReset();
  vi.mocked(isTauri).mockReturnValue(false);
  useSessionStore.setState({
    messageBuffers: {},
    streamingMessage: {},
  });
});

describe("UserInputArea", () => {
  describe("always shows text input", () => {
    it("shows textarea for running state", () => {
      render(<UserInputArea sessionId="s1" sessionStatus="running" />);
      expect(
        screen.getByPlaceholderText("Type a message... (sent after current turn)"),
      ).toBeInTheDocument();
    });

    it("shows textarea for attention state", () => {
      render(<UserInputArea sessionId="s1" sessionStatus="attention" />);
      expect(screen.getByPlaceholderText("Type your response...")).toBeInTheDocument();
    });

    it("shows textarea for done state", () => {
      render(<UserInputArea sessionId="s1" sessionStatus="done" />);
      expect(screen.getByPlaceholderText("Send a follow-up message...")).toBeInTheDocument();
    });
  });

  describe("running state", () => {
    it("shows working status and Interrupt button", () => {
      render(<UserInputArea sessionId="s1" sessionStatus="running" />);
      expect(screen.getByText("Working...")).toBeInTheDocument();
      expect(screen.getByText("Interrupt")).toBeInTheDocument();
    });

    it("shows animated pulse indicator", () => {
      const { container } = render(<UserInputArea sessionId="s1" sessionStatus="running" />);
      expect(container.querySelector(".animate-pulse")).toBeTruthy();
    });
  });

  describe("waiting for permission", () => {
    it("shows Permission Required banner with lastMessage", () => {
      render(
        <UserInputArea
          sessionId="s1"
          sessionStatus="attention"
          blockType="permission"
          lastMessage="Claude wants to write to main.ts"
        />,
      );
      expect(screen.getByText("Permission Required")).toBeInTheDocument();
      expect(screen.getByText("Claude wants to write to main.ts")).toBeInTheDocument();
    });

    it("disables textarea when waiting for permission", () => {
      render(<UserInputArea sessionId="s1" sessionStatus="attention" blockType="permission" />);
      expect(screen.getByPlaceholderText("Waiting for permission approval...")).toBeDisabled();
    });

    it("shows waiting status indicator", () => {
      render(<UserInputArea sessionId="s1" sessionStatus="attention" blockType="permission" />);
      expect(screen.getByText("Waiting for your input")).toBeInTheDocument();
    });
  });

  describe("waiting for text input", () => {
    it("shows text input and Send button for question blockType", () => {
      render(<UserInputArea sessionId="s1" sessionStatus="attention" blockType="question" />);
      expect(screen.getByPlaceholderText("Type your response...")).toBeInTheDocument();
      expect(screen.getByTitle("Send (Enter)")).toBeInTheDocument();
    });

    it("shows question prompt above input", () => {
      render(
        <UserInputArea
          sessionId="s1"
          sessionStatus="attention"
          blockType="question"
          lastMessage="What file should I edit?"
        />,
      );
      expect(screen.getByText("What file should I edit?")).toBeInTheDocument();
    });

    it("shows Yes/No buttons for confirmation blockType", () => {
      render(
        <UserInputArea
          sessionId="s1"
          sessionStatus="attention"
          blockType="confirmation"
          lastMessage="Are you sure?"
        />,
      );
      expect(screen.getByText("Yes")).toBeInTheDocument();
      expect(screen.getByText("No")).toBeInTheDocument();
      expect(screen.getByText("Are you sure?")).toBeInTheDocument();
    });

    it("shows text input for input blockType", () => {
      render(<UserInputArea sessionId="s1" sessionStatus="attention" blockType="input" />);
      expect(screen.getByPlaceholderText("Type your response...")).toBeInTheDocument();
    });

    it("shows text input when waiting with no blockType", () => {
      render(<UserInputArea sessionId="s1" sessionStatus="attention" />);
      expect(screen.getByPlaceholderText("Type your response...")).toBeInTheDocument();
    });

    it("disables Send button when input is empty", () => {
      render(<UserInputArea sessionId="s1" sessionStatus="attention" />);
      expect(screen.getByTitle("Send (Enter)")).toBeDisabled();
    });

    it("enables Send button when input has text", () => {
      render(<UserInputArea sessionId="s1" sessionStatus="attention" />);
      fireEvent.change(screen.getByPlaceholderText("Type your response..."), {
        target: { value: "my response" },
      });
      expect(screen.getByTitle("Send (Enter)")).not.toBeDisabled();
    });
  });

  describe("done state", () => {
    it("shows 'Session done' for done status", () => {
      render(<UserInputArea sessionId="s1" sessionStatus="done" />);
      expect(screen.getByText("Session done")).toBeInTheDocument();
    });
  });

  describe("keyboard shortcuts parity", () => {
    it("inserts newline on Option+Enter without sending", () => {
      render(<UserInputArea sessionId="s1" sessionStatus="attention" />);
      const textarea = screen.getByPlaceholderText<HTMLTextAreaElement>("Type your response...");
      fireEvent.change(textarea, { target: { value: "first line" } });
      textarea.selectionStart = 10;
      textarea.selectionEnd = 10;

      fireEvent.keyDown(textarea, { key: "Enter", altKey: true });
      expect(textarea.value).toBe("first line\n");
      expect(mockSendFollowup).not.toHaveBeenCalled();
    });

    it("inserts newline on Ctrl+J without sending", () => {
      render(<UserInputArea sessionId="s1" sessionStatus="attention" />);
      const textarea = screen.getByPlaceholderText<HTMLTextAreaElement>("Type your response...");
      fireEvent.change(textarea, { target: { value: "hello" } });
      textarea.selectionStart = 5;
      textarea.selectionEnd = 5;

      fireEvent.keyDown(textarea, { key: "j", ctrlKey: true });
      expect(textarea.value).toBe("hello\n");
      expect(mockSendFollowup).not.toHaveBeenCalled();
    });

    it("cycles modes on Shift+Tab", () => {
      render(<UserInputArea sessionId="s1" sessionStatus="attention" />);
      const textarea = screen.getByPlaceholderText("Type your response...");

      expect(screen.getByText("mode: default")).toBeInTheDocument();

      fireEvent.keyDown(textarea, { key: "Tab", shiftKey: true });
      expect(screen.getByText("mode: accept-edits")).toBeInTheDocument();

      fireEvent.keyDown(textarea, { key: "Tab", shiftKey: true });
      expect(screen.getByText("mode: plan")).toBeInTheDocument();
    });

    it("interrupts running session on Ctrl+C when no text is selected", () => {
      vi.mocked(isTauri).mockReturnValue(true);
      render(<UserInputArea sessionId="s1" sessionStatus="running" />);
      const textarea = screen.getByPlaceholderText<HTMLTextAreaElement>(
        "Type a message... (sent after current turn)",
      );
      textarea.selectionStart = 0;
      textarea.selectionEnd = 0;

      fireEvent.keyDown(textarea, { key: "c", ctrlKey: true });
      expect(mockInterruptSession).toHaveBeenCalledWith("s1");
    });

    it("does not interrupt session on Ctrl+C when text is selected", () => {
      vi.mocked(isTauri).mockReturnValue(true);
      render(<UserInputArea sessionId="s1" sessionStatus="running" />);
      const textarea = screen.getByPlaceholderText<HTMLTextAreaElement>(
        "Type a message... (sent after current turn)",
      );
      fireEvent.change(textarea, { target: { value: "some text" } });
      textarea.selectionStart = 0;
      textarea.selectionEnd = 4;

      fireEvent.keyDown(textarea, { key: "c", ctrlKey: true });
      expect(mockInterruptSession).not.toHaveBeenCalled();
    });

    it("clears output messages on Ctrl+L", () => {
      useSessionStore.setState({
        messageBuffers: {
          s1: [{ id: "m1", role: "assistant", blocks: [], timestamp: 1 }],
        },
      });

      render(<UserInputArea sessionId="s1" sessionStatus="running" />);
      const textarea = screen.getByPlaceholderText("Type a message... (sent after current turn)");

      fireEvent.keyDown(textarea, { key: "l", ctrlKey: true });
      expect(useSessionStore.getState().messageBuffers.s1).toEqual([]);
    });

    it("toggles verbose mode on Ctrl+O", async () => {
      const { useUIStore } = await import("../../stores/uiStore");
      useUIStore.setState({ verboseMode: false });

      render(<UserInputArea sessionId="s1" sessionStatus="running" />);
      const textarea = screen.getByPlaceholderText("Type a message... (sent after current turn)");

      fireEvent.keyDown(textarea, { key: "o", ctrlKey: true });
      expect(useUIStore.getState().verboseMode).toBe(true);

      fireEvent.keyDown(textarea, { key: "o", ctrlKey: true });
      expect(useUIStore.getState().verboseMode).toBe(false);
    });

    it("opens shortcuts overlay when entering /keybindings", async () => {
      const { useUIStore } = await import("../../stores/uiStore");
      useUIStore.setState({ showShortcuts: false });

      render(<UserInputArea sessionId="s1" sessionStatus="attention" />);
      const textarea = screen.getByPlaceholderText("Type your response...");

      fireEvent.change(textarea, { target: { value: "/keybindings" } });
      fireEvent.keyDown(textarea, { key: "Enter" });

      expect(useUIStore.getState().showShortcuts).toBe(true);
      expect(mockSendFollowup).not.toHaveBeenCalled();
    });
  });
});
