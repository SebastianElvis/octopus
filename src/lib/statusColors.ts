/**
 * Centralized status color scheme for consistent visual indicators across all components.
 * Uses semantic design tokens defined in index.css (OKLCH, dark-first).
 *
 * Color mapping:
 *   running   = brand cyan
 *   attention = accent gold
 *   done      = green
 */

/** Status pill classes used inside badges (KanbanCard, SessionDetail, CommandPalette, SessionCard). */
export const STATUS_PILL: Record<string, string> = {
  running: "bg-status-running-muted text-status-running ring-1 ring-status-running/30",
  attention: "bg-status-attention-muted text-status-attention ring-1 ring-status-attention/30",
  done: "bg-status-done-muted text-status-done ring-1 ring-status-done/30",
};

/** Small dot colors used in lists, column headers, and command palette. */
export const STATUS_DOT: Record<string, string> = {
  running: "bg-status-running",
  attention: "bg-status-attention",
  done: "bg-status-done",
};

/** Accent bar colors used in SessionCard left border. */
export const STATUS_ACCENT: Record<string, string> = {
  running: "bg-status-running",
  attention: "bg-status-attention",
  done: "bg-status-done",
};

/** Left border colors for done sessions in KanbanCard. */
export const CLOSED_BORDER: Record<string, string> = {
  done: "border-l-status-done",
};

/** Human-friendly labels for statuses. */
export const STATUS_LABEL: Record<string, string> = {
  attention: "attention",
  running: "running",
  done: "done",
  merged: "merged",
};

/** PR state pill classes for KanbanCard and SessionDetail. */
export const PR_STATE_PILL: Record<string, string> = {
  open: "bg-status-done-muted text-status-done ring-1 ring-status-done/30",
  merged: "bg-block-question-muted text-block-question ring-1 ring-block-question/30",
  closed: "bg-danger-muted text-danger ring-1 ring-danger/30",
};

/** Block type pill classes (for waiting sessions). */
export const BLOCK_TYPE_PILL: Record<string, string> = {
  permission: "bg-block-permission-muted text-block-permission ring-1 ring-block-permission/30",
  confirmation:
    "bg-block-confirmation-muted text-block-confirmation ring-1 ring-block-confirmation/30",
  question: "bg-block-question-muted text-block-question ring-1 ring-block-question/30",
  input: "bg-block-input-muted text-block-input ring-1 ring-block-input/30",
};

/**
 * CSS class for animated pulse on the "running" status dot.
 * Apply alongside STATUS_DOT for running sessions.
 */
export const RUNNING_PULSE = "animate-pulse";
