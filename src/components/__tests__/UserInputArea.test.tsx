import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { UserInputArea } from "../claude/UserInputArea";

vi.mock("../../lib/env", () => ({
  isTauri: vi.fn(() => false),
}));

const mockInterruptSession = vi.fn();
const mockSendFollowup = vi.fn();

vi.mock("../../lib/tauri", () => ({
  interruptSession: (...args: unknown[]) => mockInterruptSession(...args),
  sendFollowup: (...args: unknown[]) => mockSendFollowup(...args),
}));

beforeEach(() => {
  mockSendFollowup.mockReset();
  mockInterruptSession.mockReset();
});

describe("UserInputArea", () => {
  describe("running state", () => {
    it("shows 'Claude is working...' and Interrupt button", () => {
      render(
        <UserInputArea sessionId="s1" sessionStatus="running" />,
      );
      expect(screen.getByText("Claude is working...")).toBeInTheDocument();
      expect(screen.getByText("Interrupt")).toBeInTheDocument();
    });

    it("shows animated pulse indicator", () => {
      const { container } = render(
        <UserInputArea sessionId="s1" sessionStatus="running" />,
      );
      expect(container.querySelector(".animate-pulse")).toBeTruthy();
    });
  });

  describe("waiting for permission", () => {
    it("shows Allow and Deny buttons", () => {
      render(
        <UserInputArea
          sessionId="s1"
          sessionStatus="waiting"
          blockType="permission"
        />,
      );
      expect(screen.getByText("Allow")).toBeInTheDocument();
      expect(screen.getByText("Deny")).toBeInTheDocument();
    });

    it("shows lastMessage when provided", () => {
      render(
        <UserInputArea
          sessionId="s1"
          sessionStatus="waiting"
          blockType="permission"
          lastMessage="Claude wants to write to main.ts"
        />,
      );
      expect(screen.getByText("Claude wants to write to main.ts")).toBeInTheDocument();
    });
  });

  describe("waiting for text input", () => {
    it("shows text input and Send button for question blockType", () => {
      render(
        <UserInputArea
          sessionId="s1"
          sessionStatus="waiting"
          blockType="question"
        />,
      );
      expect(screen.getByPlaceholderText("Type your response...")).toBeInTheDocument();
      expect(screen.getByTitle("Send")).toBeInTheDocument();
    });

    it("shows text input for confirmation blockType", () => {
      render(
        <UserInputArea
          sessionId="s1"
          sessionStatus="waiting"
          blockType="confirmation"
        />,
      );
      expect(screen.getByPlaceholderText("Type your response...")).toBeInTheDocument();
    });

    it("shows text input for input blockType", () => {
      render(
        <UserInputArea
          sessionId="s1"
          sessionStatus="waiting"
          blockType="input"
        />,
      );
      expect(screen.getByPlaceholderText("Type your response...")).toBeInTheDocument();
    });

    it("shows text input when waiting with no blockType", () => {
      render(
        <UserInputArea sessionId="s1" sessionStatus="waiting" />,
      );
      expect(screen.getByPlaceholderText("Type your response...")).toBeInTheDocument();
    });

    it("disables Send button when input is empty", () => {
      render(
        <UserInputArea sessionId="s1" sessionStatus="waiting" />,
      );
      expect(screen.getByTitle("Send")).toBeDisabled();
    });

    it("enables Send button when input has text", () => {
      render(
        <UserInputArea sessionId="s1" sessionStatus="waiting" />,
      );
      fireEvent.change(screen.getByPlaceholderText("Type your response..."), {
        target: { value: "my response" },
      });
      expect(screen.getByTitle("Send")).not.toBeDisabled();
    });
  });

  describe("completed states", () => {
    it("shows 'Session completed' for completed status", () => {
      render(
        <UserInputArea sessionId="s1" sessionStatus="completed" />,
      );
      expect(screen.getByText("Session completed")).toBeInTheDocument();
    });

    it("shows 'Session completed' for done status", () => {
      render(
        <UserInputArea sessionId="s1" sessionStatus="done" />,
      );
      expect(screen.getByText("Session completed")).toBeInTheDocument();
    });

    it("shows 'Session failed' for failed status", () => {
      render(
        <UserInputArea sessionId="s1" sessionStatus="failed" />,
      );
      expect(screen.getByText("Session failed")).toBeInTheDocument();
    });

    it("shows 'Session killed' for killed status", () => {
      render(
        <UserInputArea sessionId="s1" sessionStatus="killed" />,
      );
      expect(screen.getByText("Session killed")).toBeInTheDocument();
    });
  });

  describe("idle/paused states", () => {
    it("renders nothing for idle status", () => {
      const { container } = render(
        <UserInputArea sessionId="s1" sessionStatus="idle" />,
      );
      expect(container.innerHTML).toBe("");
    });

    it("renders nothing for paused status", () => {
      const { container } = render(
        <UserInputArea sessionId="s1" sessionStatus="paused" />,
      );
      expect(container.innerHTML).toBe("");
    });
  });
});
