import { useEffect, useRef } from "react";
import type { SessionInitInfo } from "../../stores/sessionStore";

export interface SlashCommand {
  command: string;
  description: string;
  category:
    | "session"
    | "config"
    | "nav"
    | "debug"
    | "info"
    | "custom"
    | "personal"
    | "skill"
    | "personal_skill"
    | "plugin"
    | "plugin_skill"
    | "marketplace_skill"
    | "mcp"
    | "tool";
}

/**
 * Description and category lookup for known Claude Code slash commands.
 * This is NOT the source of truth for which commands exist — the CLI's
 * stream-json init event is. This just provides friendly descriptions.
 */
const KNOWN_COMMAND_INFO: Partial<
  Record<string, { description: string; category: SlashCommand["category"] }>
> = {
  // Session management
  "/clear": { description: "Clear conversation history and free up context", category: "session" },
  "/compact": {
    description: "Clear conversation history but keep a summary in context",
    category: "session",
  },
  "/resume": { description: "Resume a previous conversation", category: "session" },
  "/rename": { description: "Rename the current conversation", category: "session" },
  "/export": {
    description: "Export the current conversation to a file or clipboard",
    category: "session",
  },
  "/copy": { description: "Copy Claude's last response to clipboard", category: "session" },
  "/branch": { description: "Branch conversation at current point", category: "session" },
  "/btw": {
    description: "Ask a quick side question without interrupting the main conversation",
    category: "session",
  },
  "/exit": { description: "Exit the current session", category: "session" },
  "/tag": { description: "Toggle a searchable tag on the current session", category: "session" },
  // Configuration
  "/config": { description: "Open config panel", category: "config" },
  "/model": { description: "Select or change the AI model", category: "config" },
  "/permissions": { description: "View or update permissions", category: "config" },
  "/memory": { description: "Edit Claude memory files", category: "config" },
  "/init": { description: "Initialize project with CLAUDE.md", category: "config" },
  "/fast": { description: "Toggle fast mode", category: "config" },
  "/effort": { description: "Set effort level for model usage", category: "config" },
  "/theme": { description: "Change the theme", category: "config" },
  "/vim": { description: "Toggle between Vim and Normal editing modes", category: "config" },
  "/hooks": { description: "View hook configurations for tool events", category: "config" },
  "/keybindings": {
    description: "Open or create your keybindings configuration file",
    category: "config",
  },
  "/color": { description: "Set the prompt bar color for this session", category: "config" },
  "/voice": { description: "Toggle voice mode", category: "config" },
  "/privacy-settings": { description: "View and update your privacy settings", category: "config" },
  "/extra-usage": {
    description: "Configure extra usage to keep working when limits are hit",
    category: "config",
  },
  "/plugin": { description: "Plugin management", category: "config" },
  "/reload-plugins": {
    description: "Activate pending plugin changes in the current session",
    category: "config",
  },
  "/ide": { description: "Manage IDE integrations and show status", category: "config" },
  "/terminal-setup": { description: "Set up terminal integration", category: "config" },
  "/remote-control": { description: "Bridge session to claude.ai/code", category: "config" },
  "/remote-env": {
    description: "Configure the default remote environment for teleport sessions",
    category: "config",
  },
  "/agents": { description: "Manage agent configurations", category: "config" },
  // Navigation / actions
  "/diff": { description: "View uncommitted changes and per-turn diffs", category: "nav" },
  "/review": { description: "Review a pull request", category: "nav" },
  "/pr-comments": { description: "Get comments from a GitHub pull request", category: "nav" },
  "/add-dir": { description: "Add a new working directory", category: "nav" },
  "/plan": { description: "Enable plan mode or view the current session plan", category: "nav" },
  "/commit": { description: "Create a git commit", category: "nav" },
  "/commit-push-pr": { description: "Commit, push, and open a PR", category: "nav" },
  "/init-verifiers": {
    description: "Create verifier skill(s) for automated verification of code changes",
    category: "nav",
  },
  "/security-review": {
    description: "Complete a security review of the pending changes on the current branch",
    category: "nav",
  },
  "/batch": {
    description: "Research and plan a large-scale change, then execute it in parallel",
    category: "nav",
  },
  "/schedule": {
    description: "Create, update, list, or run scheduled remote agents",
    category: "nav",
  },
  "/simplify": {
    description: "Review changed code for reuse, quality, and efficiency",
    category: "nav",
  },
  "/loop": {
    description: "Run a prompt or slash command on a recurring interval",
    category: "nav",
  },
  "/claude-api": {
    description: "Build apps with the Claude API or Anthropic SDK",
    category: "nav",
  },
  // Debug / diagnostics
  "/doctor": {
    description: "Diagnose and verify your Claude Code installation and settings",
    category: "debug",
  },
  "/debug": {
    description: "Enable debug logging for this session and help diagnose issues",
    category: "debug",
  },
  "/feedback": { description: "Submit feedback about Claude Code", category: "debug" },
  // Info
  "/help": { description: "Show help and available commands", category: "info" },
  "/cost": {
    description: "Show the total cost and duration of the current session",
    category: "info",
  },
  "/usage": { description: "Show plan usage limits", category: "info" },
  "/status": {
    description: "Show Claude Code status including version, model, and account",
    category: "info",
  },
  "/context": {
    description: "Visualize current context usage as a colored grid",
    category: "info",
  },
  "/stats": {
    description: "Show your Claude Code usage statistics and activity",
    category: "info",
  },
  "/login": { description: "Sign in to Anthropic", category: "info" },
  "/logout": { description: "Sign out from your Anthropic account", category: "info" },
  "/mcp": { description: "Manage MCP servers", category: "info" },
  "/skills": { description: "List available skills", category: "info" },
  "/tasks": { description: "List background tasks", category: "info" },
  "/install": { description: "Install Claude Code native build", category: "info" },
  "/upgrade": {
    description: "Upgrade to Max for higher rate limits and more Opus",
    category: "info",
  },
  "/insights": {
    description: "Generate a report analyzing your Claude Code sessions",
    category: "info",
  },
  "/stickers": { description: "Order Claude Code stickers", category: "info" },
};

