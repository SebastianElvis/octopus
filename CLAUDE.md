# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What This Is

TooManyTabs is a Tauri 2 desktop app (React 19 + Rust) that serves as a dispatch board for managing multiple Claude Code sessions in parallel. It provides a kanban-style UI to track session status, integrated terminal/editor, git operations, and GitHub integration.

## Commands

### Frontend (from repo root)
```bash
npm run dev              # Vite dev server
npm run build            # tsc --noEmit + vite build
npm run test             # vitest unit tests (once)
npm run test:watch       # vitest watch mode
npm run test:integration # vitest integration tests (mockIPC)
npm run test:all         # unit + integration tests
npm run lint             # eslint
npm run lint:fix         # eslint --fix
npm run format           # prettier --write
npm run format:check     # prettier --check
npm run check            # full CI check (lint + format + test:all + typecheck)
```

Run a single test file:
```bash
npx vitest run src/hooks/__tests__/useAsync.test.ts
npx vitest run --config vitest.integration.config.ts src/__tests__/integration/app-navigation.test.tsx
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
- `state.rs`: `AppState` holds `parking_lot::Mutex<Connection>` (SQLite), process maps, shared `reqwest::Client`, cached GitHub token
- `commands/sessions.rs`: PTY-based session spawning, throttled output (16ms batching via mpsc channel), prompt detection (`detect_prompt_pattern`), process group signals, graceful shutdown (SIGINT→SIGTERM→SIGKILL), 10MB output cap
- `commands/shell.rs`: Separate shell terminal management with process group signals
- `commands/git_ops.rs` + `github.rs` + `worktree.rs`: Git and GitHub operations
- `commands/github.rs`: GitHub API with shared HTTP client, token caching (5min), retry with exponential backoff, rate limit handling, CI checks, PR merge, issue close
- `commands/ai.rs`: Claude API integration for session recaps, key-value settings store
- `db.rs`: SQLite with WAL mode, `CREATE TABLE IF NOT EXISTS` schema init, `PRAGMA busy_timeout = 5000`, periodic WAL checkpoint
- `error.rs`: `AppError` with structured error codes (`DB_ERROR`, `IO_ERROR`, `HTTP_ERROR`, `NOT_FOUND`, `AUTH_FAILED`, `RATE_LIMITED`)
- `lib.rs`: Crash recovery (sentinel file, session recovery, orphaned worktree scan), prerequisites check, WAL checkpoint background task

### Session Status Flow
`idle` → `running` → `waiting` (needs user input) / `completed` / `failed`
Special states: `stuck` (no output 20+ min), `interrupted` (process died), `paused`, `killed`

### Database (SQLite)
Stored at `~/.toomanytabs/toomanytabs.db`. Tables: `repos` (GitHub URL, local path), `sessions` (linked to repo, tracks status, worktree path, linked issue/PR numbers, last_message), `settings` (key-value store for API keys etc.). Schema is created on startup via `db::create_schema()` using `CREATE TABLE IF NOT EXISTS`.

## Key Patterns

- **`useTauriEvent(subscribeFn, deps)`**: Handles async subscription with proper cleanup, including edge case where component unmounts before subscription resolves
- **`useAsync(factory, deps)`**: Returns `{ data, loading, error, reload }` with stale request cancellation
- **ResizeHandle**: Uses refs (not closures) in mouse event handlers to avoid stale state during drag operations
- **Tauri lazy imports**: `src/lib/env.ts` detects Tauri environment; frontend can render in browser without Tauri for development
- **Status colors**: Centralized in `src/lib/statusColors.ts` — single source of truth for status→color mapping across all components
- **Structured errors**: Backend returns `{ code, message }` objects; frontend uses `isStructuredError()` / `getErrorCode()` in `src/lib/errors.ts`
- **IPC timeout**: All `tauriInvoke` calls have a 30s timeout wrapper to prevent hung UI on backend deadlocks

## Testing

### Unit tests (`npm test`)
- **Framework**: Vitest + jsdom + React Testing Library
- **Setup**: `src/test/setup.ts` — globally mocks `@tauri-apps/api/core`, `@tauri-apps/api/event`, and `src/lib/env`
- **Config**: `vitest.config.ts`
- **Pattern**: Mock `src/lib/tauri.ts` at the module level, set Zustand store state directly
- **Globals**: `describe`, `it`, `expect`, `vi` are available without imports
- **jsdom limitations**: `scrollIntoView` and `AudioContext` need mocking

### Integration tests (`npm run test:integration`)
- **Setup**: `src/test/integration-setup.ts` — uses `@tauri-apps/api/mocks` (`mockIPC`, `mockWindows`)
- **Config**: `vitest.integration.config.ts`
- **Location**: `src/__tests__/integration/`
- **Pattern**: Render the full `<App />` with IPC mocked at the Tauri internals level. This exercises the real `tauriInvoke` wrapper, `isTauri()` detection, and store hydration
- **IPC mocking**: `mockIPC((cmd, args) => { ... })` intercepts `window.__TAURI_INTERNALS__.invoke`. Each test's `beforeEach` calls `mockIPC`/`mockWindows` to set up mock responses. Do NOT use `clearMocks()` in `afterEach` — React's async effect cleanup races with it

## CI (GitHub Actions)

Frontend job: `tsc --noEmit` → `eslint` → `prettier --check` → `vitest run` → `vitest run --config vitest.integration.config.ts`
Backend job: `cargo fmt -- --check` → `cargo clippy -- -D warnings` → `cargo test`

## Lint Rules to Know

- ESLint enforces `@typescript-eslint/no-floating-promises` — always await or void promises
- `@typescript-eslint/consistent-type-imports` — use `import type` for type-only imports
- React hooks rules are enforced (deps arrays, rules of hooks)
- Test files have relaxed rules but still enforce most TypeScript strict checks
