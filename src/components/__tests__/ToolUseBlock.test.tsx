import { describe, it, expect } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { ToolUseBlock } from "../claude/ToolUseBlock";

describe("ToolUseBlock", () => {
  it("renders tool name", () => {
    render(<ToolUseBlock name="Read" input={{ file_path: "/src/main.ts" }} />);
    expect(screen.getByText("Read")).toBeInTheDocument();
  });

  it("shows file_path summary for Read tool", () => {
    render(<ToolUseBlock name="Read" input={{ file_path: "/src/main.ts" }} />);
    expect(screen.getByText("/src/main.ts")).toBeInTheDocument();
  });

  it("shows file_path summary for Write tool", () => {
    render(<ToolUseBlock name="Write" input={{ file_path: "/out/bundle.js" }} />);
    expect(screen.getByText("/out/bundle.js")).toBeInTheDocument();
  });

  it("shows file_path summary for Edit tool", () => {
    render(
      <ToolUseBlock
        name="Edit"
        input={{ file_path: "/src/utils.ts", old_string: "foo", new_string: "bar" }}
      />,
    );
    expect(screen.getByText("/src/utils.ts")).toBeInTheDocument();
  });

  it("shows pattern summary for Glob tool", () => {
    render(<ToolUseBlock name="Glob" input={{ pattern: "**/*.tsx" }} />);
    expect(screen.getByText("**/*.tsx")).toBeInTheDocument();
  });

  it("shows pattern summary for Grep tool", () => {
    render(<ToolUseBlock name="Grep" input={{ pattern: "TODO" }} />);
    expect(screen.getByText("TODO")).toBeInTheDocument();
  });

  it("shows command summary for Bash tool", () => {
    render(<ToolUseBlock name="Bash" input={{ command: "npm test" }} />);
    expect(screen.getByText("npm test")).toBeInTheDocument();
  });

  it("truncates long Bash commands to 80 chars", () => {
    const longCommand = "a".repeat(100);
    render(<ToolUseBlock name="Bash" input={{ command: longCommand }} />);
    expect(screen.getByText("a".repeat(80) + "...")).toBeInTheDocument();
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
    expect(container.firstChild).toHaveClass("border-l-blue-400");
  });

  it("applies amber accent for write tools", () => {
    const { container } = render(<ToolUseBlock name="Write" input={{}} />);
    expect(container.firstChild).toHaveClass("border-l-amber-400");
  });

  it("applies red accent for danger tools", () => {
    const { container } = render(<ToolUseBlock name="Bash" input={{}} />);
    expect(container.firstChild).toHaveClass("border-l-red-400");
  });

  it("applies gray accent for unknown tools", () => {
    const { container } = render(<ToolUseBlock name="Unknown" input={{}} />);
    expect(container.firstChild).toHaveClass("border-l-gray-400");
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

  it("shows streaming indicator when isStreaming", () => {
    const { container } = render(
      <ToolUseBlock name="Read" input={{}} isStreaming />,
    );
    expect(container.querySelector(".animate-pulse")).toBeTruthy();
  });

  it("expands input details on click", () => {
    render(
      <ToolUseBlock name="Read" input={{ file_path: "/src/main.ts", limit: 100 }} />,
    );

    // Initially, JSON details are not visible
    expect(screen.queryByText(/"file_path"/)).not.toBeInTheDocument();

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
