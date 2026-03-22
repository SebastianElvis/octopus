# TooManyTabs — Product Design Document

**Status:** Draft  
**Last updated:** 2026-03-22

---

## 1. Overview

TooManyTabs is a macOS app for developers who run 5+ Claude Code sessions simultaneously. It solves the coordination problem: knowing which session needs your attention right now, replying without losing context, and shipping the output cleanly through GitHub.

The core mental model is a **TooManyTabs board** — not a session monitor. You are not watching sessions run. Sessions pull at you when they need a decision. Your job is to process that queue and get out of the way.

TooManyTabs assumes:
- You already have Claude Code installed and configured
- Each repo you connect already has a `CLAUDE.md` in place (TooManyTabs does not manage this)
- You work primarily in the terminal via tmux, and TooManyTabs is a companion macOS app alongside it

---

## 2. Problem statement

Claude Code is powerful in isolation. At scale — 5 or more sessions across multiple repos — the terminal breaks down:

- You have no unified view of what every session is doing
- Sessions block silently on decisions for 30+ minutes while you're in a different tmux pane
- Switching back to a session requires mentally rebuilding context from scratch
- The issue-to-PR workflow is fragmented across GitHub, terminal, and your editor
- There is no guardrail between Claude's output and your remote — it is easy to miss a bad commit

Existing tools (Nimbalyst, Opcode, Claude Code Desktop) were designed for single-session visibility, not multi-session orchestration.

---

## 3. Goals and non-goals

### Goals

- Make it trivially easy to assign a GitHub issue or PR to a new Claude Code session
- Surface which sessions need input, ranked by urgency, without you having to poll
- Let you respond to a session, review its diff, and commit/push without leaving TooManyTabs
- Keep sessions isolated from each other (separate git worktrees, no shared state)

### Non-goals

- Managing or creating `CLAUDE.md` — this is the user's responsibility before using TooManyTabs
- Replacing the terminal — TooManyTabs is a companion app, not a terminal emulator
- Supporting non-macOS platforms in v1
- Supporting non-GitHub remotes in v1 (GitLab, Bitbucket deferred)
- Running Claude Code sessions itself — TooManyTabs orchestrates Claude Code processes, it does not replace them

---

## 4. User stories

Stories are tagged MVP or v2. MVP defines the initial shippable product.

### Epic: Setup

**S-01 — Connect a GitHub repo** `MVP`  
As a user, I want to connect one or more GitHub repos to TooManyTabs so that I can pull issues from them and launch sessions against them.

Acceptance criteria:
- User authenticates via GitHub OAuth
- User selects repos from their GitHub account or orgs
- TooManyTabs clones each repo locally (or uses an existing local clone if path is provided)
- TooManyTabs configures git worktree support on each repo
- Connected repos appear in the sidebar

**S-02 — Browse issue backlog** `v2`  
As a user, I want to see all open issues across my connected repos in one place so that I can pick what to work on next without going to GitHub.

---

### Epic: Session creation

**S-03 — Assign a GitHub issue to a new session** `MVP`  
As a user, I want to pick a GitHub issue and have TooManyTabs automatically start a Claude Code session to work on it.

Acceptance criteria:
- User picks an issue from a connected repo (by URL paste or in-app picker)
- TooManyTabs creates a git worktree with a branch named from the issue (e.g. `fix/issue-214-zk-proof`)
- TooManyTabs constructs a prompt from the issue title, body, and labels
- TooManyTabs launches a Claude Code process in that worktree with the constructed prompt
- The new session appears on the TooManyTabs board with status `running`

**S-04 — Assign a GitHub PR to a new session** `MVP`  
As a user, I want to route an open PR (e.g. one with failing review comments) to a Claude Code session so that Claude can address the feedback.

Acceptance criteria:
- User provides a PR URL or picks from open PRs on connected repos
- TooManyTabs fetches the PR diff and all unresolved review comments
- TooManyTabs constructs a prompt summarising the requested changes
- Session is launched on a new worktree branched from the PR's head
- Linked PR is visible in the session detail sidebar

**S-05 — Start an ad-hoc session** `MVP`  
As a user, I want to launch a session with a free-text prompt, not tied to any issue, for quick tasks like refactors or explorations.

Acceptance criteria:
- User picks a repo, writes a prompt, and optionally picks a base branch
- TooManyTabs creates a worktree with an auto-generated branch name
- Session launches and appears on the TooManyTabs board

