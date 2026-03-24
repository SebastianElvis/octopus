import { useEffect, useCallback, useState, useMemo, type ReactNode } from "react";
import { useSessionStore } from "../stores/sessionStore";
import { KanbanCard } from "./KanbanCard";
import { checkStuckSessions, killSession, resumeSession } from "../lib/tauri";
import type { Session } from "../lib/types";

interface DispatchBoardProps {
  onViewSession: (id: string) => void;
  onNewSession: () => void;
}

export function DispatchBoard({ onViewSession, onNewSession }: DispatchBoardProps) {
  const sessions = useSessionStore((s) => s.sessions);
  const sessionsLoading = useSessionStore((s) => s.sessionsLoading);
  const sessionsError = useSessionStore((s) => s.sessionsError);
  const updateSession = useSessionStore((s) => s.updateSession);
  const loadSessions = useSessionStore((s) => s.loadSessions);

  const [searchQuery, setSearchQuery] = useState("");
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  // Filter sessions
  const filteredSessions = useMemo(() => {
    let result = sessions;
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      result = result.filter(
        (s) =>
          s.name.toLowerCase().includes(q) ||
          s.repo.toLowerCase().includes(q) ||
          s.branch.toLowerCase().includes(q),
      );
    }
    return result;
  }, [sessions, searchQuery]);

  const needsAttention = [
    ...filteredSessions.filter(
      (s) =>
        s.status === "waiting" ||
        s.status === "paused" ||
        s.status === "stuck" ||
        s.status === "interrupted",
    ),
  ].sort((a, b) => a.stateChangedAt - b.stateChangedAt);
  const running = filteredSessions.filter((s) => s.status === "running");
  const closed = filteredSessions.filter(
    (s) =>
      s.status === "idle" ||
      s.status === "done" ||
      s.status === "completed" ||
      s.status === "failed" ||
      s.status === "killed",
  );

  // Fleet summary counts (always from unfiltered sessions)
  const summary = useMemo(() => {
    const counts = { attention: 0, running: 0, completed: 0, failed: 0, total: sessions.length };
    for (const s of sessions) {
      if (
        s.status === "waiting" ||
        s.status === "stuck" ||
        s.status === "paused" ||
        s.status === "interrupted"
      )
        counts.attention++;
      else if (s.status === "running") counts.running++;
      else if (s.status === "completed" || s.status === "done") counts.completed++;
      else if (s.status === "failed") counts.failed++;
    }
    return counts;
  }, [sessions]);

  const markStuck = useCallback(async () => {
    try {
      const stuckIds = await checkStuckSessions();
      for (const id of stuckIds) {
        updateSession(id, { status: "stuck" });
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

  // Clear selection when sessions change
  const [prevSessions, setPrevSessions] = useState(sessions);
  if (sessions !== prevSessions) {
    setPrevSessions(sessions);
    const validIds = new Set(sessions.map((s) => s.id));
    setSelectedIds((prev) => {
      const next = new Set([...prev].filter((id) => validIds.has(id)));
      return next.size === prev.size ? prev : next;
    });
  }

  function handleReply(id: string) {
    onViewSession(id);
  }

  function handleInterrupt(id: string) {
    onViewSession(id);
  }

  function handleResume(id: string) {
    onViewSession(id);
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
    for (const id of selectedIds) {
      try {
        await killSession(id);
        updateSession(id, { status: "killed", stateChangedAt: Date.now() });
      } catch {
        /* ignore */
      }
    }
    setSelectedIds(new Set());
  }

  async function handleBulkResume() {
    for (const id of selectedIds) {
      try {
        await resumeSession(id);
        updateSession(id, { status: "running", stateChangedAt: Date.now() });
      } catch {
        /* ignore */
      }
    }
    setSelectedIds(new Set());
  }

  if (sessionsLoading) {
    return (
      <div className="flex flex-1 gap-4 overflow-x-auto p-6">
        {[1, 2, 3].map((n) => (
          <div
            key={n}
            className="flex w-72 shrink-0 animate-pulse flex-col rounded-lg bg-gray-50 dark:bg-gray-900"
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
        <p className="mt-1 max-w-sm text-xs text-gray-500 dark:text-gray-500">{sessionsError}</p>
        <button
          onClick={() => {
            void loadSessions();
          }}
          className="mt-4 rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-500"
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
            description="Watch sessions run, reply when they need input, and review changes."
          />
          <WorkflowStep
            number={4}
            title="Ship it"
            description="Commit, push, open a PR, and merge -- all from the app."
          />
        </div>
        <button
          onClick={onNewSession}
          className="mt-6 rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-500"
        >
          Get Started
        </button>
      </div>
    );
  }

  const hasSelection = selectedIds.size > 0;
  const selectedSessions = sessions.filter((s) => selectedIds.has(s.id));
  const canResumeSelected = selectedSessions.some(
    (s) => s.status === "paused" || s.status === "interrupted" || s.status === "idle",
  );
  const canKillSelected = selectedSessions.some(
    (s) => s.status === "running" || s.status === "waiting" || s.status === "stuck",
  );

  return (
    <div className="flex flex-1 flex-col overflow-hidden">
      {/* Fleet summary bar */}
      <div className="flex shrink-0 items-center justify-between border-b border-gray-200 bg-gray-50 px-6 py-3 dark:border-gray-800 dark:bg-gray-900/50">
        <div className="flex items-center gap-4">
          <span className="text-xs font-medium text-gray-500 dark:text-gray-400">Fleet</span>
          <div className="flex items-center gap-3">
            <SummaryPill color="red" count={summary.attention} label="attention" />
            <SummaryPill color="green" count={summary.running} label="running" />
            <SummaryPill color="blue" count={summary.completed} label="completed" />
            <SummaryPill color="gray" count={summary.failed} label="failed" />
          </div>
          <span className="text-xs text-gray-400 dark:text-gray-600">{summary.total} total</span>
        </div>
        <button
          onClick={onNewSession}
          className="rounded-md bg-blue-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-blue-500"
        >
          + New Session
        </button>
      </div>

      {/* Search & filter bar */}
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
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Filter sessions..."
            className="flex-1 bg-transparent text-xs text-gray-900 placeholder-gray-400 outline-none dark:text-gray-100 dark:placeholder-gray-600"
          />
          {searchQuery && (
            <button
              onClick={() => setSearchQuery("")}
              className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
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
      </div>

      {/* Bulk actions bar */}
      {hasSelection && (
        <div className="flex shrink-0 items-center gap-3 border-b border-blue-200 bg-blue-50 px-6 py-2 dark:border-blue-900/50 dark:bg-blue-950/30">
          <span className="text-xs font-medium text-blue-700 dark:text-blue-400">
            {selectedIds.size} selected
          </span>
          {canKillSelected && (
            <button
              onClick={() => {
                void handleBulkKill();
              }}
              className="rounded bg-red-600 px-2 py-1 text-xs font-medium text-white hover:bg-red-500"
            >
              Kill Selected
            </button>
          )}
          {canResumeSelected && (
            <button
              onClick={() => {
                void handleBulkResume();
              }}
              className="rounded bg-blue-600 px-2 py-1 text-xs font-medium text-white hover:bg-blue-500"
            >
              Resume Selected
            </button>
          )}
          <button
            onClick={() => setSelectedIds(new Set())}
            className="ml-auto text-xs text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
          >
            Clear selection
          </button>
        </div>
      )}

      {/* Kanban columns */}
      <div className="flex flex-1 gap-4 overflow-x-auto p-6">
        <Column
          title="Needs Attention"
          count={needsAttention.length}
          accentColor="red"
          empty="No sessions need attention."
        >
          {needsAttention.map((s) => (
            <SelectableCard
              key={s.id}
              session={s}
              selected={selectedIds.has(s.id)}
              onToggleSelect={toggleSelect}
              onView={onViewSession}
              onReply={s.status === "waiting" ? handleReply : undefined}
              onResume={
                s.status === "paused" || s.status === "interrupted" ? handleResume : undefined
              }
            />
          ))}
        </Column>

        <Column
          title="Running"
          count={running.length}
          accentColor="green"
          empty="No sessions running."
        >
          {running.map((s) => (
            <SelectableCard
              key={s.id}
              session={s}
              selected={selectedIds.has(s.id)}
              onToggleSelect={toggleSelect}
              onView={onViewSession}
              onInterrupt={handleInterrupt}
            />
          ))}
        </Column>

        <Column title="Closed" count={closed.length} accentColor="gray" empty="No closed sessions.">
          {closed.map((s) => (
            <SelectableCard
              key={s.id}
              session={s}
              selected={selectedIds.has(s.id)}
              onToggleSelect={toggleSelect}
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
        <p className="text-xs text-gray-500 dark:text-gray-500">{description}</p>
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
  onReply?: (id: string) => void;
  onInterrupt?: (id: string) => void;
  onResume?: (id: string) => void;
}) {
  return (
    <div className={`relative ${selected ? "ring-2 ring-blue-500 rounded-md" : ""}`}>
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

/* ── Summary pill ────────────────────────────────────────────────────────── */

function SummaryPill({ color, count, label }: { color: string; count: number; label: string }) {
  const dotColors: Record<string, string> = {
    red: "bg-red-500",
    green: "bg-green-500",
    blue: "bg-blue-500",
    gray: "bg-gray-500",
  };

  return (
    <div className="flex items-center gap-1.5">
      <span className={`h-1.5 w-1.5 rounded-full ${dotColors[color] ?? "bg-gray-500"}`} />
      <span className="text-xs font-semibold text-gray-900 dark:text-gray-100">{count}</span>
      <span className="text-xs text-gray-500 dark:text-gray-400">{label}</span>
    </div>
  );
}

/* ── Column ──────────────────────────────────────────────────────────────── */

function Column({
  title,
  count,
  accentColor,
  empty,
  children,
}: {
  title: string;
  count: number;
  accentColor: "red" | "green" | "gray" | "orange";
  empty: string;
  children: ReactNode;
}) {
  const dotColors = {
    red: "bg-red-500",
    green: "bg-green-500",
    gray: "bg-gray-500",
    orange: "bg-orange-500",
  };

  const headerBorder = {
    red: "border-red-500",
    green: "border-green-500",
    gray: "border-gray-300 dark:border-gray-700",
    orange: "border-orange-500",
  };

  return (
    <section className="flex w-72 shrink-0 flex-col rounded-lg bg-gray-50 dark:bg-gray-900/50">
      {/* Column header */}
      <div className={`border-t-2 ${headerBorder[accentColor]} rounded-t-lg`} />
      <div className="flex items-center gap-2 px-4 py-3">
        <span className={`inline-block h-2 w-2 rounded-full ${dotColors[accentColor]}`} />
        <h2 className="text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
          {title}
        </h2>
        <span className="rounded-full bg-gray-200 px-1.5 py-0.5 text-xs font-medium text-gray-600 dark:bg-gray-800 dark:text-gray-400">
          {count}
        </span>
      </div>

      {/* Cards */}
      <div className="flex flex-1 flex-col gap-2 overflow-y-auto px-3 pb-3">
        {count === 0 ? (
          <p className="px-1 py-4 text-center text-xs text-gray-400 dark:text-gray-600">{empty}</p>
        ) : (
          children
        )}
      </div>
    </section>
  );
}