/**
 * Fallback list used when no init data is available yet (session not started,
 * or old CLI that doesn't emit slash_commands in the init event).
 */
export const FALLBACK_SLASH_COMMANDS: SlashCommand[] = Object.entries(KNOWN_COMMAND_INFO)
  .filter(
    (entry): entry is [string, { description: string; category: SlashCommand["category"] }] =>
      entry[1] != null,
  )
  .map(([command, info]) => ({ command, ...info }));

/**
 * Build the full slash command list from the CLI's init event data,
 * supplemented with filesystem-discovered commands.
 *
 * If `initInfo` is undefined (no init event yet), falls back to FALLBACK_SLASH_COMMANDS.
 */
export function buildCommandList(
  initInfo: SessionInitInfo | undefined,
  fsCommands: SlashCommand[],
): SlashCommand[] {
  if (!initInfo) {
    // No init data yet — use full fallback list + filesystem commands
    const seen = new Set(FALLBACK_SLASH_COMMANDS.map((c) => c.command));
    const extra = fsCommands.filter((c) => !seen.has(c.command));
    return [...FALLBACK_SLASH_COMMANDS, ...extra];
  }

  const result: SlashCommand[] = [];
  const seen = new Set<string>();

  // 1. Slash commands reported by CLI
  for (const name of initInfo.slashCommands) {
    const cmd = name.startsWith("/") ? name : `/${name}`;
    if (seen.has(cmd)) continue;
    seen.add(cmd);
    const info = KNOWN_COMMAND_INFO[cmd];
    result.push({
      command: cmd,
      description: info?.description ?? "Slash command",
      category: info?.category ?? "nav",
    });
  }

  // 2. Skills reported by CLI
  for (const name of initInfo.skills) {
    const cmd = name.startsWith("/") ? name : `/${name}`;
    if (seen.has(cmd)) continue;
    seen.add(cmd);
    const info = KNOWN_COMMAND_INFO[cmd];
    result.push({
      command: cmd,
      description: info?.description ?? `Skill: ${name}`,
      category: info?.category ?? "skill",
    });
  }

  // 3. Plugin commands (use plugin name as command)
  for (const plugin of initInfo.plugins) {
    const cmd = plugin.name.startsWith("/") ? plugin.name : `/${plugin.name}`;
    if (seen.has(cmd)) continue;
    seen.add(cmd);
    const info = KNOWN_COMMAND_INFO[cmd];
    result.push({
      command: cmd,
      description: info?.description ?? `Plugin: ${plugin.name}`,
      category: info?.category ?? "plugin",
    });
  }

  // 4. Filesystem-discovered commands (project/personal custom commands)
  for (const fsCmd of fsCommands) {
    if (seen.has(fsCmd.command)) continue;
    seen.add(fsCmd.command);
    result.push(fsCmd);
  }

  return result;
}

