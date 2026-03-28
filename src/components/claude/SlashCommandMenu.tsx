import { useEffect, useRef } from "react";

export interface SlashCommand {
  command: string;
  description: string;
  category: "session" | "config" | "nav" | "debug" | "info" | "custom" | "personal" | "skill" | "personal_skill" | "plugin" | "plugin_skill" | "marketplace_skill" | "mcp" | "tool";
}

/** Built-in Claude Code slash commands (aligned with Claude Code v2.1.86) */
export const SLASH_COMMANDS: SlashCommand[] = [
  // Session management
  { command: "/clear", description: "Clear conversation history and free up context", category: "session" },
  { command: "/compact", description: "Clear conversation history but keep a summary in context", category: "session" },
  { command: "/resume", description: "Resume a previous conversation", category: "session" },
  { command: "/rename", description: "Rename the current conversation", category: "session" },
  { command: "/export", description: "Export the current conversation to a file or clipboard", category: "session" },
  { command: "/copy", description: "Copy Claude's last response to clipboard", category: "session" },
  { command: "/branch", description: "Branch conversation at current point", category: "session" },
  { command: "/btw", description: "Ask a quick side question without interrupting the main conversation", category: "session" },
  { command: "/exit", description: "Exit the current session", category: "session" },
  { command: "/tag", description: "Toggle a searchable tag on the current session", category: "session" },

  // Configuration
  { command: "/config", description: "Open config panel", category: "config" },
  { command: "/model", description: "Select or change the AI model", category: "config" },
  { command: "/permissions", description: "View or update permissions", category: "config" },
  { command: "/memory", description: "Edit Claude memory files", category: "config" },
  { command: "/init", description: "Initialize project with CLAUDE.md", category: "config" },
  { command: "/fast", description: "Toggle fast mode", category: "config" },
  { command: "/effort", description: "Set effort level for model usage", category: "config" },
  { command: "/theme", description: "Change the theme", category: "config" },
  { command: "/vim", description: "Toggle between Vim and Normal editing modes", category: "config" },
  { command: "/hooks", description: "View hook configurations for tool events", category: "config" },
  { command: "/keybindings", description: "Open or create your keybindings configuration file", category: "config" },
  { command: "/color", description: "Set the prompt bar color for this session", category: "config" },
  { command: "/voice", description: "Toggle voice mode", category: "config" },
  { command: "/privacy-settings", description: "View and update your privacy settings", category: "config" },
  { command: "/extra-usage", description: "Configure extra usage to keep working when limits are hit", category: "config" },
  { command: "/plugin", description: "Plugin management", category: "config" },
  { command: "/reload-plugins", description: "Activate pending plugin changes in the current session", category: "config" },
  { command: "/ide", description: "Manage IDE integrations and show status", category: "config" },
  { command: "/terminal-setup", description: "Set up terminal integration", category: "config" },
  { command: "/remote-control", description: "Bridge session to claude.ai/code", category: "config" },
  { command: "/remote-env", description: "Configure the default remote environment for teleport sessions", category: "config" },
  { command: "/agents", description: "Manage agent configurations", category: "config" },

  // Navigation / actions
  { command: "/diff", description: "View uncommitted changes and per-turn diffs", category: "nav" },
  { command: "/review", description: "Review a pull request", category: "nav" },
  { command: "/pr-comments", description: "Get comments from a GitHub pull request", category: "nav" },
  { command: "/add-dir", description: "Add a new working directory", category: "nav" },
  { command: "/plan", description: "Enable plan mode or view the current session plan", category: "nav" },
  { command: "/commit", description: "Create a git commit", category: "nav" },
  { command: "/commit-push-pr", description: "Commit, push, and open a PR", category: "nav" },
  { command: "/init-verifiers", description: "Create verifier skill(s) for automated verification of code changes", category: "nav" },
  { command: "/security-review", description: "Complete a security review of the pending changes on the current branch", category: "nav" },
  { command: "/batch", description: "Research and plan a large-scale change, then execute it in parallel", category: "nav" },
  { command: "/schedule", description: "Create, update, list, or run scheduled remote agents", category: "nav" },

  // Debug / diagnostics
  { command: "/doctor", description: "Diagnose and verify your Claude Code installation and settings", category: "debug" },
  { command: "/debug", description: "Enable debug logging for this session and help diagnose issues", category: "debug" },
  { command: "/feedback", description: "Submit feedback about Claude Code", category: "debug" },

  // Info
  { command: "/help", description: "Show help and available commands", category: "info" },
  { command: "/cost", description: "Show the total cost and duration of the current session", category: "info" },
  { command: "/usage", description: "Show plan usage limits", category: "info" },
  { command: "/status", description: "Show Claude Code status including version, model, and account", category: "info" },
  { command: "/context", description: "Visualize current context usage as a colored grid", category: "info" },
  { command: "/stats", description: "Show your Claude Code usage statistics and activity", category: "info" },
  { command: "/login", description: "Sign in to Anthropic", category: "info" },
  { command: "/logout", description: "Sign out from your Anthropic account", category: "info" },
  { command: "/mcp", description: "Manage MCP servers", category: "info" },
  { command: "/skills", description: "List available skills", category: "info" },
  { command: "/tasks", description: "List background tasks", category: "info" },
  { command: "/install", description: "Install Claude Code native build", category: "info" },
  { command: "/upgrade", description: "Upgrade to Max for higher rate limits and more Opus", category: "info" },
  { command: "/insights", description: "Generate a report analyzing your Claude Code sessions", category: "info" },
  { command: "/stickers", description: "Order Claude Code stickers", category: "info" },
];

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
  /** Extra commands discovered from the filesystem or session tools */
  dynamicCommands?: SlashCommand[];
}

