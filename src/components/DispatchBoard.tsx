import { useEffect, useCallback, type ReactNode } from "react";
import { useSessionStore } from "../stores/sessionStore";
import { KanbanCard } from "./KanbanCard";
import { checkStuckSessions } from "../lib/tauri";

interface DispatchBoardProps {
  onViewSession: (id: string) => void;
  onNewSession: () => void;
}

export function DispatchBoard({ onViewSession, onNewSession }: DispatchBoardProps) {
  const sessions = useSessionStore((s) => s.sessions);
  const sessionsLoading = useSessionStore((s) => s.sessionsLoading);
  const updateSession = useSessionStore((s) => s.updateSession);

  const needsAttention = [...sessions.filter(
    (s) => s.status === "waiting" || s.status === "paused" || s.status === "stuck",
  )].sort((a, b) => a.stateChangedAt - b.stateChangedAt);
  const running = sessions.filter((s) => s.status === "running");
  const closed = sessions.filter(
    (s) => s.status === "idle" || s.status === "done" || s.status === "completed" || s.status === "failed" || s.status === "killed",
  );

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

  function handleReply(id: string) {
    onViewSession(id);
  }

  function handleInterrupt(id: string) {
    onViewSession(id);
  }

  function handleResume(id: string) {
    onViewSession(id);
  }

  if (sessionsLoading) {
    return (
      <div className="flex flex-1 gap-4 overflow-x-auto p-6">
        {[1, 2, 3].map((n) => (
          <div key={n} className="flex w-72 shrink-0 animate-pulse flex-col rounded-lg bg-gray-50 dark:bg-gray-900">
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

  if (sessions.length === 0) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center p-6 text-center">
        <p className="text-lg font-medium text-gray-500 dark:text-gray-400">No sessions yet</p>
        <p className="mt-1 text-sm text-gray-400 dark:text-gray-600">
          Create a new session to get started.
        </p>
        <button
          onClick={onNewSession}
          className="mt-4 rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-500"
        >
          + New Session
        </button>
      </div>
    );
  }

  return (
    <div className="flex flex-1 gap-4 overflow-x-auto p-6">
      <Column
        title="Needs Attention"
        count={needsAttention.length}
        accentColor="red"
        empty="No sessions need attention."
      >
        {needsAttention.map((s) => (
          <KanbanCard
            key={s.id}
            session={s}
            onView={onViewSession}
            onReply={s.status === "waiting" ? handleReply : undefined}
            onResume={s.status === "paused" ? handleResume : undefined}
          />
        ))}
      </Column>

      <Column title="Running" count={running.length} accentColor="green" empty="No sessions running.">
        {running.map((s) => (
          <KanbanCard key={s.id} session={s} onView={onViewSession} onInterrupt={handleInterrupt} />
        ))}
      </Column>

      <Column title="Closed" count={closed.length} accentColor="gray" empty="No closed sessions.">
        {closed.map((s) => (
          <KanbanCard key={s.id} session={s} onView={onViewSession} />
        ))}
      </Column>
    </div>
  );
}

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
