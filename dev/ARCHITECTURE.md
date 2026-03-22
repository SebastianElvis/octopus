# TooManyTabs — Architecture & Tech Decisions

**Status:** Draft
**Last updated:** 2026-03-22

---

## Stack

| Layer | Choice |
|-------|--------|
| Desktop framework | Tauri v2 (Rust backend, WebView frontend) |
| Frontend | React |
| Styling | Tailwind CSS |
| State management | Zustand |
| Database | SQLite via `tauri-plugin-sql` |
| Target OS | macOS (primary), Linux (community/power-user) |

---

## Key Architecture Decisions

### 1. Session state detection — Hybrid (hooks + stdout)

Claude Code's hooks system is used for reliable state transitions (`running` → `waiting` → `done`). Hooks write structured JSON events to a known location that TooManyTabs watches. Stdout is captured separately and used **only** for the live terminal output panel — never for state inference.

Rationale: stdout parsing is fragile against format changes. Hooks provide a stable, structured signal for the critical state machine.

### 2. Process management — Direct child process spawn

TooManyTabs spawns Claude Code as a direct child process via Tauri's `Command` API, owning stdin/stdout/stderr pipes. No tmux dependency.

Rationale: clean process lifecycle ownership, simpler IPC, no dependency on user's tmux setup. Users who want terminal access can use the "open in terminal" escape hatch.

### 3. Data storage — SQLite metadata + log files on disk

- **SQLite** stores: sessions, repos, settings, GitHub links, session state history
- **Log files** stored on disk at `~/.toomanytabs/logs/<session-id>/` — full Claude output, structured hook events
- SQLite indexes log file paths and metadata (timestamps, line counts) for fast lookup

Rationale: session logs can be multi-MB. Keeping them out of SQLite avoids DB bloat and makes logs easy to inspect externally.

### 4. GitHub integration — `gh` CLI hybrid

Auth is delegated to the user's existing `gh` CLI setup. On startup, TooManyTabs runs `gh auth token` to obtain a valid GitHub token. All subsequent GitHub API calls (issues, PRs, reviews, labels) are made as structured REST calls from the Rust backend using `reqwest` with that token.

Rationale: avoids building a full OAuth flow. Users who have `gh` installed (the target audience) already have auth configured. Structured REST calls are more reliable than parsing `gh` CLI output.

Prerequisite: `gh` CLI must be installed and authenticated. TooManyTabs checks this on first launch and guides the user if not.

### 5. Browser extension — Deferred

Not high priority for v1. May revisit post-MVP for "assign to TooManyTabs" from GitHub issue pages.

### 6. Worktree storage — TooManyTabs-managed directory

Worktrees are created under `~/.toomanytabs/worktrees/<repo-name>/<session-id>/`.

Rationale: keeps user repos clean, gives TooManyTabs full control over lifecycle, avoids polluting `.git/worktrees/`.

### 7. IPC pattern — Commands + Event subscriptions

- **Tauri commands** (`invoke`): create session, kill session, reply, interrupt, commit & push, open PR, fetch GitHub data
- **Tauri events** (`emit`/`listen`): session state changes, new stdout lines, notification triggers, hook events

The Zustand store subscribes to Tauri events on app mount. No polling — all state updates are push-based.

---

## Directory structure (runtime)

```
~/.toomanytabs/
├── db/
│   └── toomanytabs.db          # SQLite database
├── logs/
│   └── <session-id>/
│       ├── stdout.log           # Raw Claude Code output
│       └── events.jsonl         # Structured hook events
└── worktrees/
    └── <repo-name>/
        └── <session-id>/        # Git worktree checkout
```

---

## Open questions (carried from DESIGN.md)

1. **Token budget per session.** Display-only in v1, or enforce limits? Deferred.
2. **Recap generation.** Requires secondary Claude API call against session log. Cost/latency TBD.
3. **Concurrent session limit.** No hard limit in v1. May add warnings later.