---

### Epic: Attention routing

**S-06 — TooManyTabs board** `MVP`  
As a user, I want a single view showing all my active sessions with their current status so that I always know what is happening without switching to the terminal.

Acceptance criteria:
- All sessions displayed as cards, grouped by status: `waiting` / `running` / `done` / `stuck`
- Within `waiting`, cards sorted by longest-blocked first
- Each card shows: session name, repo, branch, current task summary, how long it has been in the current state
- `waiting` cards additionally show the type of block: `decision needed` / `review output` / `confirm action`
- Board refreshes in real time as session state changes

**S-07 — Notification when a session is blocked** `MVP`  
As a user, I want a macOS notification when any session needs my input so that I do not have to poll the TooManyTabs board.

Acceptance criteria:
- Notification fires within 10 seconds of a session entering `waiting` state
- Notification body includes the session name and a one-line summary of what is needed
- Clicking the notification opens TooManyTabs and navigates directly to that session's detail view
- Notifications respect macOS Do Not Disturb

**S-08 — Reply to Claude in-app** `MVP`  
As a user, I want to send a response to a blocked session directly from TooManyTabs so that I do not need to switch to the terminal.

Acceptance criteria:
- `waiting` sessions show an inline reply input on both the board card and the session detail view
- Submitting a reply sends the text to the running Claude Code process's stdin
- Session status immediately transitions from `waiting` to `running`

**S-09 — Reprioritise sessions** `v2`  
As a user, I want to pause a low-priority session to conserve resources and resume it later.

---

### Epic: Interrupt and correct

**S-10 — Interrupt a running session** `MVP`  
As a user, I want to send a correction to a session that is currently running so that I can redirect it without killing it and losing all progress.

Acceptance criteria:
- Session detail view shows an interrupt input even when status is `running`
- Submitting an interrupt sends a signal to the Claude Code process and delivers the message
- Session output panel shows the interruption and Claude's acknowledgement
- Session continues from the corrected direction without restarting the worktree

**S-11 — Kill and discard a session** `MVP`  
As a user, I want to terminate a session and clean up its worktree so that I do not accumulate stale branches and dirty state.

Acceptance criteria:
- Kill action is available on every session card and in the session detail view
- User is asked to confirm before killing
- On confirm: Claude Code process is terminated, git worktree is removed, local branch is deleted
- If a linked GitHub issue exists, its state is not modified automatically
- Session is removed from the TooManyTabs board

**S-12 — Detect stuck sessions** `v2`  
As a user, I want TooManyTabs to warn me if a session appears to be looping or stalled so that I can intervene before it wastes tokens.

Heuristic: session has been `running` for more than 20 minutes with no new terminal output lines.

---

### Epic: Review and ship

**S-13 — Review diff and commit** `MVP`  
As a user, I want to review Claude's changes as a diff, edit the commit message, and commit and push — all without leaving TooManyTabs.

