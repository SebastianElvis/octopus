/**
 * Centralized element selectors for E2E tests.
 *
 * Prefer data-testid attributes where available.  Fall back to text content
 * and ARIA selectors.  CSS class selectors are a last resort since they are
 * tightly coupled to styling.
 */

export const selectors = {
  // ── App shell ──────────────────────────────────────────────────────
  appTitle: "h1=TooManyTabs",
  sidebar: "aside",

  // ── Sidebar navigation ────────────────────────────────────────────
  navHome: '[data-testid="nav-home"]',
  navTasks: '[data-testid="nav-tasks"]',
  navRepos: '[data-testid="nav-repos"]',
  settingsButton: 'button[title="Settings"]',

  // ── Dispatch board ─────────────────────────────────────────────────
  dispatchBoard: '[data-testid="dispatch-board"]',
  newSessionButton: "button*=New Session",
  filterInput: 'input[placeholder="Filter sessions..."]',

  // ── Kanban columns ─────────────────────────────────────────────────
  columnAttention: '[data-testid="column-needs-attention"]',
  columnRunning: '[data-testid="column-running"]',
  columnClosed: '[data-testid="column-closed"]',

  // ── Session cards ──────────────────────────────────────────────────
  /** Match a session card by its data-testid (requires session id). */
  sessionCard: (id: string) => `[data-testid="session-card-${id}"]`,
  /** Match any session card. */
  anySessionCard: '[data-testid^="session-card-"]',

  // ── Modals / overlays ──────────────────────────────────────────────
  newSessionModal: '[data-testid="new-session-modal"]',
  settingsModal: '[data-testid="settings-modal"]',
  onboardingDialog: '[data-testid="onboarding-dialog"]',
  commandPalette: '[data-testid="command-palette"]',

  // ── Card action buttons (text-based) ───────────────────────────────
  viewButton: "button=View",
  interruptButton: "button=Interrupt",
  resumeButton: "button=Resume",
  retryButton: "button=Retry",
  killButton: "button=Kill",
} as const;
