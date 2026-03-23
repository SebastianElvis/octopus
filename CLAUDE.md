# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What This Is

TooManyTabs is a Tauri 2 desktop app (React 19 + Rust) that serves as a dispatch board for managing multiple Claude Code sessions in parallel. It provides a kanban-style UI to track session status, integrated terminal/editor, git operations, and GitHub integration.

## Commands

### Frontend (from repo root)
```bash
npm run dev          # Vite dev server
npm run build        # tsc --noEmit + vite build
npm run test         # vitest run (once)
npm run test:watch   # vitest watch mode
npm run lint         # eslint
npm run lint:fix     # eslint --fix
npm run format       # prettier --write
npm run format:check # prettier --check
npm run check        # full CI check (lint + format + test + typecheck)
```

Run a single test file:
```bash
npx vitest run src/hooks/__tests__/useAsync.test.ts
```

### Backend (from repo root, Cargo workspace is configured)
```bash
cargo build          # debug build
cargo build --release
cargo fmt -- --check # format check
cargo clippy -- -D warnings  # lint
cargo test           # run Rust tests
```

### Full app
```bash
npm run tauri dev    # run Tauri app in dev mode
npm run tauri build  # production build
```

## Architecture

### Frontend → Backend Communication
- **Commands**: Frontend calls Rust via `invoke("command_name", { args })` through wrapper functions in `src/lib/tauri.ts`
- **Events**: Backend emits events (`session-state-changed`, `session-output`) that frontend subscribes to via the `useTauriEvent` hook
- **Type mapping**: Rust uses snake_case with serde rename to camelCase; `mapBackendSession()` in tauri.ts handles the conversion

### State Management (Zustand)
Each store in `src/stores/` manages a domain: `sessionStore` (sessions + output buffers), `uiStore` (panel sizes, persisted to localStorage), `editorStore` (open tabs), `gitStore` (staging/diffs), `fileBrowserStore`, `repoStore`, `themeStore`.

### Rust Backend (`src-tauri/src/`)
- `state.rs`: `AppState` holds `Mutex<Connection>` (SQLite), process maps for sessions and shells
- `commands/sessions.rs`: PTY-based session spawning, output reading via background tokio tasks, signal handling (SIGINT/SIGSTOP/SIGCONT/SIGKILL)
- `commands/shell.rs`: Separate shell terminal management
- `commands/git_ops.rs` + `github.rs` + `worktree.rs`: Git and GitHub operations
- `db.rs`: SQLite with WAL mode, schema migrations
- `error.rs`: `AppError` type using `thiserror`

### Session Status Flow
`idle` → `running` → `waiting` (needs user input) / `completed` / `failed`
Special states: `stuck` (no output 20+ min), `interrupted` (process died), `paused`, `killed`

### Database (SQLite)
Stored at `~/.toomanytabs/toomanytabs.db`. Two tables: `repos` (GitHub URL, local path) and `sessions` (linked to repo, tracks status, worktree path, linked issue/PR numbers).

## Key Patterns

- **`useTauriEvent(subscribeFn, deps)`**: Handles async subscription with proper cleanup, including edge case where component unmounts before subscription resolves
- **`useAsync(factory, deps)`**: Returns `{ data, loading, error, reload }` with stale request cancellation
- **ResizeHandle**: Uses refs (not closures) in mouse event handlers to avoid stale state during drag operations
- **Tauri lazy imports**: `src/lib/env.ts` detects Tauri environment; frontend can render in browser without Tauri for development

## Testing

- **Framework**: Vitest + jsdom + React Testing Library
- **Globals**: `describe`, `it`, `expect`, `vi` are available without imports
- **Setup**: `src/test/setup.ts`
- **Pattern for components with async effects**: Use `await act(async () => {})` to let effects settle, then `act(() => store.setState(...))` to set test state
- **jsdom limitations**: `scrollIntoView` and `AudioContext` need mocking; use `Element.prototype.scrollIntoView = vi.fn()`
- **Tauri mocking**: Mock `src/lib/tauri.ts` module with `vi.mock()` since Tauri APIs aren't available in test environment

## CI (GitHub Actions)

Frontend job: `tsc --noEmit` → `eslint` → `prettier --check` → `vitest run`
Backend job: `cargo fmt -- --check` → `cargo clippy -- -D warnings` → `cargo test`

## Lint Rules to Know

- ESLint enforces `@typescript-eslint/no-floating-promises` — always await or void promises
- `@typescript-eslint/consistent-type-imports` — use `import type` for type-only imports
- React hooks rules are enforced (deps arrays, rules of hooks)
- Test files have relaxed rules but still enforce most TypeScript strict checks