// Keep the old export name as an alias for backward compatibility in tests
export const SLASH_COMMANDS = FALLBACK_SLASH_COMMANDS;

const CATEGORY_LABELS: Record<string, string> = {
  session: "Session",
  config: "Configuration",
  nav: "Actions",
  debug: "Diagnostics",
  info: "Info",
  custom: "Project Commands",
  personal: "Personal Commands",
  skill: "Project Skills",
  personal_skill: "Personal Skills",
  plugin: "Plugin Commands",
  plugin_skill: "Plugin Skills",
  marketplace_skill: "Marketplace Skills",
  mcp: "MCP Servers",
  tool: "Tools",
};

interface SlashCommandMenuProps {
  filter: string;
  selectedIndex: number;
  onSelect: (command: string) => void;
  onHover: (index: number) => void;
  /** Full command list (built by buildCommandList or similar) */
  commands?: SlashCommand[];
}

/** Filter commands by the text after "/" */
export function filterCommands(query: string, commands?: SlashCommand[]): SlashCommand[] {
  const all = commands ?? FALLBACK_SLASH_COMMANDS;
  const q = query.toLowerCase();
  if (!q) return all;
  return all.filter(
    (c) => c.command.toLowerCase().includes(q) || c.description.toLowerCase().includes(q),
  );
}

export function SlashCommandMenu({
  filter,
  selectedIndex,
  onSelect,
  onHover,
  commands,
}: SlashCommandMenuProps) {
  const listRef = useRef<HTMLDivElement>(null);
  const filtered = filterCommands(filter, commands);

  // Scroll selected item into view
  useEffect(() => {
    if (!listRef.current) return;
    const selected = listRef.current.querySelector("[data-selected='true']");
    if (selected) {
      selected.scrollIntoView({ block: "nearest" });
    }
  }, [selectedIndex]);

  if (filtered.length === 0) {
    return (
      <div className="absolute bottom-full left-0 right-0 mb-1 rounded-sm border border-outline bg-surface p-3 shadow-lg">
        <p className="text-center text-xs text-on-surface-faint">No matching commands</p>
      </div>
    );
  }

  // Group by category
  let currentCategory = "";
  let globalIndex = -1;

  return (
    <div
      ref={listRef}
      className="absolute bottom-full left-0 right-0 mb-1 max-h-64 overflow-y-auto rounded-sm border border-outline bg-surface shadow-lg"
    >
      {filtered.map((cmd) => {
        globalIndex++;
        const idx = globalIndex;
        const isSelected = idx === selectedIndex;
        const showCategory = cmd.category !== currentCategory;
        currentCategory = cmd.category;

        return (
          <div key={cmd.command}>
            {showCategory && (
              <div className="sticky top-0 bg-surface-sunken px-3 py-1 text-[10px] font-semibold uppercase tracking-wider text-on-surface-faint">
                {CATEGORY_LABELS[cmd.category] ?? cmd.category}
              </div>
            )}
            <button
              data-selected={isSelected}
              onMouseEnter={() => onHover(idx)}
              onClick={() => onSelect(cmd.command)}
              className={`flex w-full cursor-pointer items-center gap-3 px-3 py-1.5 text-left ${
                isSelected ? "bg-brand/10" : "hover:bg-hover"
              }`}
            >
              <code
                className={`shrink-0 text-xs font-medium ${
                  isSelected ? "text-brand" : "text-on-surface"
                }`}
              >
                {cmd.command}
              </code>
              <span className="min-w-0 flex-1 truncate text-xs text-on-surface-faint">
                {cmd.description}
              </span>
            </button>
          </div>
        );
      })}
    </div>
  );
}
