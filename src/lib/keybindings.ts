/**
 * Keybinding configuration system.
 *
 * Defines default keyboard shortcuts and supports user overrides
 * stored in localStorage. The overlay and all keyboard handlers
 * read from this single source of truth.
 */

// ── Types ────────────────────────────────────────────────────────────────────

export interface KeyBinding {
  /** Unique identifier for the action */
  id: string;
  /** Human-readable key combo, e.g. "Cmd+K", "Ctrl+C" */
  keys: string;
  /** Description shown in the shortcuts overlay */
  description: string;
  /** Section grouping for the overlay */
  section: "Navigation" | "Sessions" | "Input" | "Help";
}

// ── Defaults ─────────────────────────────────────────────────────────────────

const DEFAULT_KEYBINDINGS: KeyBinding[] = [
  // Navigation
  { id: "command-palette", keys: "Cmd+K", description: "Open command palette", section: "Navigation" },
  { id: "go-home", keys: "Cmd+1", description: "Go to Home / Board", section: "Navigation" },
  { id: "go-tasks", keys: "Cmd+2", description: "Go to Tasks", section: "Navigation" },
  { id: "go-repos", keys: "Cmd+3", description: "Go to Repos", section: "Navigation" },
  { id: "toggle-sidebar", keys: "Cmd+B", description: "Toggle sidebar", section: "Navigation" },
  { id: "open-settings", keys: "Cmd+,", description: "Open settings", section: "Navigation" },
  { id: "close-or-back", keys: "Esc", description: "Close modal / Go back", section: "Navigation" },

  // Sessions
  { id: "new-session", keys: "Cmd+N", description: "Create new session", section: "Sessions" },
  { id: "jump-waiting", keys: "Cmd+J", description: "Jump to next waiting session", section: "Sessions" },
  { id: "interrupt-session", keys: "Ctrl+C", description: "Interrupt running session", section: "Sessions" },
  { id: "clear-terminal", keys: "Ctrl+L", description: "Clear terminal", section: "Sessions" },

  // Input
  { id: "send-reply", keys: "Cmd+Enter", description: "Send reply", section: "Input" },
  { id: "newline-alt", keys: "Alt+Enter", description: "Insert newline in reply", section: "Input" },
  { id: "newline-ctrl-j", keys: "Ctrl+J", description: "Insert newline in reply", section: "Input" },

  // Help
  { id: "show-shortcuts", keys: "Cmd+?", description: "Toggle shortcuts overlay", section: "Help" },
];

// ── Storage ──────────────────────────────────────────────────────────────────

const STORAGE_KEY = "tmt-keybindings";

function loadOverrides(): Record<string, string> {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return JSON.parse(raw) as Record<string, string>;
  } catch {
    /* ignore */
  }
  return {};
}

export function saveOverrides(overrides: Record<string, string>): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(overrides));
  } catch {
    /* ignore */
  }
}

/** Returns all keybindings with user overrides applied. */
export function getKeybindings(): KeyBinding[] {
  const overrides = loadOverrides();
  return DEFAULT_KEYBINDINGS.map((kb) => ({
    ...kb,
    keys: overrides[kb.id] ?? kb.keys,
  }));
}

/** Get a single keybinding by id. */
export function getKeybinding(id: string): KeyBinding | undefined {
  const overrides = loadOverrides();
  const def = DEFAULT_KEYBINDINGS.find((kb) => kb.id === id);
  if (!def) return undefined;
  return { ...def, keys: overrides[id] ?? def.keys };
}

/** Returns keybindings grouped by section. */
export function getKeybindingsBySection(): { section: string; items: KeyBinding[] }[] {
  const all = getKeybindings();
  const sectionOrder = ["Navigation", "Sessions", "Input", "Help"];
  const grouped = new Map<string, KeyBinding[]>();
  for (const kb of all) {
    const list = grouped.get(kb.section) ?? [];
    list.push(kb);
    grouped.set(kb.section, list);
  }
  return sectionOrder
    .filter((s) => grouped.has(s))
    .map((s) => ({ section: s, items: grouped.get(s) ?? [] }));
}

// ── Event matching ───────────────────────────────────────────────────────────

/**
 * Check if a KeyboardEvent matches a key combo string like "Cmd+K" or "Ctrl+C".
 *
 * Modifier mapping:
 *   - "Cmd" → metaKey OR ctrlKey (cross-platform: Cmd on Mac, Ctrl on Win/Linux)
 *   - "Ctrl" → ctrlKey only (literal Ctrl, e.g. for terminal signals)
 *   - "Alt" → altKey
 *   - "Shift" → shiftKey
 */
export function matchesKeybinding(e: KeyboardEvent, keys: string): boolean {
  const parts = keys.split("+").map((p) => p.trim());
  const key = parts[parts.length - 1];
  const modifiers = parts.slice(0, -1);

  // Determine required modifier state
  let needCmd = false; // metaKey || ctrlKey
  let needCtrl = false; // ctrlKey only (strict)
  let needAlt = false;
  let needShift = false;

  for (const mod of modifiers) {
    switch (mod) {
      case "Cmd":
        needCmd = true;
        break;
      case "Ctrl":
        needCtrl = true;
        break;
      case "Alt":
        needAlt = true;
        break;
      case "Shift":
        needShift = true;
        break;
    }
  }

  // Check modifiers
  if (needCmd && !(e.metaKey || e.ctrlKey)) return false;
  if (needCtrl && !e.ctrlKey) return false;
  if (needAlt && !e.altKey) return false;
  if (needShift && !e.shiftKey) return false;

  // Ensure no extra modifiers are pressed (except when Cmd matches ctrlKey,
  // ctrlKey is naturally true)
  if (!needCmd && !needCtrl && (e.metaKey || e.ctrlKey)) return false;
  if (!needAlt && e.altKey) return false;
  if (!needShift && e.shiftKey) return false;

  // Match the key
  switch (key) {
    case "Enter":
      return e.key === "Enter";
    case "Esc":
      return e.key === "Escape";
    case "Tab":
      return e.key === "Tab";
    case "?":
      return e.key === "/" || e.key === "?";
    default:
      return e.key.toLowerCase() === key.toLowerCase();
  }
}

/**
 * Convenience: check if an event matches a keybinding by id.
 * Returns false if the keybinding is not found.
 */
export function matchesKeybindingById(e: KeyboardEvent, id: string): boolean {
  const kb = getKeybinding(id);
  if (!kb) return false;
  return matchesKeybinding(e, kb.keys);
}
