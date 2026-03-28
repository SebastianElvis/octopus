import { useEffect, useCallback, useState, useMemo, type ReactNode } from "react";
import { useSessionStore } from "../stores/sessionStore";
import { KanbanCard } from "./KanbanCard";
import {
  checkStuckSessions,
  killSession,
  interruptSession,
  resumeSession,
} from "../lib/tauri";
import type { Session, SessionStatus } from "../lib/types";
import { RUNNING_PULSE } from "../lib/statusColors";

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
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [statusFilter, setStatusFilter] = useState<StatusFilter>(null);
  const [sortKey, setSortKey] = useState<SortKey>("recent");

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

  const needsAttention = useMemo(() => {
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

  // Derive effective selection — prune IDs that no longer exist
  const effectiveSelectedIds = useMemo(() => {
    const validIds = new Set(sessions.map((s) => s.id));
    const pruned = new Set([...selectedIds].filter((id) => validIds.has(id)));
    return pruned.size === selectedIds.size ? selectedIds : pruned;
  }, [sessions, selectedIds]);

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

  function toggleSelect(id: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function handleBulkKill() {
    for (const id of effectiveSelectedIds) {
      try {
        await killSession(id);
      } catch {
        /* ignore */
      }
    }
    setSelectedIds(new Set());
  }

  async function handleBulkResume() {
    for (const id of effectiveSelectedIds) {
      try {
        await resumeSession(id);
        updateSession(id, { status: "running", stateChangedAt: Date.now() });
      } catch {
        /* ignore */
      }
    }
    setSelectedIds(new Set());
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
            className="flex min-w-[280px] flex-1 animate-pulse flex-col rounded-lg bg-gray-50 dark:bg-gray-900"
          >
            <div className="flex items-center gap-2 px-4 py-3">
              <div className="h-2 w-2 rounded-full bg-gray-200 dark:bg-gray-700" />
              <div className="h-3 w-20 rounded bg-gray-200 dark:bg-gray-700" />
            </div>
            <div className="flex flex-col gap-2 px-3 pb-3">
              {[1, 2].map((m) => (
                <div
                  key={m}
                  className="rounded-md border border-gray-200 bg-white p-3 dark:border-gray-800 dark:bg-gray-950"
                >
                  <div className="h-3 w-36 rounded bg-gray-200 dark:bg-gray-700" />
                  <div className="mt-2 h-2.5 w-24 rounded bg-gray-100 dark:bg-gray-800" />
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
        <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-red-100 dark:bg-red-900/30">
          <svg
            className="h-6 w-6 text-red-600 dark:text-red-400"
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
        <p className="text-sm font-medium text-red-600 dark:text-red-400">
          Failed to load sessions
        </p>
        <p className="mt-1 max-w-sm text-xs text-gray-500 dark:text-gray-400">{sessionsError}</p>
        <button
          onClick={() => {
            void loadSessions();
          }}
          className="mt-4 cursor-pointer rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-500 active:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-1"
        >
          Retry
        </button>
      </div>
    );
  }

  // Empty state with workflow explanation
  if (sessions.length === 0) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center p-6 text-center">
        <h2 className="text-lg font-medium text-gray-700 dark:text-gray-300">
          Welcome to TooManyTabs
        </h2>
        <p className="mt-2 max-w-md text-sm text-gray-500 dark:text-gray-400">
          Manage multiple Claude Code sessions in parallel. Here is how it works:
        </p>
        <div className="mt-6 flex max-w-md flex-col gap-3 text-left">
          <WorkflowStep
            number={1}
            title="Add a repository"
            description="Connect a GitHub repo from the Repos tab."
          />
          <WorkflowStep
            number={2}
            title="Create a session"
            description="Link an issue or PR, write a prompt, and spawn a session."
          />
          <WorkflowStep
            number={3}
            title="Monitor and respond"
            description="Watch sessions run, monitor progress, and review changes."
          />
          <WorkflowStep
            number={4}
            title="Ship it"
            description="Commit, push, open a PR, and merge -- all from the app."
          />
        </div>
        <button
          onClick={onNewSession}
          className="mt-6 cursor-pointer rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-500 active:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-1"
        >
          Get Started
        </button>
      </div>
    );
  }

  const hasSelection = effectiveSelectedIds.size > 0;
  const selectedSessions = sessions.filter((s) => effectiveSelectedIds.has(s.id));
  const canResumeSelected = selectedSessions.some((s) => s.status === "attention");
  const canKillSelected = selectedSessions.some((s) => s.status === "running");

  return (
    <div data-testid="dispatch-board" className="flex flex-1 flex-col overflow-hidden">
      {/* Fleet summary bar */}
      <div className="flex shrink-0 items-center justify-between border-b border-gray-200 bg-gray-50 px-6 py-3 dark:border-gray-800 dark:bg-gray-900/50">
        <div className="flex items-center gap-4">
          <span className="text-sm font-semibold text-gray-700 dark:text-gray-300">Fleet</span>
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
          <span className="rounded-full bg-gray-200 px-2 py-0.5 text-xs font-semibold text-gray-600 dark:bg-gray-800 dark:text-gray-400">
            {summary.total} total
          </span>
        </div>
        <button
          onClick={onNewSession}
          className="cursor-pointer rounded-md bg-blue-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-blue-500 active:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-1"
        >
          + New Session
        </button>
      </div>

      {/* Status sentence */}
      {statusSentence && (
        <div className="shrink-0 border-b border-gray-100 bg-gray-50/50 px-6 py-1.5 dark:border-gray-800/50 dark:bg-gray-900/30">
          <p className="text-xs text-gray-500 dark:text-gray-400">{statusSentence}</p>
        </div>
      )}

      {/* Search, filter & sort bar */}
      <div className="flex shrink-0 items-center gap-3 border-b border-gray-200 px-6 py-2 dark:border-gray-800">
        <div className="flex flex-1 items-center gap-2 rounded-md border border-gray-300 bg-white px-3 py-1.5 dark:border-gray-700 dark:bg-gray-900">
          <svg
            className="h-3.5 w-3.5 text-gray-400"
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
            className="flex-1 bg-transparent text-xs text-gray-900 placeholder-gray-400 outline-none dark:text-gray-100 dark:placeholder-gray-500"
          />
          {searchQuery && (
            <button
              onClick={() => setSearchQuery("")}
              className="cursor-pointer text-gray-400 hover:text-gray-600 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-1 dark:hover:text-gray-300"
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
          className="cursor-pointer rounded-md border border-gray-300 bg-white px-2 py-1.5 text-xs text-gray-600 outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-1 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-400"
        >
          <option value="recent">Most recent</option>
          <option value="created">Oldest first</option>
          <option value="name">Name A-Z</option>
          <option value="status">Status</option>
        </select>
      </div>

      {/* Active filter indicator */}
      {statusFilter && (
        <div className="flex shrink-0 items-center gap-2 border-b border-gray-200 bg-blue-50/50 px-6 py-1.5 dark:border-gray-800 dark:bg-blue-950/20">
          <span className="text-xs text-gray-500 dark:text-gray-400">
            Showing:{" "}
            <span className="font-medium text-gray-700 dark:text-gray-300">{statusFilter}</span>
          </span>
          <button
            onClick={() => setStatusFilter(null)}
            className="cursor-pointer text-xs text-blue-600 hover:text-blue-700 focus:outline-none dark:text-blue-400 dark:hover:text-blue-300"
          >
            Clear filter
          </button>
        </div>
      )}

      {/* Bulk actions bar */}
      {hasSelection && (
        <div className="flex shrink-0 items-center gap-3 border-b border-blue-200 bg-blue-50 px-6 py-2 dark:border-blue-900/50 dark:bg-blue-950/30">
          <span className="text-xs font-medium text-blue-700 dark:text-blue-400">
            {effectiveSelectedIds.size} selected
          </span>
          {canKillSelected && (
            <button
              onClick={() => {
                void handleBulkKill();
              }}
              className="cursor-pointer rounded bg-red-600 px-2 py-1 text-xs font-medium text-white hover:bg-red-500 active:bg-red-700 focus:outline-none focus:ring-2 focus:ring-red-500 focus:ring-offset-1"
            >
              Kill Selected
            </button>
          )}
          {canResumeSelected && (
            <button
              onClick={() => {
                void handleBulkResume();
              }}
              className="cursor-pointer rounded bg-blue-600 px-2 py-1 text-xs font-medium text-white hover:bg-blue-500 active:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-1"
            >
              Resume Selected
            </button>
          )}
          <button
            onClick={() => setSelectedIds(new Set())}
            className="ml-auto cursor-pointer text-xs text-gray-500 hover:text-gray-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-1 dark:text-gray-400 dark:hover:text-gray-200"
          >
            Clear selection
          </button>
        </div>
      )}

      {/* Kanban columns */}
      <div className="flex min-h-0 flex-1 gap-4 overflow-x-auto p-6">
        <Column
          title="Needs Attention"
          count={needsAttention.length}
          accentColor="amber"
          emptyIcon="check"
          emptyTitle="All clear"
          emptyDescription="No sessions need your attention right now."
        >
          {needsAttention.map((s) => (
            <SelectableCard
              key={s.id}
              session={s}
              selected={effectiveSelectedIds.has(s.id)}
              onToggleSelect={toggleSelect}
              isActive={s.id === activeSessionId}
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
          {running.map((s) => (
            <SelectableCard
              key={s.id}
              session={s}
              selected={effectiveSelectedIds.has(s.id)}
              onToggleSelect={toggleSelect}
              isActive={s.id === activeSessionId}
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
          accentColor="gray"
          emptyIcon="inbox"
          emptyTitle="Nothing here yet"
          emptyDescription="Finished sessions will appear here."
        >
          {closed.map((s) => (
            <SelectableCard
              key={s.id}
              session={s}
              selected={effectiveSelectedIds.has(s.id)}
              onToggleSelect={toggleSelect}
              isActive={s.id === activeSessionId}
              onView={onViewSession}
            />
          ))}
        </Column>
      </div>
    </div>
  );
}

/* ── Workflow step for empty state ─────────────────────────────────────────── */

function WorkflowStep({
  number,
  title,
  description,
}: {
  number: number;
  title: string;
  description: string;
}) {
  return (
    <div className="flex items-start gap-3">
      <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-blue-100 text-xs font-bold text-blue-700 dark:bg-blue-900/40 dark:text-blue-400">
        {number}
      </span>
      <div>
        <p className="text-sm font-medium text-gray-800 dark:text-gray-200">{title}</p>
        <p className="text-xs text-gray-500 dark:text-gray-400">{description}</p>
      </div>
    </div>
  );
}

/* ── Selectable card wrapper ─────────────────────────────────────────────── */

function SelectableCard({
  session,
  selected,
  onToggleSelect,
  ...cardProps
}: {
  session: Session;
  selected: boolean;
  onToggleSelect: (id: string) => void;
  onView: (id: string) => void;
  onInterrupt?: (id: string) => void;
  onResume?: (id: string) => void;
  onKill?: (id: string) => void;
  isActive?: boolean;
}) {
  return (
    <div className={`relative ${selected ? "rounded-md ring-2 ring-blue-500" : ""}`}>
      <div className="absolute left-1.5 top-1.5 z-10" onClick={(e) => e.stopPropagation()}>
        <input
          type="checkbox"
          checked={selected}
          onChange={() => onToggleSelect(session.id)}
          className="h-3.5 w-3.5 cursor-pointer rounded border-gray-300 text-blue-600 accent-blue-600"
        />
      </div>
      <KanbanCard session={session} {...cardProps} />
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
    red: "bg-red-500",
    green: "bg-green-500",
    blue: "bg-blue-500",
    amber: "bg-amber-500",
    gray: "bg-gray-500",
  };

  return (
    <button
      onClick={onClick}
      className={`flex cursor-pointer items-center gap-1.5 rounded-full px-2.5 py-1 transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-1 ${
        active
          ? "bg-gray-200 ring-1 ring-gray-300 dark:bg-gray-700 dark:ring-gray-600"
          : "hover:bg-gray-100 dark:hover:bg-gray-800"
      }`}
    >
      <span
        className={`h-2 w-2 rounded-full ${dotColors[color] ?? "bg-gray-500"} ${pulse && count > 0 ? RUNNING_PULSE : ""}`}
      />
      <span className="text-xs font-semibold text-gray-900 dark:text-gray-100">{count}</span>
      <span className="text-xs text-gray-500 dark:text-gray-400">{label}</span>
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
  children,
}: {
  title: string;
  count: number;
  accentColor: "amber" | "blue" | "gray" | "orange";
  emptyIcon: "check" | "pause" | "inbox";
  emptyTitle: string;
  emptyDescription: string;
  children: ReactNode;
}) {
  const dotColors = {
    amber: "bg-amber-500",
    blue: "bg-blue-500",
    gray: "bg-gray-500",
    orange: "bg-orange-500",
  };

  const headerBorder = {
    amber: "border-amber-500",
    blue: "border-blue-500",
    gray: "border-gray-300 dark:border-gray-700",
    orange: "border-orange-500",
  };

  return (
    <section
      data-testid={`column-${title.toLowerCase().replace(/\s+/g, "-")}`}
      className="flex min-h-0 min-w-[280px] flex-1 flex-col rounded-lg bg-gray-50/80 dark:bg-gray-900/60"
    >
      {/* Column header */}
      <div className={`border-t-2 ${headerBorder[accentColor]} rounded-t-lg`} />
      <div className="flex items-center gap-2 px-4 py-2.5">
        <span className={`inline-block h-2.5 w-2.5 rounded-full ${dotColors[accentColor]}`} />
        <h2 className="text-sm font-semibold uppercase tracking-wider text-gray-600 dark:text-gray-300">
          {title}
        </h2>
        <span className="rounded-full bg-gray-200 px-1.5 py-0.5 text-xs font-medium text-gray-600 dark:bg-gray-800 dark:text-gray-400">
          {count}
        </span>
      </div>

      {/* Cards */}
      <div className="flex flex-1 flex-col gap-2.5 overflow-y-auto px-3 pb-3">
        {count === 0 ? (
          <div className="flex flex-col items-center px-2 py-6 text-center">
            <EmptyIcon type={emptyIcon} />
            <p className="mt-2 text-xs font-medium text-gray-500 dark:text-gray-400">
              {emptyTitle}
            </p>
            <p className="mt-0.5 text-[11px] leading-relaxed text-gray-400 dark:text-gray-500">
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
  const cls = "h-5 w-5 text-gray-300 dark:text-gray-600";
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
