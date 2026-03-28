import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { UserInputArea } from "../claude/UserInputArea";
import { useSessionStore } from "../../stores/sessionStore";

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
    it("shows 'Claude is working...' and Interrupt button", () => {
      render(<UserInputArea sessionId="s1" sessionStatus="running" />);
      expect(screen.getByText("Claude is working...")).toBeInTheDocument();
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
      expect(
        screen.getByPlaceholderText("Waiting for permission approval..."),
      ).toBeDisabled();
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
});