Acceptance criteria:
- Session detail view shows a file-by-file diff of all changes in the worktree vs. the base branch
- User can navigate between changed files
- User can edit the auto-generated commit message (pre-populated from the session's task summary)
- A single "commit and push" action commits all changes and pushes the branch to the remote
- On success, session status transitions to `done`

**S-14 — Claude opens the PR** `MVP`  
As a user, I want Claude to draft a PR for me after I commit so that I do not have to write the title and description from scratch.

Acceptance criteria:
- After a successful commit and push, TooManyTabs prompts: "Open a PR?"
- Claude drafts a PR title and description using the linked issue body and a summary of the changes made
- User can edit both fields before submitting
- Submitting opens the PR via the GitHub API and links it to the session
- PR number and CI check status become visible in the session detail sidebar

**S-15 — Route PR review comments back to a new session** `v2`  
As a user, I want review comments on Claude's PR surfaced in TooManyTabs so that I can route them back for Claude to address.

**S-16 — Auto-close linked issue on merge** `v2`  
As a user, I want the linked GitHub issue closed automatically when the PR merges so that I do not have to do it manually.

---

## 5. Views and navigation

### 5.1 TooManyTabs board (main view)

The primary view. Opens on launch.

Layout:
- Top bar: app name, session count, "+ new session" button
- Attention bar: horizontal strip listing sessions currently in `waiting` state by name — persistent, always visible
- Three sections stacked vertically: `Needs input`, `Running`, `Idle / done`
- Within `Needs input`, cards sorted by time blocked descending

Session card anatomy:
- Left accent bar: red = waiting, green = running, gray = idle
- Session name and repo path
- Status pill
- Block type chip (waiting cards only): `decision needed` / `review output` / `confirm action`
- Last Claude message or current task (one line, truncated)
- Time in current state
- Action buttons: context-sensitive (reply, recap, diff, interrupt, resume)

### 5.2 Session detail view

Reached by clicking any session card.

Layout:
- Breadcrumb: `← all sessions / session name`
- Session header: name, repo, branch, time in state; action buttons (recap, stop, open in terminal)
- Blocker banner (if `waiting`): full Claude message + inline reply input
- Two-column body:
  - Left column (wider): diff panel (top) + Claude output panel (bottom)
  - Right column (sidebar): GitHub context

Left column — diff panel:
- Tab toggle: `diff` view / `files (N)` list
- Diff view: file header with `+N / -N` stats, line-by-line diff with add/delete colouring
- Commit bar at bottom: editable commit message input + "commit and push" button

Left column — Claude output panel:
- Tab toggle: `live` (last ~20 lines) / `full log`
- Monospace terminal output stream
- Blinking cursor when running

Right column — GitHub sidebar:
- Linked issue card (if assigned from an issue): issue number, title, labels
- Open PR card (if exists): PR number, branch, CI check pills (pass / fail / pending), reviewer count
- Unassigned issues from same repo (3 most recent): each with "assign to new session" affordance

### 5.3 New session modal

Triggered by "+ new session" in the top bar, or "assign to new session" in the sidebar.

Fields:
- Repo selector (connected repos)
- Source: `GitHub issue URL` / `GitHub PR URL` / `Ad-hoc prompt`
- Issue/PR URL input (conditional on source)
- Prompt input (pre-filled from issue body if source is issue/PR; free-form if ad-hoc)
- Base branch selector (defaults to `main`)
- Branch name (auto-generated, editable)

On submit: worktree is created, Claude Code process is launched, modal closes, new card appears on board.

---

## 6. Key technical constraints

### Git worktree isolation

Every session runs in its own git worktree. Two sessions on the same repo cannot conflict at the filesystem level. Branch names are generated deterministically from the source (e.g. `fix/issue-214` for issue #214). TooManyTabs manages worktree creation on session start and deletion on session kill or discard.

### Claude Code process management

TooManyTabs spawns Claude Code as a child process per session, capturing stdout/stderr for the output panel. Replies and interrupts are delivered via stdin. Session state (`running` / `waiting` / `done`) is inferred by parsing Claude Code's output for known patterns (e.g. waiting-for-input prompts, task completion signals, error states).

### Notifications

macOS `UNUserNotificationCenter` is used for notifications. The app requests notification permission on first launch. Notification payload includes the session ID so that tapping navigates directly to the correct detail view.

### GitHub API

All GitHub interactions (fetching issues, PR details, review comments, opening PRs, closing issues) use the GitHub REST API v3 with a user OAuth token obtained at setup. The token is stored in the macOS Keychain.

---

## 7. Out of scope (v1)

- `CLAUDE.md` creation or management
- Full in-app code editor (users open in terminal for manual edits)
- GitLab or Bitbucket support
- Windows or Linux
- Team/multi-user features
- Session reprioritisation (S-09)
- Stuck session detection (S-12)
- PR review comment routing (S-15)
- Auto-close linked issue (S-16)
- Issue backlog browser (S-02)

---

## 8. Open questions

1. **Session state detection reliability.** Inferring `waiting` vs `running` from Claude Code's stdout is fragile if the output format changes. Is there a more stable hook (e.g. Claude Code's hooks system emitting structured events)?

2. **Worktree storage location.** Where should worktrees live — alongside the main repo clone, or in a TooManyTabs-managed directory? The latter is cleaner but requires TooManyTabs to manage the clone itself.

3. **Token budget per session.** Claude Code sessions can run long and consume significant tokens. Should TooManyTabs expose a per-session token usage display, or enforce a configurable limit before prompting the user?

4. **Recap generation.** The "recap" button on session cards needs to produce a one-paragraph summary of what the session has done so far. This likely requires a secondary Claude API call against the session's log. Latency and cost need validating.

5. **Concurrent session limit.** No hard limit is imposed in v1, but running 10+ sessions simultaneously will saturate CPU and API rate limits. Should TooManyTabs warn or throttle above a configurable ceiling?