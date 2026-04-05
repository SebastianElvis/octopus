# Octopus

A desktop dispatch board for managing multiple [Claude Code](https://docs.anthropic.com/en/docs/claude-code) sessions in parallel. Built with Tauri 2, React 19, and Rust.

Octopus gives you a kanban-style interface to spawn, monitor, and coordinate many Claude Code sessions at once — with integrated terminals, a code editor, git operations, and GitHub issue/PR workflows built in.

## Features

- **Multi-session management** — Spawn and track multiple Claude Code sessions simultaneously with structured output streaming
- **Dispatch board** — Kanban view with session status tracking (running, attention, done)
- **Structured Claude UI** — Renders Claude CLI JSON events as rich message blocks (text, thinking, tool use, tool results) instead of raw terminal output
- **Permission handling** — Inline accept/deny for Claude CLI hook permission requests with freeform reply
- **Full ship pipeline** — CI status, merge PR (squash/merge/rebase), auto-close linked issues — zero visits to github.com
- **Session recaps** — Claude API-powered summaries of what a session did and what it's asking
- **Slash commands** — Dynamic discovery of 80+ Claude Code slash commands with autocomplete
- **Smart waiting UX** — See what Claude is asking (lastMessage), quick-reply with Allow/Deny or freeform text
- **Session archiving** — Archive completed sessions with graceful shutdown, grouped in sidebar
- **Code editor** — CodeMirror 6 with syntax highlighting, diff viewing, and multi-tab support
- **Git operations** — Stage, unstage, discard, commit, and push with git status indicators in the file browser
- **Git worktrees** — Create isolated worktrees per session so multiple Claude Code instances can work on the same repo without conflicts
- **GitHub integration** — Fetch issues and PRs, create sessions from issues, create PRs from sessions, view review comments, CI checks
- **Repo-centric sidebar** — Redesigned navigation organized by repository with session grouping
- **AI branch names** — Auto-generate descriptive branch names from session context
- **Crash recovery** — Sentinel-based unclean shutdown detection, orphaned session/worktree cleanup, prerequisite validation
- **First-run onboarding** — Guided setup with prerequisite checks (claude, git, gh), step-by-step walkthrough
- **Command palette** — Quick actions via `Cmd+K` with status indicators, plus keyboard shortcuts overlay (`Cmd+?`)
- **Settings** — API key management, terminal font size, theme preferences
- **Dark/light theme** — WCAG-compliant contrast, consistent status colors, polished dark mode

## Tech Stack

| Layer | Technologies |
|-------|-------------|
| Frontend | React 19, TypeScript, Vite, Tailwind CSS 4, Zustand |
| Backend | Rust, Tauri 2, tokio, SQLite (rusqlite) |
| Editor | CodeMirror 6 with language support and merge view |
| Terminal | xterm.js 6 with WebGL addon |
| CI | GitHub Actions (ESLint, Prettier, Vitest, Clippy, cargo test) |

## Getting Started

### Prerequisites

- [Node.js](https://nodejs.org/) 22+
- [Rust](https://rustup.rs/) 1.77.2+
- Tauri system dependencies ([see Tauri docs](https://v2.tauri.app/start/prerequisites/))

### Install & Run

```bash
# Install frontend dependencies
npm install

# Run in development mode
npm run tauri dev

# Build for production
npm run tauri build
```

### Development (frontend only)

```bash
npm run dev          # Vite dev server (http://localhost:1420)
npm run lint         # ESLint
npm run format       # Prettier
npm run test         # Vitest
npm run check        # All checks (typecheck + lint + format + test)
```

### Development (backend only)

```bash
cargo build
cargo test
cargo clippy -- -D warnings
cargo fmt -- --check
```

## Architecture

```
src/                    React frontend
  components/           46 UI components (dispatch board, Claude UI, editor, git, GitHub, settings)
  components/claude/    Structured Claude output (message blocks, permissions, slash commands, analytics)
  stores/               Zustand stores (sessions, UI, editor, git, repos, theme, hooks)
  hooks/                Custom hooks (useAsync, useTauriEvent, useTheme)
  lib/                  Tauri bridge, types, utilities, status colors, error handling

src-tauri/src/          Rust backend
  commands/             Tauri command handlers
    sessions.rs         PTY-based session spawning, throttled output, prompt detection, archiving
    shell.rs            Standalone shell terminal
    repos.rs            Repository management
    git_ops.rs          Git staging, commits, diffs
    github.rs           GitHub API (issues, PRs, reviews, CI checks, merge, close)
    ai.rs               Claude API integration (session recaps, settings)
    worktree.rs         Git worktree lifecycle
    hooks.rs            HTTP hook server for Claude CLI permission requests
    filesystem.rs       Slash command discovery
  db.rs                 SQLite with WAL mode, busy timeout
  state.rs              App state (parking_lot::Mutex, shared HTTP client, token cache)
  error.rs              Structured error codes (DB, IO, HTTP, auth, rate limit)
  lib.rs                Crash recovery, prerequisites, WAL checkpoint
```

**Frontend-backend communication** uses Tauri's IPC: the frontend calls Rust commands via `invoke()`, and the backend emits events (`session-output`, `session-state-changed`) that the frontend subscribes to.

**Data** is stored in SQLite at `~/.octopus/octopus.db` with tables: `repos`, `sessions`, and `settings`.

## License

MIT
