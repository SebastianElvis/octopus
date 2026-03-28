/**
 * Centralized status color scheme for consistent visual indicators across all components.
 *
 * Color mapping:
 *   running   = blue (animated pulse)
 *   attention = amber/yellow
 *   done      = gray
 */

/** Status pill classes used inside badges (KanbanCard, SessionDetail, CommandPalette, SessionCard). */
export const STATUS_PILL: Record<string, string> = {
  running: "bg-blue-500/20 text-blue-600 ring-1 ring-blue-500/30 dark:text-blue-400",
  attention: "bg-amber-500/20 text-amber-600 ring-1 ring-amber-500/30 dark:text-amber-400",
  done: "bg-gray-500/20 text-gray-500 ring-1 ring-gray-500/30 dark:text-gray-400",
};

/** Small dot colors used in lists, column headers, and command palette. */
export const STATUS_DOT: Record<string, string> = {
  running: "bg-blue-500",
  attention: "bg-amber-500",
  done: "bg-gray-400",
};

/** Accent bar colors used in SessionCard left border. */
export const STATUS_ACCENT: Record<string, string> = {
  running: "bg-blue-500",
  attention: "bg-amber-500",
  done: "bg-gray-400",
};

/** Left border colors for done sessions in KanbanCard. */
export const CLOSED_BORDER: Record<string, string> = {
  done: "border-l-gray-400",
};

/** Human-friendly labels for statuses. */
export const STATUS_LABEL: Record<string, string> = {
  attention: "attention",
  running: "running",
  done: "done",
};

/** Block type pill classes (for waiting sessions). */
export const BLOCK_TYPE_PILL: Record<string, string> = {
  permission: "bg-orange-500/20 text-orange-600 ring-1 ring-orange-500/30 dark:text-orange-400",
  confirmation: "bg-yellow-500/20 text-yellow-600 ring-1 ring-yellow-500/30 dark:text-yellow-400",
  question: "bg-purple-500/20 text-purple-600 ring-1 ring-purple-500/30 dark:text-purple-400",
  input: "bg-blue-500/20 text-blue-600 ring-1 ring-blue-500/30 dark:text-blue-400",
};

/**
 * CSS class for animated pulse on the "running" status dot.
 * Apply alongside STATUS_DOT for running sessions.
 */
export const RUNNING_PULSE = "animate-pulse";
