import { describe, it, expect } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { ToolUseBlock } from "../claude/ToolUseBlock";

describe("ToolUseBlock", () => {
  it("renders action verb for tool", () => {
    render(<ToolUseBlock name="Read" input={{ file_path: "/src/main.ts" }} />);
    expect(screen.getByText("Read")).toBeInTheDocument();
  });

  it("renders 'Edited' verb for Edit tool", () => {
    render(
      <ToolUseBlock
        name="Edit"
        input={{ file_path: "/src/main.ts", old_string: "a", new_string: "b" }}
      />,
    );
    expect(screen.getByText("Edited")).toBeInTheDocument();
  });

  it("renders 'Ran' verb for Bash tool", () => {
    render(<ToolUseBlock name="Bash" input={{ command: "npm test" }} />);
    expect(screen.getByText("Ran")).toBeInTheDocument();
  });

  it("shortens long file paths to last 2 segments", () => {
    render(
      <ToolUseBlock
        name="Read"
        input={{ file_path: "/Users/runchao/.octopus/worktrees/honolulu/src/main.ts" }}
      />,
    );
    expect(screen.getByText("src/main.ts")).toBeInTheDocument();
  });

  it("shows full path for short paths", () => {
    render(<ToolUseBlock name="Read" input={{ file_path: "/src/main.ts" }} />);
    expect(screen.getByText("src/main.ts")).toBeInTheDocument();
  });

  it("has tooltip with full path on shortened paths", () => {
    const fullPath = "/Users/runchao/.octopus/worktrees/honolulu/src/main.ts";
    const { container } = render(<ToolUseBlock name="Read" input={{ file_path: fullPath }} />);
    const summarySpan = container.querySelector("[title]");
    expect(summarySpan).toBeTruthy();
    expect(summarySpan?.getAttribute("title")).toBe(fullPath);
  });

  it("shows pattern summary for Glob tool", () => {
    render(<ToolUseBlock name="Glob" input={{ pattern: "**/*.tsx" }} />);
    expect(screen.getByText("**/*.tsx")).toBeInTheDocument();
  });

  it("shows pattern summary for Grep tool", () => {
    render(<ToolUseBlock name="Grep" input={{ pattern: "TODO" }} />);
    expect(screen.getByText("TODO")).toBeInTheDocument();
  });

  it("shows Grep pattern with shortened path", () => {
    render(
      <ToolUseBlock
        name="Grep"
        input={{ pattern: "TODO", path: "/Users/runchao/project/src/lib" }}
      />,
    );
    expect(screen.getByText("TODO in src/lib")).toBeInTheDocument();
  });

  it("shows command summary for Bash tool", () => {
    render(<ToolUseBlock name="Bash" input={{ command: "npm test" }} />);
    expect(screen.getByText("npm test")).toBeInTheDocument();
  });

  it("truncates long Bash commands to 120 chars", () => {
    const longCommand = "a".repeat(150);
    render(<ToolUseBlock name="Bash" input={{ command: longCommand }} />);
    expect(screen.getByText("a".repeat(120) + "...")).toBeInTheDocument();
  });

  it("shows no summary for unknown tools", () => {
    const { container } = render(<ToolUseBlock name="CustomTool" input={{ data: "test" }} />);
    expect(screen.getByText("CustomTool")).toBeInTheDocument();
    // No summary text — only the tool name
    const summarySpan = container.querySelector(".truncate.font-mono");
    expect(summarySpan).toBeNull();
  });

  it("applies blue accent for read tools", () => {
    const { container } = render(<ToolUseBlock name="Read" input={{}} />);
    expect(container.firstChild).toHaveClass("border-l-brand");
  });

  it("applies amber accent for write tools", () => {
    const { container } = render(<ToolUseBlock name="Write" input={{}} />);
    expect(container.firstChild).toHaveClass("border-l-status-attention");
  });

  it("applies red accent for danger tools", () => {
    const { container } = render(<ToolUseBlock name="Bash" input={{}} />);
    expect(container.firstChild).toHaveClass("border-l-danger");
  });

  it("applies gray accent for unknown tools", () => {
    const { container } = render(<ToolUseBlock name="Unknown" input={{}} />);
    expect(container.firstChild).toHaveClass("border-l-on-surface-faint");
  });

  it("shows 'done' badge when tool result is present", () => {
    render(
      <ToolUseBlock
        name="Read"
        input={{ file_path: "/src/main.ts" }}
        toolResult={{
          type: "tool_result",
          tool_use_id: "t1",
          content: "file contents",
        }}
      />,
    );
    expect(screen.getByText("done")).toBeInTheDocument();
  });

  it("renders Bash command in code-style inline", () => {
    const { container } = render(<ToolUseBlock name="Bash" input={{ command: "npm test" }} />);
    const codeSpan = container.querySelector(".bg-hover");
    expect(codeSpan).toBeTruthy();
    expect(codeSpan?.textContent).toBe("npm test");
  });

  it("expands input details on click", () => {
    render(<ToolUseBlock name="Read" input={{ file_path: "/src/main.ts", limit: 100 }} />);

    // Initially, JSON details are hidden (AnimatedCollapse renders with opacity:0)
    const detailsBefore = screen.queryByText(/"file_path"/);
    if (detailsBefore) {
      expect(detailsBefore.closest("[style]")).toBeTruthy();
    }

    // Click to expand
    fireEvent.click(screen.getByText("Read"));

    // Now JSON is visible
    expect(screen.getByText(/"file_path"/)).toBeInTheDocument();
  });

  it("shows Output section when result is present", () => {
    render(
      <ToolUseBlock
        name="Read"
        input={{ file_path: "/src/main.ts" }}
        toolResult={{
          type: "tool_result",
          tool_use_id: "t1",
          content: "file contents here",
        }}
      />,
    );
    expect(screen.getByText("Output")).toBeInTheDocument();
  });

  it("shows line count for long results", () => {
    const longContent = Array.from({ length: 20 }, (_, i) => `line ${i + 1}`).join("\n");
    render(
      <ToolUseBlock
        name="Read"
        input={{}}
        toolResult={{
          type: "tool_result",
          tool_use_id: "t1",
          content: longContent,
        }}
      />,
    );
    expect(screen.getByText("(20 lines)")).toBeInTheDocument();
  });

  it("handles array content in tool_result", () => {
    render(
      <ToolUseBlock
        name="Read"
        input={{}}
        toolResult={{
          type: "tool_result",
          tool_use_id: "t1",
          content: [
            { type: "text", text: "Part 1" },
            { type: "text", text: "Part 2" },
          ],
        }}
      />,
    );
    expect(screen.getByText("Output")).toBeInTheDocument();
  });
});
