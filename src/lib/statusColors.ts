/**
 * Centralized status color scheme for consistent visual indicators across all components.
 *
 * Color mapping:
 *   running     = blue (animated pulse)
 *   waiting     = yellow/amber
 *   completed   = green
 *   failed      = red
 *   stuck       = orange
 *   interrupted = gray
 *   paused      = purple/indigo
 *   killed      = red (darker)
 *   idle        = gray
 *   done        = gray (alias for closed/done)
 */

/** Status pill classes used inside badges (KanbanCard, SessionDetail, CommandPalette, SessionCard). */
export const STATUS_PILL: Record<string, string> = {
  running: "bg-blue-500/20 text-blue-600 ring-1 ring-blue-500/30 dark:text-blue-400",
  waiting: "bg-amber-500/20 text-amber-600 ring-1 ring-amber-500/30 dark:text-amber-400",
  completed: "bg-green-500/20 text-green-600 ring-1 ring-green-500/30 dark:text-green-400",
  failed: "bg-red-500/20 text-red-600 ring-1 ring-red-500/30 dark:text-red-400",
  stuck: "bg-orange-500/20 text-orange-600 ring-1 ring-orange-500/30 dark:text-orange-400",
  interrupted: "bg-gray-500/20 text-gray-500 ring-1 ring-gray-500/30 dark:text-gray-400",
  paused: "bg-purple-500/20 text-purple-600 ring-1 ring-purple-500/30 dark:text-purple-400",
  killed: "bg-red-800/20 text-red-800 ring-1 ring-red-800/30 dark:text-red-500",
  idle: "bg-gray-500/20 text-gray-500 ring-1 ring-gray-500/30 dark:text-gray-400",
  done: "bg-gray-500/20 text-gray-500 ring-1 ring-gray-500/30 dark:text-gray-400",
};

/** Small dot colors used in lists, column headers, and command palette. */
export const STATUS_DOT: Record<string, string> = {
  running: "bg-blue-500",
  waiting: "bg-amber-500",
  completed: "bg-green-500",
  failed: "bg-red-500",
  stuck: "bg-orange-500",
  interrupted: "bg-gray-500",
  paused: "bg-purple-500",
  killed: "bg-red-800",
  idle: "bg-gray-400",
  done: "bg-gray-400",
};

/** Accent bar colors used in SessionCard left border. */
export const STATUS_ACCENT: Record<string, string> = {
  running: "bg-blue-500",
  waiting: "bg-amber-500",
  completed: "bg-green-500",
  failed: "bg-red-500",
  stuck: "bg-orange-500",
  interrupted: "bg-gray-500",
  paused: "bg-purple-500",
  killed: "bg-red-800",
  idle: "bg-gray-400",
  done: "bg-gray-400",
};

/** Left border colors for closed/inactive sessions in KanbanCard. */
export const CLOSED_BORDER: Record<string, string> = {
  completed: "border-l-green-500",
  done: "border-l-gray-400",
  failed: "border-l-red-500",
  killed: "border-l-red-800",
  idle: "border-l-gray-400",
  interrupted: "border-l-gray-500",
};

/** Human-friendly labels for statuses. */
export const STATUS_LABEL: Record<string, string> = {
  completed: "completed",
  done: "closed",
  failed: "failed",
  killed: "killed",
  idle: "idle",
  waiting: "waiting",
  running: "running",
  paused: "paused",
  stuck: "stuck",
  interrupted: "interrupted",
};

/** Block type pill classes (for waiting sessions). */
export const BLOCK_TYPE_PILL: Record<string, string> = {
  decision: "bg-orange-500/20 text-orange-600 ring-1 ring-orange-500/30 dark:text-orange-400",
  review: "bg-purple-500/20 text-purple-600 ring-1 ring-purple-500/30 dark:text-purple-400",
  confirm: "bg-yellow-500/20 text-yellow-600 ring-1 ring-yellow-500/30 dark:text-yellow-400",
};

/**
 * CSS class for animated pulse on the "running" status dot.
 * Apply alongside STATUS_DOT for running sessions.
 */
export const RUNNING_PULSE = "animate-pulse";
