import { useEffect, useRef } from "react";

export interface SlashCommand {
  command: string;
  description: string;
  category: "session" | "config" | "nav" | "debug" | "info" | "custom" | "personal" | "skill" | "personal_skill" | "plugin" | "plugin_skill" | "marketplace_skill" | "mcp" | "tool";
}

/** Common Claude Code slash commands */
export const SLASH_COMMANDS: SlashCommand[] = [
  // Session management
  { command: "/clear", description: "Clear conversation history", category: "session" },
  { command: "/compact", description: "Compact conversation to save context", category: "session" },
  { command: "/resume", description: "Resume a previous session", category: "session" },
  { command: "/rename", description: "Rename the current session", category: "session" },
  { command: "/export", description: "Export conversation as text", category: "session" },
  { command: "/copy", description: "Copy last response to clipboard", category: "session" },
  { command: "/rewind", description: "Rewind conversation to previous point", category: "session" },
  { command: "/branch", description: "Branch conversation at current point", category: "session" },

  // Configuration
  { command: "/config", description: "Open settings", category: "config" },
  { command: "/model", description: "Select or change the AI model", category: "config" },
  { command: "/permissions", description: "View or update permissions", category: "config" },
  { command: "/memory", description: "Edit CLAUDE.md memory files", category: "config" },
  { command: "/init", description: "Initialize project with CLAUDE.md", category: "config" },
  { command: "/fast", description: "Toggle fast mode", category: "config" },
  { command: "/effort", description: "Set model effort level", category: "config" },
  { command: "/theme", description: "Change color theme", category: "config" },
  { command: "/vim", description: "Toggle Vim editing mode", category: "config" },
  { command: "/sandbox", description: "Toggle sandbox mode", category: "config" },
  { command: "/hooks", description: "View hook configurations", category: "config" },
  { command: "/keybindings-help", description: "Customize keyboard shortcuts and keybindings", category: "config" },

  // Navigation / actions
  { command: "/diff", description: "Show uncommitted changes", category: "nav" },
  { command: "/review", description: "Review code changes", category: "nav" },
  { command: "/pr-comments", description: "Fetch GitHub PR comments", category: "nav" },
  { command: "/add-dir", description: "Add a working directory", category: "nav" },
  { command: "/plan", description: "Enter plan mode", category: "nav" },
  { command: "/batch", description: "Orchestrate parallel changes", category: "nav" },
  { command: "/simplify", description: "Review changed code for reuse, quality, and efficiency", category: "nav" },
  { command: "/loop", description: "Run a prompt or slash command on a recurring interval", category: "nav" },
  { command: "/claude-api", description: "Build apps with the Claude API or Anthropic SDK", category: "nav" },

  // Debug / diagnostics
  { command: "/doctor", description: "Diagnose installation issues", category: "debug" },
  { command: "/debug", description: "Enable debug logging", category: "debug" },
  { command: "/feedback", description: "Submit feedback or bug report", category: "debug" },
  { command: "/security-review", description: "Analyze changes for vulnerabilities", category: "debug" },

  // Info
  { command: "/help", description: "Show help and commands", category: "info" },
  { command: "/cost", description: "Show token usage statistics", category: "info" },
  { command: "/usage", description: "Show plan usage and limits", category: "info" },
  { command: "/status", description: "Show version and account info", category: "info" },
  { command: "/context", description: "Visualize context usage", category: "info" },
  { command: "/stats", description: "Visualize daily usage", category: "info" },
  { command: "/login", description: "Sign in to Anthropic", category: "info" },
  { command: "/logout", description: "Sign out from Anthropic", category: "info" },
  { command: "/mcp", description: "Manage MCP servers", category: "info" },
  { command: "/skills", description: "List available skills", category: "info" },
  { command: "/tasks", description: "List background tasks", category: "info" },
  { command: "/install", description: "Install plugins or skills from marketplace", category: "info" },
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
