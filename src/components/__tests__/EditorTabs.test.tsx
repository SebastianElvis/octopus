import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { EditorTabs } from "../EditorTabs";
import { useEditorStore } from "../../stores/editorStore";

beforeEach(() => {
  useEditorStore.setState({
    tabs: [],
    activeTabId: null,
    contents: {},
  });
});

describe("EditorTabs", () => {
  const defaultProps = {
    claudeActive: true,
    onSelectClaude: vi.fn(),
    sessionStatus: "running",
  };

  it("renders Claude tab", () => {
    render(<EditorTabs {...defaultProps} />);
    expect(screen.getByText("Claude")).toBeInTheDocument();
  });

  it("does not render Raw tab", () => {
    render(<EditorTabs {...defaultProps} />);
    expect(screen.queryByText("Raw")).not.toBeInTheDocument();
  });

  it("highlights Claude tab when active", () => {
    render(<EditorTabs {...defaultProps} claudeActive />);
    const claudeBtn = screen.getByText("Claude").closest("button");
    expect(claudeBtn).not.toBeNull();
    expect(claudeBtn?.className).toContain("bg-surface");
  });

  it("calls onSelectClaude when Claude tab is clicked", () => {
    const onSelectClaude = vi.fn();
    render(<EditorTabs {...defaultProps} onSelectClaude={onSelectClaude} />);
    fireEvent.click(screen.getByText("Claude"));
    expect(onSelectClaude).toHaveBeenCalledTimes(1);
  });

  it("shows animated pulse on Claude tab when running", () => {
    const { container } = render(<EditorTabs {...defaultProps} sessionStatus="running" />);
    expect(container.querySelector(".animate-pulse")).toBeTruthy();
  });

  it("shows animated pulse on Claude tab when attention", () => {
    const { container } = render(<EditorTabs {...defaultProps} sessionStatus="attention" />);
    expect(container.querySelector(".animate-pulse")).toBeTruthy();
  });

  it("does not show pulse when session is done", () => {
    const { container } = render(<EditorTabs {...defaultProps} sessionStatus="done" />);
    expect(container.querySelector(".animate-pulse")).toBeNull();
  });

  it("renders GitHub tab when hasGitHubTab is true", () => {
    const onSelectGitHub = vi.fn();
    render(
      <EditorTabs
        {...defaultProps}
        hasGitHubTab
        onSelectGitHub={onSelectGitHub}
        githubLabel="Issue #42"
      />,
    );
    expect(screen.getByText("Issue #42")).toBeInTheDocument();
  });

  it("renders Log tab when hasLogTab is true", () => {
    const onSelectLog = vi.fn();
    render(<EditorTabs {...defaultProps} hasLogTab onSelectLog={onSelectLog} />);
    expect(screen.getByText("Log")).toBeInTheDocument();
  });

  it("renders Recap tab when hasRecapTab is true", () => {
    const onSelectRecap = vi.fn();
    render(<EditorTabs {...defaultProps} hasRecapTab onSelectRecap={onSelectRecap} />);
    expect(screen.getByText("Recap")).toBeInTheDocument();
  });

  it("does not render GitHub tab when hasGitHubTab is false", () => {
    render(<EditorTabs {...defaultProps} />);
    expect(screen.queryByText("GitHub")).not.toBeInTheDocument();
  });

  it("renders file tabs from editor store", () => {
    useEditorStore.setState({
      tabs: [
        {
          id: "tab-1",
          filePath: "/src/app.ts",
          fileName: "app.ts",
          language: "typescript",
          isDirty: false,
        },
      ],
      activeTabId: "tab-1",
    });

    render(<EditorTabs {...defaultProps} claudeActive={false} />);
    expect(screen.getByText("app.ts")).toBeInTheDocument();
  });
});
