# TooManyTabs — Product Roadmap

**Last updated:** 2026-03-23

---

## The problem

**The developer is the slowest part of the AI coding pipeline.**

Claude Code writes code in minutes. CI runs in minutes. GitHub merges in seconds. But the developer — reading terminal output, switching to GitHub, checking CI, typing responses, clicking merge — takes hours. At 5 concurrent sessions, this is manageable. At 20, the developer is the bottleneck. At 50, the system collapses.

Every feature on this roadmap exists to solve one problem: **reclaim developer time that is currently spent on labour instead of decisions.**

---

## Horizons

Each horizon addresses a different form of wasted developer time. Each extends the previous — you cannot automate a workflow that isn't complete, you cannot scale a workflow that isn't fast, you cannot make a workflow fast if the developer has to leave the app to finish it.

```
Horizon 1    Complete the workflow       → Stop wasting time on tool-switching
Horizon 2    Make decisions instant      → Stop wasting time on context-loading
Horizon 3    Scale to 50 sessions        → Stop wasting time on cognitive overhead
Horizon 4    Automate the routine        → Stop wasting time on decisions machines can make
```

### Current state (v0.1)

The foundation exists. Dispatch board with kanban columns. Sessions spawned from GitHub issues/PRs or ad-hoc prompts. PTY terminal, code editor, file browser, git staging. Pause/resume/interrupt/kill. Stuck detection. Basic notifications. Commit, push, open PR.

**Where developer time is wasted today:**
- Every session ends with "now go to GitHub" — no merge, no CI status, no issue close
- When a session is waiting, the developer reads raw terminal output to understand what it needs
- `blockType` and `lastMessage` fields exist but are not reliably populated — the board is a list, not a decision queue
- Every session is independent — no grouping, no chaining, no batch operations
- Every action is manual — no automation for routine tasks

---

### Horizon 1 — Complete the workflow

**Wasted time:** The developer leaves the app 3-4 times per session to check CI, merge PRs, and close issues on GitHub. At 20 sessions, that's 60-80 context switches per day.

**Vision:** A developer goes from "assign issue" to "merged and closed" without opening GitHub. The app owns the full issue → session → PR → CI → merge → close pipeline.

**Exit criteria:** Zero visits to github.com required for the standard session lifecycle.

**Competitive distance:** This is the first divergence from Nimbalyst. They stop at "review diff." We stop at "merged and closed." Every competitor except GitHub Copilot (which IS GitHub) has this gap. Shipping H1 creates the one-line pitch: "TooManyTabs ships your code." Ship within 4-6 weeks — Nimbalyst ships fast and could close this gap if they choose to.

#### H1.1 — CI status in-app

Poll GitHub Checks API after push or PR creation. Display check results (pass/fail/pending) as pills on session cards and in the detail view. Surface failing check names and logs inline.

Tasks:
- Add `CheckRun` type to Rust backend (`github.rs`) — name, status, conclusion, html_url
- Add `fetch_check_runs` Tauri command — `GET /repos/{owner}/{repo}/commits/{ref}/check-runs`
- Add `CheckRun` type and `fetchCheckRuns` wrapper to frontend (`types.ts`, `tauri.ts`)
- Display CI status pills on PR card (`GitHubSidebar.tsx`)
- Display compact CI indicator on session kanban card (`KanbanCard.tsx`)
- Poll CI status every 30s while checks are pending; stop when all complete
- Surface failing check logs inline or link to check URL

#### H1.2 — Merge from the app

Add a "Merge PR" button to the session detail view. Support merge, squash-merge, and rebase-merge. Respect branch protection rules — surface them, don't bypass. Block the merge button until required checks pass. After merge, auto-delete the remote branch and clean up the local worktree.

Tasks:
- Add `merge_pr` Tauri command (`github.rs`) — `PUT /repos/{owner}/{repo}/pulls/{number}/merge`
- Add `mergePR` frontend wrapper (`tauri.ts`)
- Add merge button UI with strategy dropdown (`GitHubSidebar.tsx`); disabled until checks pass
- Post-merge: delete remote branch (`DELETE /repos/{owner}/{repo}/git/refs/heads/{branch}`)
- Post-merge: remove worktree (call existing `remove_worktree`)
- Post-merge: update session status to `completed`, emit `session-state-changed`
- Handle merge failures gracefully (conflicts, required reviews, branch protection)

#### H1.3 — Auto-close linked issue on merge

When a session's PR merges, auto-close the linked GitHub issue via the API. Update session status to `completed`. This eliminates the last manual step in the pipeline.

Tasks:
- Add `close_issue` Tauri command (`github.rs`) — `PATCH /repos/{owner}/{repo}/issues/{number}` with `{"state": "closed"}`
- Chain `close_issue` after successful merge when session has `linked_issue_number`
- Update UI to reflect closed issue state

#### H1.4 — Reliable blockType and lastMessage

Parse PTY output to detect Claude's permission prompts, review requests, and decision points. Populate `blockType` (decision/review/confirm) and `lastMessage` so the dispatch board shows what each session actually needs — not just that it's "waiting."

