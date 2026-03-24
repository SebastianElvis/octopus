# TooManyTabs

A desktop dispatch board for managing multiple [Claude Code](https://docs.anthropic.com/en/docs/claude-code) sessions in parallel. Built with Tauri 2, React 19, and Rust.

TooManyTabs gives you a kanban-style interface to spawn, monitor, and coordinate many Claude Code sessions at once — with integrated terminals, a code editor, git operations, and GitHub issue/PR workflows built in.

## Features

- **Multi-session management** — Spawn and track multiple Claude Code sessions simultaneously with real-time output streaming
- **Dispatch board** — Kanban view with session status tracking (running, waiting, completed, failed, paused, stuck)
- **Full ship pipeline** — CI status, merge PR (squash/merge/rebase), auto-close linked issues — zero visits to github.com
- **Session recaps** — Claude API-powered summaries of what a session did and what it's asking
- **Smart waiting UX** — See what Claude is asking (lastMessage), quick-reply with Allow/Deny or freeform text
- **Integrated terminal** — xterm.js terminal with WebGL rendering for each session, plus a standalone shell
- **Code editor** — CodeMirror 6 with syntax highlighting, diff viewing, and multi-tab support
- **Git operations** — Stage, unstage, discard, commit, and push with separate commit/push controls
- **Git worktrees** — Create isolated worktrees per session so multiple Claude Code instances can work on the same repo without conflicts
- **GitHub integration** — Fetch issues and PRs, create sessions from issues, create PRs from sessions, view review comments, CI checks
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
  components/           35+ UI components (dispatch board, terminal, editor, git, GitHub, settings)
  stores/               Zustand stores (sessions, UI, editor, git, repos, theme)
  hooks/                Custom hooks (useAsync, useTauriEvent, useTheme)
  lib/                  Tauri bridge, types, utilities, status colors, error handling

src-tauri/src/          Rust backend
  commands/             Tauri command handlers
    sessions.rs         PTY-based session spawning, throttled output, prompt detection
    shell.rs            Standalone shell terminal
    git_ops.rs          Git staging, commits, diffs
    github.rs           GitHub API (issues, PRs, reviews, CI checks, merge, close)
    ai.rs               Claude API integration (session recaps, settings)
    worktree.rs         Git worktree lifecycle
  db.rs                 SQLite with WAL mode, versioned migrations, busy timeout
  state.rs              App state (parking_lot::Mutex, shared HTTP client, token cache)
  error.rs              Structured error codes (DB, IO, HTTP, auth, rate limit)
  lib.rs                Crash recovery, prerequisites, WAL checkpoint
```

**Frontend-backend communication** uses Tauri's IPC: the frontend calls Rust commands via `invoke()`, and the backend emits events (`session-output`, `session-state-changed`) that the frontend subscribes to.

**Data** is stored in SQLite at `~/.toomanytabs/toomanytabs.db` with tables: `repos`, `sessions`, `settings`, and `schema_version`.

## License

MIT
