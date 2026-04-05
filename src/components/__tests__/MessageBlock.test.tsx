import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { MessageBlock } from "../claude/MessageBlock";
import type { ClaudeMessage } from "../../lib/types";

// Mock react-markdown
vi.mock("react-markdown", () => ({
  default: ({ children }: { children: string }) => <span>{children}</span>,
}));
vi.mock("remark-gfm", () => ({ default: () => {} }));

describe("MessageBlock", () => {
  it("renders system messages as centered pill", () => {
    const msg: ClaudeMessage = {
      id: "msg-1",
      role: "system",
      blocks: [{ type: "text", text: "Session initialized" }],
      timestamp: Date.now(),
    };

    const { container } = render(<MessageBlock message={msg} />);
    expect(screen.getByText("Session initialized")).toBeInTheDocument();
    // System messages are centered
    expect(container.querySelector(".justify-center")).toBeTruthy();
  });

  it("renders user messages with blue bubble", () => {
    const msg: ClaudeMessage = {
      id: "msg-2",
      role: "user",
      blocks: [{ type: "text", text: "Please help me" }],
      timestamp: Date.now(),
    };

    const { container } = render(<MessageBlock message={msg} />);
    expect(screen.getByText("Please help me")).toBeInTheDocument();
    // User messages are right-aligned
    expect(container.querySelector(".justify-end")).toBeTruthy();
    // Blue background
    expect(container.querySelector(".bg-brand")).toBeTruthy();
  });

  it("renders assistant text blocks", () => {
    const msg: ClaudeMessage = {
      id: "msg-3",
      role: "assistant",
      blocks: [{ type: "text", text: "Here is your answer" }],
      timestamp: Date.now(),
      isStreaming: false,
    };

    render(<MessageBlock message={msg} />);
    expect(screen.getByText("Here is your answer")).toBeInTheDocument();
  });

  it("renders assistant tool_use blocks", () => {
    const msg: ClaudeMessage = {
      id: "msg-4",
      role: "assistant",
      blocks: [
        {
          type: "tool_use",
          id: "tool-1",
          name: "Read",
          input: { file_path: "/src/main.ts" },
        },
      ],
      timestamp: Date.now(),
      isStreaming: false,
    };

    render(<MessageBlock message={msg} />);
    expect(screen.getByText("Read")).toBeInTheDocument();
    expect(screen.getByText("src/main.ts")).toBeInTheDocument();
  });

  it("renders assistant thinking blocks", () => {
    const msg: ClaudeMessage = {
      id: "msg-5",
      role: "assistant",
      blocks: [{ type: "thinking", thinking: "I need to analyze this problem carefully" }],
      timestamp: Date.now(),
      isStreaming: false,
    };

    render(<MessageBlock message={msg} />);
    expect(screen.getByText("Thinking")).toBeInTheDocument();
  });

  it("skips standalone tool_result blocks", () => {
    const msg: ClaudeMessage = {
      id: "msg-6",
      role: "assistant",
      blocks: [
        {
          type: "tool_result",
          tool_use_id: "tool-1",
          content: "File contents here",
        },
      ],
      timestamp: Date.now(),
      isStreaming: false,
    };

    const { container } = render(<MessageBlock message={msg} />);
    // The tool_result should not be rendered standalone
    expect(container.textContent).not.toContain("File contents here");
  });

  it("renders multiple block types in one message", () => {
    const msg: ClaudeMessage = {
      id: "msg-7",
      role: "assistant",
      blocks: [
        { type: "thinking", thinking: "Let me think..." },
        { type: "text", text: "Here is my analysis" },
        {
          type: "tool_use",
          id: "tool-2",
          name: "Bash",
          input: { command: "ls -la" },
        },
      ],
      timestamp: Date.now(),
      isStreaming: false,
    };

    render(<MessageBlock message={msg} />);
    expect(screen.getByText("Thinking")).toBeInTheDocument();
    expect(screen.getByText("Here is my analysis")).toBeInTheDocument();
    expect(screen.getByText("Ran")).toBeInTheDocument();
  });

  it("does not render user message with only tool_result blocks", () => {
    const msg: ClaudeMessage = {
      id: "msg-tool-result-only",
      role: "user",
      blocks: [
        {
          type: "tool_result",
          tool_use_id: "tool-1",
          content: "file contents here",
        },
      ],
      timestamp: Date.now(),
    };

    const { container } = render(<MessageBlock message={msg} />);
    // Should render nothing — no empty blue bubble
    expect(container.querySelector(".bg-brand")).toBeNull();
    expect(container.innerHTML).toBe("");
  });

  it("renders user message when it has text content", () => {
    const msg: ClaudeMessage = {
      id: "msg-user-with-text",
      role: "user",
      blocks: [{ type: "text", text: "Hello Claude" }],
      timestamp: Date.now(),
    };

    const { container } = render(<MessageBlock message={msg} />);
    expect(screen.getByText("Hello Claude")).toBeInTheDocument();
    expect(container.querySelector(".bg-brand")).toBeTruthy();
  });

  it("correlates tool_result with tool_use in the same message", () => {
    const msg: ClaudeMessage = {
      id: "msg-8",
      role: "assistant",
      blocks: [
        {
          type: "tool_use",
          id: "tool-1",
          name: "Read",
          input: { file_path: "/src/app.ts" },
        },
        {
          type: "tool_result",
          tool_use_id: "tool-1",
          content: "const app = express();",
        },
      ],
      timestamp: Date.now(),
      isStreaming: false,
    };

    render(<MessageBlock message={msg} />);
    // ToolUseBlock should show "done" badge when result is present
    expect(screen.getByText("done")).toBeInTheDocument();
  });
});
