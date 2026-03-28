import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { SlashCommandMenu, filterCommands, SLASH_COMMANDS } from "../claude/SlashCommandMenu";
import type { SlashCommand } from "../claude/SlashCommandMenu";

beforeEach(() => {
  Element.prototype.scrollIntoView = vi.fn();
});

describe("filterCommands", () => {
  it("returns all commands when query is empty", () => {
    expect(filterCommands("")).toEqual(SLASH_COMMANDS);
  });

  it("filters by command name", () => {
    const results = filterCommands("clear");
    expect(results.length).toBeGreaterThan(0);
    expect(results.some((c) => c.command === "/clear")).toBe(true);
  });

  it("filters by description", () => {
    const results = filterCommands("cost");
    expect(results.some((c) => c.command === "/cost")).toBe(true);
  });

  it("is case insensitive", () => {
    const results = filterCommands("CLEAR");
    expect(results.some((c) => c.command === "/clear")).toBe(true);
  });

  it("returns empty array for no matches", () => {
    expect(filterCommands("zzzznotacommand")).toEqual([]);
  });

  it("matches partial command names", () => {
    const results = filterCommands("com");
    expect(results.some((c) => c.command === "/compact")).toBe(true);
    expect(results.some((c) => c.command === "/commit")).toBe(true);
  });

  it("includes dynamic commands when provided", () => {
    const extra: SlashCommand[] = [
      { command: "/my-custom", description: "My custom command", category: "custom" },
    ];
    const results = filterCommands("", extra);
    expect(results.some((c) => c.command === "/my-custom")).toBe(true);
    // Should also include built-in commands
    expect(results.some((c) => c.command === "/clear")).toBe(true);
  });

  it("filters dynamic commands by query", () => {
    const extra: SlashCommand[] = [
      { command: "/deploy-prod", description: "Deploy to production", category: "custom" },
      { command: "/fix-bug", description: "Fix a specific bug", category: "custom" },
    ];
    const results = filterCommands("deploy", extra);
    expect(results.some((c) => c.command === "/deploy-prod")).toBe(true);
    expect(results.some((c) => c.command === "/fix-bug")).toBe(false);
  });

  it("filters dynamic commands by description", () => {
    const extra: SlashCommand[] = [
      { command: "/deploy-prod", description: "Deploy to production", category: "custom" },
    ];
    const results = filterCommands("production", extra);
    expect(results.some((c) => c.command === "/deploy-prod")).toBe(true);
  });
});

describe("SlashCommandMenu", () => {
  const defaultProps = {
    filter: "",
    selectedIndex: 0,
    onSelect: vi.fn(),
    onHover: vi.fn(),
  };

  it("renders commands", () => {
    render(<SlashCommandMenu {...defaultProps} />);
    expect(screen.getByText("/clear")).toBeInTheDocument();
    expect(screen.getByText("/help")).toBeInTheDocument();
  });

  it("renders category headers", () => {
    render(<SlashCommandMenu {...defaultProps} />);
    expect(screen.getByText("Session")).toBeInTheDocument();
    expect(screen.getByText("Configuration")).toBeInTheDocument();
  });

  it("shows 'No matching commands' when filter has no results", () => {
    render(<SlashCommandMenu {...defaultProps} filter="zzzznotacommand" />);
    expect(screen.getByText("No matching commands")).toBeInTheDocument();
  });

  it("filters by query", () => {
    render(<SlashCommandMenu {...defaultProps} filter="clear" />);
    expect(screen.getByText("/clear")).toBeInTheDocument();
    expect(screen.queryByText("/help")).not.toBeInTheDocument();
  });

  it("highlights selected item", () => {
    render(<SlashCommandMenu {...defaultProps} selectedIndex={0} />);
    const firstItem = screen.getByText("/clear").closest("button");
    expect(firstItem).toHaveAttribute("data-selected", "true");
  });

  it("calls onSelect when item is clicked", () => {
    const onSelect = vi.fn();
    render(<SlashCommandMenu {...defaultProps} onSelect={onSelect} />);
    fireEvent.click(screen.getByText("/clear"));
    expect(onSelect).toHaveBeenCalledWith("/clear");
  });

  it("calls onHover when item is hovered", () => {
    const onHover = vi.fn();
    render(<SlashCommandMenu {...defaultProps} onHover={onHover} />);
    const btn = screen.getByText("/clear").closest("button");
    if (btn) fireEvent.mouseEnter(btn);
    expect(onHover).toHaveBeenCalledWith(0);
  });

  it("shows descriptions", () => {
    render(<SlashCommandMenu {...defaultProps} filter="clear" />);
    expect(screen.getByText("Clear conversation history and free up context")).toBeInTheDocument();
  });

  it("renders dynamic commands with category headers", () => {
    const dynamic: SlashCommand[] = [
      { command: "/my-cmd", description: "My custom command", category: "custom" },
    ];
    render(<SlashCommandMenu {...defaultProps} filter="my-cmd" dynamicCommands={dynamic} />);
    expect(screen.getByText("/my-cmd")).toBeInTheDocument();
    expect(screen.getByText("Project Commands")).toBeInTheDocument();
  });

  it("renders skill commands with correct category header", () => {
    const dynamic: SlashCommand[] = [
      { command: "/code-review", description: "Review code quality", category: "skill" },
    ];
    render(<SlashCommandMenu {...defaultProps} filter="code-review" dynamicCommands={dynamic} />);
    expect(screen.getByText("/code-review")).toBeInTheDocument();
    expect(screen.getByText("Project Skills")).toBeInTheDocument();
  });

  it("renders tool commands with correct category header", () => {
    const dynamic: SlashCommand[] = [
      { command: "/mcp__server__prompt", description: "MCP prompt", category: "tool" },
    ];
    render(
      <SlashCommandMenu {...defaultProps} filter="mcp__server" dynamicCommands={dynamic} />,
    );
    expect(screen.getByText("/mcp__server__prompt")).toBeInTheDocument();
    expect(screen.getByText("Tools")).toBeInTheDocument();
  });

  it("renders plugin commands with correct category header", () => {
    const dynamic: SlashCommand[] = [
      { command: "/slack:standup", description: "Generate standup", category: "plugin" },
    ];
    render(
      <SlashCommandMenu {...defaultProps} filter="slack:standup" dynamicCommands={dynamic} />,
    );
    expect(screen.getByText("/slack:standup")).toBeInTheDocument();
    expect(screen.getByText("Plugin Commands")).toBeInTheDocument();
  });
});