/** Filter commands by the text after "/" */
export function filterCommands(query: string, extra?: SlashCommand[]): SlashCommand[] {
  const all = extra ? [...SLASH_COMMANDS, ...extra] : SLASH_COMMANDS;
  const q = query.toLowerCase();
  if (!q) return all;
  return all.filter(
    (c) =>
      c.command.toLowerCase().includes(q) ||
      c.description.toLowerCase().includes(q),
  );
}

export function SlashCommandMenu({
  filter,
  selectedIndex,
  onSelect,
  onHover,
  dynamicCommands,
}: SlashCommandMenuProps) {
  const listRef = useRef<HTMLDivElement>(null);
  const filtered = filterCommands(filter, dynamicCommands);

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
      <div className="absolute bottom-full left-0 right-0 mb-1 rounded-lg border border-gray-200 bg-white p-3 shadow-lg dark:border-gray-700 dark:bg-gray-900">
        <p className="text-center text-xs text-gray-400 dark:text-gray-500">
          No matching commands
        </p>
      </div>
    );
  }

  // Group by category
  let currentCategory = "";
  let globalIndex = -1;

  return (
    <div
      ref={listRef}
      className="absolute bottom-full left-0 right-0 mb-1 max-h-64 overflow-y-auto rounded-lg border border-gray-200 bg-white shadow-lg dark:border-gray-700 dark:bg-gray-900"
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
              <div className="sticky top-0 bg-gray-50 px-3 py-1 text-[10px] font-semibold uppercase tracking-wider text-gray-400 dark:bg-gray-800/80 dark:text-gray-500">
                {CATEGORY_LABELS[cmd.category] ?? cmd.category}
              </div>
            )}
            <button
              data-selected={isSelected}
              onMouseEnter={() => onHover(idx)}
              onClick={() => onSelect(cmd.command)}
              className={`flex w-full cursor-pointer items-center gap-3 px-3 py-1.5 text-left ${
                isSelected
                  ? "bg-blue-50 dark:bg-blue-950/30"
                  : "hover:bg-gray-50 dark:hover:bg-gray-800/50"
              }`}
            >
              <code
                className={`shrink-0 text-xs font-medium ${
                  isSelected
                    ? "text-blue-600 dark:text-blue-400"
                    : "text-gray-700 dark:text-gray-300"
                }`}
              >
                {cmd.command}
              </code>
              <span className="min-w-0 flex-1 truncate text-xs text-gray-400 dark:text-gray-500">
                {cmd.description}
              </span>
            </button>
          </div>
        );
      })}
    </div>
  );
}
