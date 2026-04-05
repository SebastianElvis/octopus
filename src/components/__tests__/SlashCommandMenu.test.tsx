import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import {
  SlashCommandMenu,
  filterCommands,
  buildCommandList,
  FALLBACK_SLASH_COMMANDS,
} from "../claude/SlashCommandMenu";
import type { SlashCommand } from "../claude/SlashCommandMenu";

beforeEach(() => {
  Element.prototype.scrollIntoView = vi.fn();
});

describe("filterCommands", () => {
  it("returns all fallback commands when query is empty and no commands given", () => {
    expect(filterCommands("")).toEqual(FALLBACK_SLASH_COMMANDS);
  });

  it("returns all given commands when query is empty", () => {
    const cmds: SlashCommand[] = [{ command: "/foo", description: "Foo", category: "nav" }];
    expect(filterCommands("", cmds)).toEqual(cmds);
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

  it("filters provided commands by query", () => {
    const cmds: SlashCommand[] = [
      { command: "/deploy-prod", description: "Deploy to production", category: "custom" },
      { command: "/fix-bug", description: "Fix a specific bug", category: "custom" },
    ];
    const results = filterCommands("deploy", cmds);
    expect(results.some((c) => c.command === "/deploy-prod")).toBe(true);
    expect(results.some((c) => c.command === "/fix-bug")).toBe(false);
  });
});

describe("buildCommandList", () => {
  it("returns fallback list when no init info provided", () => {
    const result = buildCommandList(undefined, []);
    expect(result).toEqual(FALLBACK_SLASH_COMMANDS);
  });

  it("returns fallback list plus fs commands when no init info", () => {
    const fs: SlashCommand[] = [
      { command: "/my-project-cmd", description: "Custom", category: "custom" },
    ];
    const result = buildCommandList(undefined, fs);
    expect(result.length).toBe(FALLBACK_SLASH_COMMANDS.length + 1);
    expect(result.some((c) => c.command === "/my-project-cmd")).toBe(true);
  });

  it("deduplicates fs commands against fallback", () => {
    const fs: SlashCommand[] = [
      { command: "/clear", description: "Custom clear", category: "custom" },
    ];
    const result = buildCommandList(undefined, fs);
    // /clear already in fallback, so fs version should not be added
    expect(result.filter((c) => c.command === "/clear")).toHaveLength(1);
  });

  it("maps init slash commands with known descriptions", () => {
    const result = buildCommandList(
      { slashCommands: ["clear", "compact"], skills: [], plugins: [] },
      [],
    );
    expect(
      result.some(
        (c) =>
          c.command === "/clear" &&
          c.description === "Clear conversation history and free up context",
      ),
    ).toBe(true);
    expect(result.some((c) => c.command === "/compact")).toBe(true);
  });

  it("uses generic description for unknown commands", () => {
    const result = buildCommandList(
      { slashCommands: ["new-future-cmd"], skills: [], plugins: [] },
      [],
    );
    const cmd = result.find((c) => c.command === "/new-future-cmd");
    expect(cmd).toBeDefined();
    expect(cmd?.description).toBe("Slash command");
  });

  it("adds skills with correct category", () => {
    const result = buildCommandList(
      { slashCommands: [], skills: ["simplify", "unknown-skill"], plugins: [] },
      [],
    );
    const known = result.find((c) => c.command === "/simplify");
    expect(known).toBeDefined();
    // simplify has a known description
    expect(known?.description).not.toBe("Skill: simplify");

    const unknown = result.find((c) => c.command === "/unknown-skill");
    expect(unknown).toBeDefined();
    expect(unknown?.category).toBe("skill");
    expect(unknown?.description).toBe("Skill: unknown-skill");
  });

  it("adds plugins with correct category", () => {
    const result = buildCommandList(
      { slashCommands: [], skills: [], plugins: [{ name: "slack" }, { name: "atlassian" }] },
      [],
    );
    const slack = result.find((c) => c.command === "/slack");
    expect(slack).toBeDefined();
    expect(slack?.category).toBe("plugin");
  });

  it("includes fs commands not in init data", () => {
    const fs: SlashCommand[] = [
      { command: "/my-project-cmd", description: "Custom", category: "custom" },
    ];
    const result = buildCommandList({ slashCommands: ["clear"], skills: [], plugins: [] }, fs);
    expect(result.some((c) => c.command === "/my-project-cmd")).toBe(true);
    expect(result.some((c) => c.command === "/clear")).toBe(true);
  });

  it("deduplicates across all sources", () => {
    const fs: SlashCommand[] = [
      { command: "/clear", description: "Custom clear", category: "custom" },
    ];
    const result = buildCommandList(
      { slashCommands: ["clear"], skills: ["clear"], plugins: [{ name: "clear" }] },
      fs,
    );
    expect(result.filter((c) => c.command === "/clear")).toHaveLength(1);
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

  it("renders custom commands with category headers", () => {
    const cmds: SlashCommand[] = [
      { command: "/my-cmd", description: "My custom command", category: "custom" },
    ];
    render(<SlashCommandMenu {...defaultProps} filter="my-cmd" commands={cmds} />);
    expect(screen.getByText("/my-cmd")).toBeInTheDocument();
    expect(screen.getByText("Project Commands")).toBeInTheDocument();
  });

  it("renders skill commands with correct category header", () => {
    const cmds: SlashCommand[] = [
      { command: "/code-review", description: "Review code quality", category: "skill" },
    ];
    render(<SlashCommandMenu {...defaultProps} filter="code-review" commands={cmds} />);
    expect(screen.getByText("/code-review")).toBeInTheDocument();
    expect(screen.getByText("Project Skills")).toBeInTheDocument();
  });

  it("renders tool commands with correct category header", () => {
    const cmds: SlashCommand[] = [
      { command: "/mcp__server__prompt", description: "MCP prompt", category: "tool" },
    ];
    render(<SlashCommandMenu {...defaultProps} filter="mcp__server" commands={cmds} />);
    expect(screen.getByText("/mcp__server__prompt")).toBeInTheDocument();
    expect(screen.getByText("Tools")).toBeInTheDocument();
  });

  it("renders plugin commands with correct category header", () => {
    const cmds: SlashCommand[] = [
      { command: "/slack:standup", description: "Generate standup", category: "plugin" },
    ];
    render(<SlashCommandMenu {...defaultProps} filter="slack:standup" commands={cmds} />);
    expect(screen.getByText("/slack:standup")).toBeInTheDocument();
    expect(screen.getByText("Plugin Commands")).toBeInTheDocument();
  });
});
