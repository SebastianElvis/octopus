import { useEffect, useCallback, useState, useMemo, type ReactNode } from "react";
import { useSessionStore } from "../stores/sessionStore";
import { KanbanCard } from "./KanbanCard";
import {
  checkStuckSessions,
  killSession,
  interruptSession,
  resumeSession,
  fetchCheckRuns,
  fetchPRs,
} from "../lib/tauri";
import type { Session, SessionStatus } from "../lib/types";
import type { CIStatus } from "./KanbanCard";
import { RUNNING_PULSE } from "../lib/statusColors";

export type PRState = "open" | "closed" | "merged";

type StatusFilter = "attention" | "running" | "done" | null;
type SortKey = "recent" | "created" | "name" | "status";

interface DispatchBoardProps {
  onViewSession: (id: string) => void;
  onNewSession: () => void;
  activeSessionId?: string | null;
}

export function DispatchBoard({
  onViewSession,
  onNewSession,
  activeSessionId,
}: DispatchBoardProps) {
  const sessions = useSessionStore((s) => s.sessions);
  const sessionsLoading = useSessionStore((s) => s.sessionsLoading);
  const sessionsError = useSessionStore((s) => s.sessionsError);
  const updateSession = useSessionStore((s) => s.updateSession);
  const loadSessions = useSessionStore((s) => s.loadSessions);

  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>(null);
  const [sortKey, setSortKey] = useState<SortKey>("recent");
  const [ciStatuses, setCiStatuses] = useState<Record<string, CIStatus>>({});
  const [prStates, setPrStates] = useState<Record<string, PRState>>({});
  const [doneCollapsed, setDoneCollapsed] = useState(false);

  // Fetch CI status and PR state for sessions with linked PRs
  useEffect(() => {
    const sessionsWithPR = sessions.filter((s) => s.linkedPR && s.repoId);
    if (sessionsWithPR.length === 0) return;

    // Group sessions by repoId to batch PR fetches
    const byRepo = new Map<string, Session[]>();
    for (const s of sessionsWithPR) {
      if (!s.repoId) continue;
      let list = byRepo.get(s.repoId);
      if (!list) {
        list = [];
        byRepo.set(s.repoId, list);
      }
      list.push(s);
    }

    // Fetch PR states per repo (one API call per repo)
    for (const [repoId, repoSessions] of byRepo) {
      void fetchPRs(repoId)
        .then((prs) => {
          for (const s of repoSessions) {
            if (!s.linkedPR) continue;
            const prNum = s.linkedPR.number;
            const pr = prs.find((p) => p.number === prNum);
            if (pr) {
              setPrStates((prev) => ({ ...prev, [s.id]: pr.state as PRState }));
            }
          }
        })
        .catch(() => {
          /* non-critical */
        });
    }

    // Fetch CI statuses
    for (const s of sessionsWithPR) {
      if (!s.repoId || !s.branch) continue;
      void fetchCheckRuns(s.repoId, s.branch)
        .then((runs) => {
          if (runs.length === 0) return;
          const allPass = runs.every((r) => r.conclusion === "success");
          const anyFail = runs.some((r) => r.conclusion === "failure");
          const status: CIStatus = allPass ? "success" : anyFail ? "failure" : "pending";
          setCiStatuses((prev) => ({ ...prev, [s.id]: status }));
        })
        .catch(() => {
          /* non-critical */
        });
    }
  }, [sessions]);

  // Keyboard shortcut for search focus
  useEffect(() => {
    function handleKey(e: KeyboardEvent) {
      if (e.key === "/" && !(e.target as HTMLElement).matches("input,textarea,select")) {
        e.preventDefault();
        document.getElementById("dispatch-search")?.focus();
      }
    }
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, []);

  // Filter sessions
  const filteredSessions = useMemo(() => {
    let result = sessions;

    // Text search
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      result = result.filter(
        (s) =>
          s.name.toLowerCase().includes(q) ||
          s.repo.toLowerCase().includes(q) ||
          s.branch.toLowerCase().includes(q),
      );
    }

    // Status filter
    if (statusFilter) {
      const statusGroups: Record<StatusFilter & string, SessionStatus[]> = {
        attention: ["attention"],
        running: ["running"],
        done: ["done"],
      };
      const allowed = statusGroups[statusFilter];
      result = result.filter((s) => allowed.includes(s.status));
    }

    return result;
  }, [sessions, searchQuery, statusFilter]);

  // Sort helper
  const sortSessions = useCallback(
    (list: Session[]) => {
      const sorted = [...list];
      switch (sortKey) {
        case "recent":
          sorted.sort((a, b) => b.stateChangedAt - a.stateChangedAt);
          break;
        case "created":
          sorted.sort((a, b) => a.stateChangedAt - b.stateChangedAt);
          break;
        case "name":
          sorted.sort((a, b) => a.name.localeCompare(b.name));
          break;
        case "status":
          sorted.sort((a, b) => a.status.localeCompare(b.status));
          break;
      }
      return sorted;
    },
    [sortKey],
  );

  const needsInput = useMemo(() => {
    const items = filteredSessions.filter((s) => s.status === "attention");
    return items.sort((a, b) => b.stateChangedAt - a.stateChangedAt);
  }, [filteredSessions]);

  const running = useMemo(
    () => sortSessions(filteredSessions.filter((s) => s.status === "running")),
    [filteredSessions, sortSessions],
  );
  const closed = useMemo(
    () => sortSessions(filteredSessions.filter((s) => s.status === "done")),
    [filteredSessions, sortSessions],
  );

  // Fleet summary counts (always from unfiltered sessions)
  const summary = useMemo(() => {
    const counts = { attention: 0, running: 0, done: 0, total: sessions.length };
    for (const s of sessions) {
      if (s.status === "attention") counts.attention++;
      else if (s.status === "running") counts.running++;
      else if (s.status === "done") counts.done++;
    }
    return counts;
  }, [sessions]);

  // Natural-language summary
  const statusSentence = useMemo(() => {
    const parts: string[] = [];
    if (summary.attention > 0) {
      parts.push(
        `${String(summary.attention)} session${summary.attention === 1 ? "" : "s"} need${summary.attention === 1 ? "s" : ""} your input`,
      );
    }
    if (summary.running > 0) {
      parts.push(`${String(summary.running)} actively running`);
    }
    if (parts.length === 0) {
      if (summary.total === 0) return null;
      if (summary.done === summary.total) return "All sessions finished.";
      return null;
    }
    return parts.join(". ") + ".";
  }, [summary]);

  const markStuck = useCallback(async () => {
    try {
      const stuckIds = await checkStuckSessions();
      for (const id of stuckIds) {
        updateSession(id, { status: "attention" });
      }
    } catch {
      // ignore — backend may not be available
    }
  }, [updateSession]);

  useEffect(() => {
    void markStuck();
    const interval = setInterval(
      () => {
        void markStuck();
      },
      5 * 60 * 1000,
    );
    return () => clearInterval(interval);
  }, [markStuck]);

  async function handleInterrupt(id: string) {
    try {
      await interruptSession(id);
    } catch {
      /* ignore */
    }
  }

  async function handleResume(id: string) {
    try {
      await resumeSession(id);
      updateSession(id, { status: "running", stateChangedAt: Date.now() });
    } catch {
      /* ignore */
    }
  }

  async function handleKill(id: string) {
    try {
      await killSession(id);
    } catch {
      /* ignore */
    }
  }

  function toggleStatusFilter(filter: StatusFilter) {
    setStatusFilter((prev) => (prev === filter ? null : filter));
  }

  if (sessionsLoading) {
    return (
      <div className="flex flex-1 gap-4 overflow-x-auto p-6">
        {[1, 2, 3].map((n) => (
          <div
            key={n}
            className="flex min-w-[280px] flex-1 animate-pulse flex-col rounded-sm bg-surface"
          >
            <div className="flex items-center gap-2 px-4 py-3">
              <div className="h-2 w-2 rounded-full bg-active" />
              <div className="h-3 w-20 rounded bg-active" />
            </div>
            <div className="flex flex-col gap-2 px-3 pb-3">
              {[1, 2].map((m) => (
                <div
                  key={m}
                  className="rounded-sm border border-outline p-3 bg-surface"
                >
                  <div className="h-3 w-36 rounded bg-active" />
                  <div className="mt-2 h-2.5 w-24 rounded bg-hover" />
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    );
  }

  // Error state with retry
  if (sessionsError) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center p-6 text-center">
        <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-danger-muted">
          <svg
            className="h-6 w-6 text-danger"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={2}
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M12 9v2m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
            />
          </svg>
        </div>
        <p className="text-sm font-medium text-danger">
          Failed to load sessions
        </p>
        <p className="mt-1 max-w-sm text-xs text-on-surface-muted">{sessionsError}</p>
        <button
          onClick={() => {
            void loadSessions();
          }}
          className="mt-4 cursor-pointer rounded-sm bg-brand px-4 py-2 text-sm font-medium text-white hover:bg-brand active:bg-brand focus:outline-none focus:ring-2 focus:ring-brand focus:ring-offset-1"
        >
          Retry
        </button>
      </div>
    );
  }

  // Empty state — terminal-native
  if (sessions.length === 0) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center p-6">
        <div className="w-full max-w-xs">
          <p className="mb-3 text-xs font-medium uppercase tracking-widest text-on-surface-faint">
            no sessions
          </p>
          <div className="flex flex-col gap-3 border border-outline bg-surface px-4 py-3">
            <WorkflowStep cmd="repos add <github-url>" desc="connect a repository" />
            <WorkflowStep cmd="session new" desc="link an issue, write a prompt" />
            <WorkflowStep cmd="monitor" desc="watch output, respond to prompts" />
            <WorkflowStep cmd="ship" desc="commit, push, open PR, merge" />
          </div>
          <button
            onClick={onNewSession}
            className="mt-3 w-full cursor-pointer border border-outline py-1.5 text-xs font-medium text-on-surface-muted hover:border-brand hover:text-brand focus:outline-none focus:ring-2 focus:ring-brand focus:ring-offset-1"
          >
            + new session
          </button>
        </div>
      </div>
    );
  }

  return (
    <div data-testid="dispatch-board" className="flex flex-1 flex-col overflow-hidden">
      {/* Fleet summary + search bar */}
      <div className="flex shrink-0 items-center justify-between border-b border-outline bg-surface px-4 py-2">
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1.5">
            <SummaryPill
              color="amber"
              count={summary.attention}
              label="attention"
              active={statusFilter === "attention"}
              onClick={() => toggleStatusFilter("attention")}
            />
            <SummaryPill
              color="blue"
              count={summary.running}
              label="running"
              pulse
              active={statusFilter === "running"}
              onClick={() => toggleStatusFilter("running")}
            />
            <SummaryPill
              color="gray"
              count={summary.done}
              label="done"
              active={statusFilter === "done"}
              onClick={() => toggleStatusFilter("done")}
            />
          </div>
          {statusSentence && (
            <span className="text-xs text-on-surface-faint">{statusSentence}</span>
          )}
        </div>
        <button
          onClick={onNewSession}
          className="cursor-pointer rounded-sm bg-brand px-3 py-1.5 text-xs font-medium text-white hover:bg-brand active:bg-brand focus:outline-none focus:ring-2 focus:ring-brand focus:ring-offset-1"
        >
          + New Session
        </button>
      </div>

      {/* Search, filter & sort bar */}
      <div className="flex shrink-0 items-center gap-3 border-b border-outline px-4 py-1.5">
        <div className="flex flex-1 items-center gap-2 rounded-sm border border-outline bg-surface px-3 py-1.5">
          <svg
            className="h-3.5 w-3.5 text-on-surface-faint"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={2}
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
            />
          </svg>
          <input
            id="dispatch-search"
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Filter sessions... (press / to focus)"
            className="flex-1 bg-transparent text-xs text-on-surface placeholder-on-surface-faint outline-none"
          />
          {searchQuery && (
            <button
              onClick={() => setSearchQuery("")}
              className="cursor-pointer text-on-surface-faint hover:text-on-surface-muted focus:outline-none focus:ring-2 focus:ring-brand focus:ring-offset-1"
            >
              <svg
                className="h-3 w-3"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={2}
              >
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          )}
        </div>

        {/* Sort dropdown */}
        <select
          value={sortKey}
          onChange={(e) => setSortKey(e.target.value as SortKey)}
          className="cursor-pointer rounded-sm border border-outline bg-surface px-2 py-1.5 text-xs text-on-surface-muted outline-none focus:ring-2 focus:ring-brand focus:ring-offset-1"
        >
          <option value="recent">Most recent</option>
          <option value="created">Oldest first</option>
          <option value="name">Name A-Z</option>
          <option value="status">Status</option>
        </select>
      </div>

      {/* Active filter indicator */}
      {statusFilter && (
        <div className="flex shrink-0 items-center gap-2 border-b border-outline bg-brand-muted px-4 py-1">
          <span className="text-xs text-on-surface-muted">
            Showing:{" "}
            <span className="font-medium text-on-surface">{statusFilter}</span>
          </span>
          <button
            onClick={() => setStatusFilter(null)}
            className="cursor-pointer text-xs text-brand hover:text-brand focus:outline-none"
          >
            Clear filter
          </button>
        </div>
      )}

      {/* Kanban columns */}
      <div className="flex min-h-0 flex-1 gap-3 overflow-x-auto p-4">
        <Column
          title="Needs Input"
          count={needsInput.length}
          accentColor="amber"
          emptyIcon="check"
          emptyTitle="All clear"
          emptyDescription="No sessions need your attention right now."
        >
          {needsInput.map((s, i) => (
            <KanbanCard
              key={s.id}
              session={s}
              index={i}
              isActive={s.id === activeSessionId}
              ciStatus={ciStatuses[s.id]}
              prState={prStates[s.id]}
              onView={onViewSession}
              onResume={(id: string) => {
                void handleResume(id);
              }}
            />
          ))}
        </Column>

        <Column
          title="Running"
          count={running.length}
          accentColor="blue"
          emptyIcon="pause"
          emptyTitle="No active sessions"
          emptyDescription="All sessions are paused or waiting. Resume one to continue."
        >
          {running.map((s, i) => (
            <KanbanCard
              key={s.id}
              session={s}
              index={i}
              isActive={s.id === activeSessionId}
              ciStatus={ciStatuses[s.id]}
              prState={prStates[s.id]}
              onView={onViewSession}
              onInterrupt={(id: string) => {
                void handleInterrupt(id);
              }}
              onKill={(id: string) => {
                void handleKill(id);
              }}
            />
          ))}
        </Column>

        <Column
          title="Done"
          count={closed.length}
          accentColor="green"
          emptyIcon="inbox"
          emptyTitle="Nothing here yet"
          emptyDescription="Finished sessions will appear here."
          collapsed={doneCollapsed}
          onToggleCollapse={() => setDoneCollapsed((v) => !v)}
        >
          {closed.map((s, i) => (
            <KanbanCard
              key={s.id}
              session={s}
              index={i}
              isActive={s.id === activeSessionId}
              ciStatus={ciStatuses[s.id]}
              prState={prStates[s.id]}
              onView={onViewSession}
            />
          ))}
        </Column>
      </div>
    </div>
  );
}

/* ── Workflow step for empty state ─────────────────────────────────────────── */

function WorkflowStep({ cmd, desc }: { cmd: string; desc: string }) {
  return (
    <div className="flex flex-col gap-0.5">
      <span className="font-mono text-xs text-brand">$ {cmd}</span>
      <span className="pl-2 text-xs text-on-surface-faint">{desc}</span>
    </div>
  );
}

/* ── Summary pill (clickable filter) ────────────────────────────────────── */

function SummaryPill({
  color,
  count,
  label,
  pulse,
  active,
  onClick,
}: {
  color: string;
  count: number;
  label: string;
  pulse?: boolean;
  active?: boolean;
  onClick?: () => void;
}) {
  const dotColors: Record<string, string> = {
    red: "bg-danger",
    green: "bg-status-done",
    blue: "bg-status-running",
    amber: "bg-status-attention",
    gray: "bg-on-surface-faint",
  };

  return (
    <button
      onClick={onClick}
      className={`flex cursor-pointer items-center gap-1.5 rounded-full px-2.5 py-1 transition-colors focus:outline-none focus:ring-2 focus:ring-brand focus:ring-offset-1 ${
        active
          ? "bg-active ring-1 ring-outline-strong"
          : "hover:bg-hover"
      }`}
    >
      <span
        className={`h-2 w-2 rounded-full ${dotColors[color] ?? "bg-gray-500"} ${pulse && count > 0 ? RUNNING_PULSE : ""}`}
      />
      <span className="text-xs font-semibold text-on-surface">{count}</span>
      <span className="text-xs text-on-surface-muted">{label}</span>
    </button>
  );
}

/* ── Column ──────────────────────────────────────────────────────────────── */

function Column({
  title,
  count,
  accentColor,
  emptyIcon,
  emptyTitle,
  emptyDescription,
  collapsed,
  onToggleCollapse,
  children,
}: {
  title: string;
  count: number;
  accentColor: "amber" | "blue" | "green" | "gray" | "orange";
  emptyIcon: "check" | "pause" | "inbox";
  emptyTitle: string;
  emptyDescription: string;
  collapsed?: boolean;
  onToggleCollapse?: () => void;
  children: ReactNode;
}) {
  const dotColors = {
    amber: "bg-status-attention",
    blue: "bg-status-running",
    green: "bg-status-done",
    gray: "bg-on-surface-faint",
    orange: "bg-block-permission",
  };

  if (collapsed) {
    return (
      <section
        data-testid={`column-${title.toLowerCase().replace(/\s+/g, "-")}`}
        className="flex min-h-0 w-10 shrink-0 flex-col items-center rounded-sm bg-surface-sunken"
      >
        <button
          onClick={onToggleCollapse}
          className="flex w-full cursor-pointer flex-col items-center gap-2 px-1 py-3 text-on-surface-faint hover:text-on-surface-muted"
          title={`Expand ${title} (${count})`}
        >
          <span className={`inline-block h-1.5 w-1.5 rounded-full ${dotColors[accentColor]}`} />
          <span className="text-xs font-semibold tabular-nums">{count}</span>
          <span
            className="text-[9px] font-medium uppercase tracking-widest"
            style={{ writingMode: "vertical-lr" }}
          >
            {title}
          </span>
        </button>
      </section>
    );
  }

  return (
    <section
      data-testid={`column-${title.toLowerCase().replace(/\s+/g, "-")}`}
      className="flex min-h-0 min-w-[280px] flex-1 flex-col rounded-sm bg-surface-sunken"
    >
      {/* Column header — dot + title + count */}
      <div className="flex items-center gap-2 px-4 py-2.5">
        <span className={`inline-block h-1.5 w-1.5 rounded-full ${dotColors[accentColor]}`} />
        <h2 className="text-xs font-medium uppercase tracking-widest text-on-surface-faint">
          {title}
        </h2>
        <span className="tabular-nums text-xs text-on-surface-faint">{count}</span>
        {onToggleCollapse && count > 0 && (
          <button
            onClick={onToggleCollapse}
            className="ml-auto cursor-pointer text-on-surface-faint hover:text-on-surface-muted"
            title={`Collapse ${title}`}
          >
            <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
            </svg>
          </button>
        )}
      </div>

      {/* Cards */}
      <div className="flex flex-1 flex-col gap-2 overflow-y-auto pb-3">
        {count === 0 ? (
          <div className="flex flex-col items-center px-2 py-6 text-center">
            <EmptyIcon type={emptyIcon} />
            <p className="mt-2 text-xs font-medium text-on-surface-muted">
              {emptyTitle}
            </p>
            <p className="mt-0.5 text-[11px] leading-relaxed text-on-surface-faint">
              {emptyDescription}
            </p>
          </div>
        ) : (
          children
        )}
      </div>
    </section>
  );
}

/* ── Empty state icons ──────────────────────────────────────────────────── */

function EmptyIcon({ type }: { type: "check" | "pause" | "inbox" }) {
  const cls = "h-5 w-5 text-on-surface-faint";
  if (type === "check") {
    return (
      <svg className={cls} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
      </svg>
    );
  }
  if (type === "pause") {
    return (
      <svg className={cls} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          d="M10 9v6m4-6v6m7-3a9 9 0 11-18 0 9 9 0 0118 0z"
        />
      </svg>
    );
  }
  return (
    <svg className={cls} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M20 13V6a2 2 0 00-2-2H6a2 2 0 00-2 2v7m16 0v5a2 2 0 01-2 2H6a2 2 0 01-2-2v-5m16 0h-2.586a1 1 0 00-.707.293l-2.414 2.414a1 1 0 01-.707.293h-3.172a1 1 0 01-.707-.293l-2.414-2.414A1 1 0 006.586 13H4"
      />
    </svg>
  );
}