Tasks:
- Research and document Claude Code PTY output patterns (permission prompts, tool-use confirmations, questions)
- Add output pattern matcher in PTY reader background thread (`sessions.rs`)
- Extract `lastMessage` text from matched patterns; store in DB
- Classify `blockType` from patterns: `confirm` (yes/no), `review` (diff approval), `decision` (open-ended)
- Add `last_message` column to sessions table (`db.rs` migration)
- Emit updated session on blockType/lastMessage change
- Update `mapBackendSession` to map `last_message` to frontend

#### H1.5 — Session recaps

When a session is `waiting`, generate a 2-3 sentence summary of what Claude has done and what it's asking. Use a Claude API call against the truncated session log. Display above the reply input.

The difference between "read 200 lines of terminal" and "Claude refactored auth middleware, wants to know if it should update tests."

Tasks:
- Add Claude API key storage in `settings` table; add UI to configure
- Add `generate_recap` Tauri command (new `ai.rs` or in `github.rs`) — read session log, truncate, POST to Claude API
- Add `generateRecap` frontend wrapper (`tauri.ts`)
- Add recap UI to session detail view (`SessionDetail.tsx`) — collapsible panel, "Generate recap" button, loading state, cached result

**Suggested execution order:** H1.4 (foundational) → H1.1 (needed before merge) → H1.2 (biggest differentiator) → H1.3 (small addition) → H1.5 (independent, parallelise with H1.1-H1.3)

#### H1.6 — PTY and session reliability

The session lifecycle has race conditions and failure modes that cause phantom sessions, zombie processes, and silent state divergence. These must be fixed before H1 features add more complexity on top.

Tasks:
- Throttle PTY output event emission (batch every 16–50ms) to prevent Tauri event system crash (known Tauri issue #8177/#10987)
- Send signals to process groups (`-pid`), not just the direct child PID — `claude` spawns subprocesses that become orphans on SIGKILL
- Implement graceful shutdown sequence: SIGINT → wait 3s → SIGTERM → wait 2s → SIGKILL (current code jumps straight to SIGKILL)
- Add `CancellationToken` / `AtomicBool` to reader threads so they stop on app exit instead of blocking indefinitely
- Fix race condition between reader thread (removes from `processes` on exit) and signal handlers (reads `processes`) — coordinate access with proper locking
- Cap frontend output buffer per session (ring buffer or max N chunks) to prevent unbounded memory growth
- Validate worktree exists and is usable after `create_worktree_internal()` before spawning the PTY process

#### H1.7 — SQLite and state robustness

Database operations use a single `Mutex<Connection>` that becomes permanently bricked if any holder panics. Schema evolution has no versioning. Crash recovery is incomplete.

Tasks:
- Switch from `std::sync::Mutex` to `parking_lot::Mutex` for the DB connection (doesn't poison on panic)
- Add `PRAGMA busy_timeout = 5000` to handle concurrent WAL checkpoint contention
- Add periodic WAL checkpoint (`PRAGMA wal_checkpoint(PASSIVE)` every 5 min) and explicit checkpoint on clean shutdown
- Add `schema_version` table and versioned migration runner (current `CREATE TABLE IF NOT EXISTS` can't handle column additions)
- Wrap multi-step operations (worktree creation + DB insert) in transaction-like logic with rollback on failure
- Add cascade delete or null-out for sessions when a repo is removed (currently orphaned sessions crash the UI)
- On startup: scan for worktrees on disk that have no matching session in the DB, offer cleanup

#### H1.8 — GitHub API robustness

GitHub integration uses a new HTTP client per request, no rate limiting, no token caching, and swallows error details. At 10+ sessions polling for CI/issues, rate limits will be hit.

Tasks:
- Cache GitHub token in `AppState` (currently shells out to `gh auth token` on every API call); refresh only on 401 or timer
- Store a single `reqwest::Client` in `AppState` for connection reuse and TLS session caching
- Parse `X-RateLimit-Remaining` / `X-RateLimit-Reset` headers; defer non-critical requests when low; respect `Retry-After` on 429
- Implement conditional requests with `ETag` / `If-None-Match` for polling endpoints (304s don't count against rate limit)
- Categorise API errors: auth failures (401/403 → prompt re-auth), rate limits (429 → auto-retry), not found (404 → stale data), server errors (5xx → retry with backoff)
- Replace `.unwrap_or_default()` on response text parsing with proper error propagation so users see actionable messages

#### H1.9 — Frontend error handling and state consistency

The frontend silently swallows many backend errors. Event subscription failures, load failures, and bulk operation failures all leave the user with a stale or misleading UI.

Tasks:
- Add structured error codes to `AppError` serialisation (currently flat string) so the frontend can distinguish "session not found" from "DB poisoned" from "GitHub auth failed"
- Show error state in session store when `listSessions()` fails (currently silently sets empty list)
- Fix bulk operations (kill/resume) to report per-session success/failure instead of catch-and-ignore
- Add reconnection logic: after frontend reload (crash, HMR), detect blank terminals on running sessions and reload output from log files via `read_session_log`
- Add IPC timeout wrapper around `tauriInvoke` so deadlocked backends don't hang the UI forever
- Add in-app toast fallback for system notifications (handles denied permission / revoked permission gracefully)

#### H1.10 — Crash recovery and resilience

After an unclean shutdown, the app marks sessions as "interrupted" but leaves zombie processes running, worktrees orphaned, and paused sessions lost.

Tasks:
- On startup, check `kill(pid, 0)` for PIDs of previously-running sessions to distinguish alive-but-disconnected from truly dead; kill orphan processes
- Track clean/unclean shutdown with a sentinel file; on unclean restart, offer "restore sessions" vs. "start fresh"
- Preserve paused session state across restart (currently reaped as "interrupted", losing the user's intent)
- On startup, scan worktree directory for entries with no matching DB session and clean them up
- Add database backup before running schema migrations
- Persist `editorStore` (open tabs) and active session selection to survive restarts

**Suggested execution order (hardening):** H1.6 (PTY — most critical, unlocks everything) → H1.7 (DB — prevents bricking) → H1.9 (frontend — user-facing) → H1.8 (GitHub — needed before H1.1 CI polling) → H1.10 (recovery — polish)

#### H1.11 — First-run experience and prerequisites

A new user launches the app, adds a repo, creates a session — and claude isn't installed. The session silently fails. There is no onboarding, no prerequisite validation, no guided setup. This is the single biggest adoption barrier.

Tasks:
- Add startup prerequisite check: detect `claude`, `git`, `gh` in PATH; show clear ✓/✗ status with install instructions for missing tools
- Validate GitHub auth on first repo add: test API call before cloning to surface auth errors early (not after a 30s clone)
- Add first-launch onboarding dialog: prerequisites → connect repo → create first session → explain the board columns
- Improve empty board state: replace generic "No sessions yet" with workflow explanation ("A session runs claude in an isolated worktree. 1. Connect a repo → 2. Create a session → 3. Watch Claude work → 4. Review and ship")
- Show tooltips on status badges and column headers for first-time discoverability
- Add "?" help icon in sidebar linking to a keyboard shortcuts overlay (Cmd+K, Cmd+1/2/3, Esc)

#### H1.12 — Session creation UX polish

Session creation works but hides important decisions from the user: no branch name preview, no prompt preview, a 1.2s forced delay on success, and no progress indicator for slow operations (worktree creation can take 30+ seconds on large repos).

Tasks:
- Show branch name preview below the prompt field so user knows what will be created
- Show progress steps during creation: "Creating worktree…" → "Spawning session…" → "Done" instead of a spinner with no context
- Replace forced 1.2s success delay with immediate close + toast notification ("Session 'fix-auth-bug' created")
- Make worktree conflict a first-class UX choice: radio button "Keep existing worktree / Replace" instead of error → force-retry flow
- Auto-populate issue body into the prompt when linking an issue (currently only the URL is passed — Claude doesn't see the issue content unless it fetches it)
- Add keyboard shortcut to open NewSessionModal (e.g., Cmd+N)
- Validate prompt is non-empty before enabling submit (currently shows error after click)

#### H1.13 — Reply and decision UX

When a session is waiting, the user has no context about what Claude needs without reading raw terminal output. The quick reply on the board card is a 1-line input with no surrounding context. The detail view has no dedicated reply interface — just the raw terminal.

Tasks:
- Add "waiting context" panel in SessionDetail: when status is `waiting`, show the last 5-10 lines of terminal output above a reply input, visually separated from the full terminal
- Expand quick reply on KanbanCard to support multi-line input (textarea, not single-line input)
- Show `lastMessage` on the card when populated (currently field exists but shows nothing — prerequisite: H1.4 populates it)
- Add "Jump to next waiting session" keyboard shortcut (e.g., Cmd+J) — cycles through waiting sessions without going back to the board
- Show typing/sending indicator when reply is being transmitted to the PTY
- Add reply error feedback: if `writeToSession` fails, show inline error instead of console.log

#### H1.14 — Review and ship UX

After Claude finishes, the user must manually stage files, write a commit message (auto-filled with just the session name), push, then leave the app to create a PR on GitHub. There is no diff viewer — clicking a changed file opens the full file in a read-only editor with no diff highlighting.

Tasks:
- Add inline diff viewer for changed files: click a file in GitChangesPanel → show unified or side-by-side diff (not just the full file). Use CodeMirror merge extension or similar.
- Smart commit message: extract Claude's suggested commit message from terminal output (look for conventional commit patterns) and pre-fill; fall back to session name
- Separate "Commit" and "Push" buttons (current single "Commit & Push" conflates two operations — some users want to review before pushing)
- Add "Create PR" button in GitHubSidebar after push: auto-fill title from commit message, body from session prompt + issue link
- Show git operation progress: "Staging… → Committing… → Pushing to origin/branch-name… → ✓ Done" with real-time feedback
- Add discard confirmation: the "⟲" discard button on unstaged files is destructive with no confirmation dialog
- Show file path breadcrumb in editor when viewing a changed file (currently just filename in tab, ambiguous with duplicate names)

#### H1.15 — Diagnosis and recovery UX

When a session is stuck or failed, the user sees a generic warning banner with no root cause info. Kill is the only recovery action and it's destructive (deletes worktree, loses partial changes). There is no retry, no log viewer, no error extraction.

Tasks:
- Extract error context from terminal output: parse last 10 lines for "Error:", "fatal:", exit codes; show structured error summary in the stuck/failed banner instead of generic "No output for >20min"
- Add "View Full Log" button in SessionDetail: opens `~/.toomanytabs/logs/{id}/stdout.log` in the code editor or downloads it
- Add "Retry" action for failed sessions: re-spawn with same prompt and worktree (don't delete worktree on failure)
- Add "Save Patch" option before kill: generate `git diff` and save to clipboard or file so partial work isn't lost
- Improve kill confirmation: use a modal dialog with session name and warning about data loss, not inline button swap (easy to accidentally confirm)
- Add session elapsed time display in the header (total time since creation, not just "state changed X ago")
- Differentiate "stuck waiting for input" from "stuck hung process" using PTY activity heuristics (if PTY is readable but no output → likely waiting; if PTY read blocks → process may be hung)

#### H1.16 — Navigation and settings

Keyboard shortcuts are undiscoverable (hardcoded in App.tsx, documented only in CLAUDE.md). There is no settings page — theme toggle and sound toggle are buried in the sidebar. The command palette doesn't show session status, making it useless for triaging.

Tasks:
- Add settings modal (gear icon in sidebar): appearance (theme), notifications (sound, system notifications, per-type toggle), editor (terminal font size, scrollback lines), shortcuts reference
- Show session status indicator in CommandPalette results: colored dot or badge next to each session name so users can triage while searching
- Add terminal font size control: Cmd+= / Cmd+- to zoom, persisted to uiStore (currently hardcoded 13px)
- Add sidebar collapse/expand toggle button (currently only via keyboard or resize to 0)
- Add right panel collapse/expand toggle button in SessionDetail header
- Add "Keyboard Shortcuts" overlay (Cmd+? or from settings) showing all available shortcuts
- Add Cmd+N shortcut for new session, Cmd+J for next waiting session

#### H1.17 — Consistent loading and error states

Error handling varies wildly across the app: some errors are silently caught, some toast, some show inline red text. Loading states use a mix of skeletons, spinners, "Loading…" text, and nothing. Users can't predict what happened when something fails.

Tasks:
- Standardise error display: define 3 tiers — inline (form validation), toast (operation failure with retry), modal (critical/blocking). Audit all `.catch()` blocks and replace silent catches with appropriate tier.
- Standardise loading indicators: use skeleton cards for board loading, spinner+label for async operations (git, GitHub API), disabled+loading text for buttons. Remove bare "Loading…" text strings.
- Add retry buttons on all retryable errors: GitHub API failures (toast with "Retry"), git operation failures (inline with "Try again"), session spawn failures (modal with "Retry" or "Cancel")
- Add empty state illustrations/icons: replace plain text empty states ("No changes", "Empty directory", "No sessions yet") with subtle icons and action-oriented copy
- Add error boundary recovery: ErrorBoundary's "Try again" button should reload the component tree, not just dismiss the error

**Suggested execution order (UX):** H1.11 (onboarding — first thing every new user hits) → H1.17 (consistency — improves all other UX work) → H1.12 (creation — most common flow) → H1.13 (reply — core workflow) → H1.14 (review/ship — biggest differentiator) → H1.15 (diagnosis — needed as usage grows) → H1.16 (settings — polish)

---

### Horizon 2 — Make decisions instant

**Wasted time:** Each decision takes 2-5 minutes of context-loading — reading terminal output, understanding the question, typing a response. At 20 sessions with 3 decisions each, that's 2 hours of pure context-loading per day.

**Vision:** Most decisions are a single click. The app presents structured prompts, not raw terminal output. The average decision takes under 30 seconds.

**Prerequisite:** Horizon 1. Structured decisions require reliable blockType extraction (H1.4) and session recaps (H1.5).

**Exit criteria:** 80% of decisions are resolved with a single click or button press.

**Competitive distance:** No competitor has structured decision UIs. Nimbalyst, Devin, and Codex all use free-form chat/reply. Cursor's Mission Control shows agent status but doesn't structure the human's response. This is the UX moat — IDEs can't replicate it in a sidebar, and cloud agents can't replicate it in a chat thread.

#### H2.1 — Structured decision prompts

Replace free-form reply with structured UIs based on `blockType`:

- **`confirm`**: Yes/No buttons with a one-line description. No typing.
- **`review`**: Side-by-side diff with Approve / Reject / Edit.
- **`decision`**: Multiple-choice options extracted from Claude's question, with free-form fallback.

Tasks:
- Design and build confirm, review, and decision UI components
- Route reply input to the appropriate decision UI based on `blockType`; fall back to text input when null
- Extend H1.4 pattern matcher to extract choice options from Claude's output

#### H2.2 — One-click ship pipeline

Collapse the current 4-step ship flow (stage → commit → push → create PR → merge) into a single "Ship" action. After Claude is done and CI passes, one click: commit, push, create PR, merge. Configurable per session (some users want to review diffs, others trust Claude).

Tasks:
- Add `ship_session` Tauri command — orchestrates stage all → commit → push → create PR → merge
- Add "Ship" button to session detail and board card; visible when session is completed
- Add auto-wait-for-CI option — queue merge until checks pass

#### H2.3 — Quick actions on the board

Add one-click actions directly on session cards:

- **Ship**: For completed sessions with passing CI — commit, push, PR, merge in one action.
- **Retry**: For failed sessions — restart with same prompt and worktree.
- **Dismiss**: Archive completed/failed sessions to reduce clutter.

Tasks:
- Add "Ship" quick action to kanban card
- Add "Retry" quick action — kill and re-spawn with same params
- Add "Dismiss" quick action — archived/hidden state, removed from active board

#### H2.4 — Smart notifications

Replace flat notifications with priority triage:

- **Urgent**: Blocked on a confirm (destructive action). Always notify.
- **Normal**: Waiting for a decision. Notify unless user is viewing the board.
- **Low**: Completed or failed. Badge only.
- **Suppressed**: User is actively watching this session.

Group notifications: "3 sessions need input" instead of 3 separate alerts.

Tasks:
- Add notification priority levels; classify events as urgent/normal/low
- Suppress notifications for the session the user is actively viewing
- Group notifications — batch "N sessions need input"

#### H2.5 — Session templates

Pre-built prompts for common tasks:

- **Bug fix**: Issue URL → reproduce, diagnose, fix, regression test.
- **PR feedback**: PR URL + comments → address all review feedback.
- **Refactor**: File path + description → refactor with tests.
- **Test coverage**: File path → add missing tests.

Templates encode best-practice prompts so users don't reinvent them.

Tasks:
- Define template data model — name, description, prompt template with placeholders, default settings
- Ship built-in templates (bug fix, PR feedback, refactor, test coverage)
- Add template selector to NewSessionModal — selecting a template fills the prompt

---

### Horizon 3 — Scale to 50 sessions

**Wasted time:** Above 10 sessions, the dispatch board becomes a wall of cards. The developer loses track of which sessions matter, which are related, and what the overall progress looks like. Cognitive overhead grows linearly with session count.

**Vision:** A developer manages 50 concurrent sessions across 10 repos without losing track. Organisational primitives (projects, dependencies, batch ops) keep cognitive load constant as session count grows.

**Prerequisite:** Horizon 2. Scale is meaningless if each decision still takes 5 minutes. Fast decisions (H2) must come before volume.

**Exit criteria:** Session count can double without increasing the developer's decision time per session.

**Competitive distance:** Nimbalyst has session tagging but no projects, no dependencies, no batch ops, no dashboard. Their flat kanban becomes unusable above ~15 sessions. Cursor's Mission Control is a list of background agents with no organisational hierarchy. This horizon captures the user who has outgrown every other tool — the developer running 30-50 concurrent sessions. That user doesn't exist in Nimbalyst's world.

#### H3.1 — Projects

Group sessions into named projects ("Auth rewrite", "Q2 bug bash"). A project is a tag on sessions, optionally spanning repos. The board filters by project. Each project shows: total sessions, blocked count, shipped count, progress bar.

Tasks:
- Add `projects` table to SQLite (id, name, created_at)
- Add nullable `project_id` FK to sessions table (migration)
- Add project CRUD Tauri commands (create, list, delete)
- Add project selector to NewSessionModal
- Add project filter to dispatch board with project summary view

#### H3.2 — Session chaining

Declare dependencies: "start B after A's PR merges." Enables multi-step workflows:

1. Session A: Refactor module X
2. Session B (depends on A): Update callers
3. Session C (depends on B): Integration tests

When A merges, B auto-spawns on the updated branch.

Tasks:
- Add nullable `depends_on` FK column to sessions table
- Add dependency selector to NewSessionModal
- Auto-spawn dependent session when upstream session's PR merges
- Show dependency chain visually on session cards

#### H3.3 — Batch operations

Multi-select sessions, apply actions in bulk:

- Ship all completed sessions with passing CI
- Kill all stuck sessions
- Retry all failed sessions
- Archive all closed sessions

Tasks:
- Add multi-select to kanban board (checkbox per card, "select all" per column)
- Add batch action toolbar (appears on selection)
- Add batch Tauri commands — ship/kill/retry taking `Vec<session_id>`

#### H3.4 — Dashboard

Dedicated view showing operational metrics:

- Active sessions by status, repo, project
- Throughput: sessions shipped per day/week
- Decision latency: time sessions spend in `waiting`
- Failure rate: by repo or task type

Tasks:
- Add dashboard view (new route, Cmd+4)
- Track session duration metrics (timestamps per status transition)
- Display throughput chart and decision latency metric

#### H3.5 — Board customisation

- Filter by project, repo, status
- Sort by time blocked, priority, created date
- Compact view (density) vs. detail view (context)
- Auto-archive closed sessions after N hours

Tasks:
- Add sort options to dispatch board
- Add compact view toggle
- Add auto-archive setting (persist in uiStore)

---

### Horizon 4 — Automate the routine

**Wasted time:** Even with instant decisions and scale primitives, the developer is still making every decision. Many of these — "CI passed, merge it", "CI failed with a lint error, fix it", "reviewer asked for a typo fix, do it" — don't need a human. At 50 sessions, routine approvals consume the majority of the developer's time.

**Vision:** Routine tasks go from issue to merged PR with zero human decisions. The developer's attention is reserved for genuinely ambiguous problems. The system handles everything it can, and escalates only what it can't.

**Prerequisite:** Horizon 3. Automation without organisational structure is chaos — auto-merging 50 sessions without projects, dashboards, and batch controls would be terrifying. The safety primitives (H3) must exist before removing the human from the loop (H4).

**Exit criteria:** 50%+ of sessions complete their full lifecycle (issue → merged PR) without a single human decision.

**Competitive distance:** Nimbalyst has zero automation — every action is manual. This is a permanent architectural gap: automation requires the GitHub lifecycle integration (H1) that they haven't built and may never prioritise given their horizontal strategy. Devin and Codex are ahead here (cloud-based automation), but their chat-based decision model means the human is still slow when they ARE needed. We combine fast decisions (H2) with automation (H4) — fast when present, absent when not needed.

#### H4.1 — Auto-merge on CI pass

Opt-in per session or per template: if CI passes and the diff is under a configurable threshold, merge without review. Trust gradient: start with test-only changes, expand to bug fixes, then features.

Tasks:
- Add `auto_merge` boolean column to sessions table
- Watch for CI completion on auto-merge sessions; trigger merge automatically on pass
- Add auto-merge toggle to NewSessionModal and session templates

#### H4.2 — CI failure auto-fix loop

When CI fails:
1. Fetch failing check logs
2. Send to the session: "CI failed with: [logs]. Fix it."
3. Claude pushes a fix, CI re-runs
4. Loop up to N times (default 3)
5. If still failing, escalate to `waiting`

Tasks:
- Detect CI failure via CI polling (H1.1)
- Fetch failing check logs from GitHub API
- Send fix prompt to session PTY
- Track retry count in DB; stop after N retries (configurable)

#### H4.3 — Review comment auto-routing

When a PR receives review comments:
1. Detect new comments via polling or webhook
2. Feed them to the session (or spawn a follow-up)
3. Claude addresses comments and pushes
4. If auto-merge is enabled, merge after CI passes

Tasks:
- Poll for new PR review comments periodically
- Auto-create session from new comments (reuse `createSessionFromReview`)

#### H4.4 — Issue auto-triage

Scan connected repos for new issues. Run lightweight Claude analysis:
- Can Claude handle this autonomously?
- Estimated complexity (small/medium/large)
- Suggested template

Surface in a "ready to assign" queue. High-confidence issues auto-start sessions.

Tasks:
- Scan for new issues on schedule (periodic `fetchIssues`, filter by created date)
- Run Claude triage analysis per issue
- Display triage queue in Tasks view with one-click "Start session"

#### H4.5 — Self-review before surfacing

Before marking a session `completed`, run a Claude review of the diff:
- Does the change match the prompt/issue?
- Missing tests or obvious regressions?
- Accurate commit message?

If issues found, Claude fixes them before the developer ever sees the session.

Tasks:
- Run Claude review on session diff after completion
- If review flags issues, send follow-up to session PTY

#### H4.6 — Custom automation rules

A rule engine for "when X, do Y":
- "When PR approved + CI passes → auto-merge"
- "When issue labelled `bug` → auto-start session"
- "When session fails 3x → notify Slack"
- "When token usage > $5 → pause and ask"

Tasks:
- Design rule data model — trigger (event + conditions) → action (command)
- Build rules engine — evaluate rules against session event stream
- Build rules UI — create/edit/delete rules

---

## Task dependency graph

```
H1.1 CI status ──────────────┐
H1.2 Merge ───────────────── H2.2 One-click ship ──── H3.3 Batch ops ──── H4.1 Auto-merge
H1.3 Auto-close issue ───────┘                                            H4.2 CI fix loop
H1.4 blockType/lastMessage ── H2.1 Structured prompts                     H4.3 Review routing
H1.5 Recaps ─────────────────                                             H4.4 Auto-triage
                                                                           H4.5 Self-review
                               H2.4 Smart notifications                   H4.6 Rules engine
                               H2.5 Templates ──────── H3.1 Projects
                                                        H3.2 Chaining
                                                        H3.4 Dashboard
```

---

## Competitive landscape

The market has split into five categories. Each has a different theory of how AI coding should work.

### Category 1: Cloud autonomous agents

**Devin** (Cognition) and **OpenAI Codex** run agents in cloud sandboxes.

| | Devin | OpenAI Codex |
|---|---|---|
| Multi-session | Yes — parallel Devins | Yes — subagents, CSV fan-out |
| GitHub | Creates PRs natively | PRs, cloud-based triggers |
| Isolation | Cloud VMs | Cloud environments + worktrees |
| Pricing | From $20/mo; Team $500/mo | Usage-based per API call |

**Strengths:** True async. No local resource constraints. Codex subagents spawn their own subagents.

**Weaknesses:** Opaque execution (no real-time PTY). Chat-box decisions don't scale. Cloud lock-in. Cost compounds at 50 sessions.

**Our edge:** Local-first with real-time visibility. Dispatch board built for decision routing, not chat threads.

### Category 2: AI IDEs with background agents

**Cursor** (Mission Control, Background Agents in VMs), **Google Antigravity** (Manager Surface), **Windsurf** (parallel Cascade panes), **Kiro** (spec-driven, persistent context).

**Strengths:** Cursor 2.0's Mission Control is the closest IDE equivalent to a dispatch board. Antigravity separates "writing code" from "orchestrating agents."

**Weaknesses:** IDE gravity — assumes you're editing code, not routing decisions. One workspace at a time. Model-agnostic dilution prevents deep Claude Code integration.

**Our edge:** Every pixel is for "which session needs me and what does it need." IDEs will always treat orchestration as a sidebar.

### Category 3: Claude Code session managers — Nimbalyst (primary competitor)

**Nimbalyst** (formerly Crystal) is the closest competitor. It's a desktop app that wraps Claude Code and Codex sessions with a kanban board, visual editing tools, and an iOS mobile app. Free for individuals.

**What they have that we don't:**
- Multi-agent: Claude Code + Codex on the same board
- iOS app: start sessions, review diffs, respond to agents from phone
- Cross-platform: macOS, Windows, Linux
- Visual editing: markdown WYSIWYG, Excalidraw diagrams, Mermaid generation
- Task tracking: built-in status/tags/priority system
- PM workflows: PRD drafting, spec writing, stakeholder updates
- Free tier with no feature limits

**What we have (or will have) that they don't:**
- No GitHub lifecycle: no in-app merge, no CI status, no issue auto-close (our H1)
- No decision intelligence: no blockType extraction, no recaps, no structured prompts (our H1-H2)
- No automation: no auto-merge, no CI fix loops, no review routing (our H4)
- No scale primitives: no projects, no session chaining, no batch ops, no dashboard (our H3)
- No keyboard-driven workflow: no command palette, no power-user shortcuts (we have this)

**Their strategic direction:** Nimbalyst is going **horizontal** — they want to be a Notion-like workspace where agents, documents, diagrams, and tasks coexist. They're expanding their audience to product managers and non-technical users. Their moat attempt is ecosystem breadth: support every agent, ship on every platform, charge nothing.

**Our strategic response:** Go **vertical**. Own the full issue → code → PR → CI → merge → close pipeline deeper than anyone. Their workflow ends at "here's a diff." Ours ends at "PR merged, issue closed, branch deleted." Each horizon in this roadmap creates distance that a horizontal product can't close without changing its identity:

| Horizon | Gap it creates vs. Nimbalyst |
|---|---|
| H1 | "TooManyTabs ships your code. Nimbalyst makes you go to GitHub." |
| H2 | "TooManyTabs tells you what each session needs. Nimbalyst shows you a status pill." |
| H3 | "TooManyTabs handles 50 sessions. Nimbalyst's flat kanban becomes a wall of cards at 15." |
| H4 | "TooManyTabs merges routine PRs automatically. In Nimbalyst, every action is manual." |

**Key risk:** Nimbalyst ships fast (rebranded from Crystal, shipped iOS app and multi-agent support in weeks) and is free. If they add GitHub lifecycle features before we ship H1, the differentiation window closes. H1 is time-sensitive.

**What NOT to build because of Nimbalyst:** Visual editing, diagram tools, task tracker, multi-agent support (Codex), iOS app, PM-focused workflows. Let them own that surface area. Our user is the developer with 30 sessions who needs PRs merged, not the PM who wants to draft a spec.

### Category 4: GitHub-native agents

**GitHub Copilot coding agent** — native issues/PRs/CI, Agents tab, runs Claude and Codex alongside Copilot.

**Strengths:** GitHub IS the data source. No API integration needed. Multi-agent support.

**Weaknesses:** Web-first, no desktop app. Agent-agnostic breadth prevents depth. Agents tab is a list, not a dispatch board.

**Our edge:** Specialist vs. generalist. Best possible Claude Code experience because we only support one runtime. Local-first.

### Category 5: Terminal tools

**Amp** (specialised sub-agents, persistent memory), **Aider** (conversational pair programming), **ccmanager** (TUI session list).

**Strengths:** Amp's specialised agents and persistent memory. Aider's auto-commit flow.

**Weaknesses:** Terminal UI ceiling — can't show diffs, dashboards, or structured prompts. No GitHub lifecycle.

**Our edge:** GUI enables decision UIs that terminal tools structurally can't build.

### Positioning

```
                    Multi-session        Decision
                    orchestration        intelligence
                    ─────────────►       ─────────────►

Cloud agents        Devin, Codex         Low — chat-based
IDE + agents        Cursor, Antigravity  Low — IDE-centric
Session managers    Nimbalyst            Low — status only
GitHub-native       Copilot agent        Medium — native context
Terminal tools      Amp, ccmanager       Low — text UI limits

TooManyTabs         Dispatch board       HIGH — structured decisions,
                                         recaps, automation
```

**The gap:** strong orchestration AND high decision intelligence. Every competitor has one, not both.

**Our thesis:** The bottleneck is not the agent — it's the human. The product that wins makes the human faster, not the agent smarter.

---

## Competitive moat

The moat is the compounding effect across horizons:

```
Horizon 1:  Developer makes every decision, but never leaves the app
Horizon 2:  Developer makes every decision in one click
Horizon 3:  Developer makes decisions for 50 sessions without overload
Horizon 4:  Developer only makes decisions that actually need a human
```

Each horizon makes the previous one more powerful. A competitor who ships H2 without H1's closed loop leaks users to GitHub. A competitor who ships H4 automation without H3's safety primitives overwhelms users at scale.

### Why Nimbalyst can't follow us here

Nimbalyst's horizontal strategy (workspace, visual editing, multi-agent, PMs) means they are spreading engineering effort across a wide surface. Every feature they add to their markdown editor or Excalidraw integration is time NOT spent on GitHub lifecycle, decision intelligence, or automation. Their identity as a "visual workspace" makes it harder to pivot toward a pipeline-focused product — their PM users don't need CI status pills or auto-merge.

More fundamentally, H1-H4 require deep, compounding GitHub integration. CI status (H1) enables merge blocking (H1) enables auto-merge (H4) enables CI fix loops (H4). Each layer builds on the previous. Nimbalyst would need to build all of H1 before any of H4 is possible. We start building H1 now; they haven't started.

### Per-competitor strategy

- **vs. Nimbalyst**: H1 is the first divergence point and it's time-sensitive. Ship in-app merge + CI status before they do. This creates the pitch: "TooManyTabs ships your code. Nimbalyst makes you go to GitHub." Don't compete on their strengths (visual editing, multi-agent, mobile, free tier).
- **vs. Cursor/Antigravity**: H2 (structured decisions) creates a UX they structurally can't replicate — their identity is "IDE", ours is "dispatch board." They will never build a pure decision-routing interface because their users expect to edit code.
- **vs. Devin/Codex**: They're ahead on H4 (cloud automation) but behind on H2 (decision velocity). Their chat-box interaction can't match structured prompts. And local-first execution is a permanent advantage for security-conscious teams and enterprises.
- **vs. GitHub Copilot**: They have the data advantage (native issues/PRs/CI). We counter with the UX advantage (dispatch board, structured decisions, batch ops). H3 features (projects, chaining, dashboard) create organisational depth that a GitHub tab can't match.

---

## What we are NOT building

Each of these is a deliberate strategic choice, most informed by where Nimbalyst is going and where we refuse to follow:

- **A visual workspace.** No markdown editing, no Excalidraw, no Mermaid diagrams, no task tracker. Nimbalyst is building the Notion of AI coding. We are building mission control. Our users have Notion already.
- **Multi-agent support.** Nimbalyst supports Claude Code + Codex. We stay Claude Code-only. Deep integration with one runtime (PTY output parsing, blockType extraction, Claude API recaps) beats shallow integration with two.
- **An iOS app.** Nimbalyst has one. Our user is at their desk making rapid decisions, not monitoring from their phone. If mobile becomes necessary, ship a lightweight web dashboard, not a native app.
- **PM-focused workflows.** Nimbalyst markets to product managers (PRD drafting, spec writing, stakeholder updates). Our user is a developer. Every pixel is for shipping code, not writing documents.
- **An IDE.** The editor reviews Claude's output. Users edit in their own tools.
- **A project management tool.** Projects (H3) are lightweight session groups, not Jira. No sprints, no story points.
- **A CI/CD system.** We surface CI status and trigger retries, not run pipelines.

---

## Open questions

### Horizon 1
- **Recap cost.** Each recap is a Claude API call. At 50 sessions, cost could be significant. On-demand only, or cached aggressively?
- **CI polling frequency.** How often to poll GitHub Checks API? Webhooks need a server component.

### Horizon 2
- **Structured prompt extraction.** Parsing PTY output for decision types is fragile. Push for Claude Code hooks that emit structured metadata?
- **Template distribution.** Built-in, user-created, or community-shared?

### Horizon 3
- **Project persistence.** SQLite alongside sessions, or separate config? Projects outlive sessions.
- **Cross-repo branch naming.** Consistent naming when workflows span repos.

### Horizon 4
- **Auto-merge trust model.** Default: never, tests-only, or per-repo? Highest-stakes decision.
- **Self-review accuracy.** If Claude's self-review misses issues, trust in the whole pipeline collapses.
