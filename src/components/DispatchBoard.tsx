import { useEffect, useCallback, type ReactNode } from "react";
import { useSessionStore } from "../stores/sessionStore";
import { SessionCard } from "./SessionCard";
import { checkStuckSessions } from "../lib/tauri";

interface DispatchBoardProps {
  onViewSession: (id: string) => void;
  onNewSession: () => void;
}

export function DispatchBoard({ onViewSession, onNewSession }: DispatchBoardProps) {
  const sessions = useSessionStore((s) => s.sessions);
  const sessionsLoading = useSessionStore((s) => s.sessionsLoading);
  const updateSession = useSessionStore((s) => s.updateSession);

  const waiting = [...sessions.filter((s) => s.status === "waiting")].sort(
    (a, b) => a.stateChangedAt - b.stateChangedAt,
  );
  const running = sessions.filter((s) => s.status === "running" || s.status === "stuck");
  const paused = sessions.filter((s) => s.status === "paused");
  const idle = sessions.filter((s) => s.status === "idle" || s.status === "done");

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
    updateSession(id, { status: "idle", stateChangedAt: Date.now() });
  }

  function handleResume(id: string) {
    onViewSession(id);
  }

  if (sessionsLoading) {
    return (
      <div className="space-y-8">
        {[1, 2, 3].map((n) => (
          <section key={n}>
            <div className="mb-3 flex animate-pulse items-center gap-2">
              <span className="inline-block h-2 w-2 rounded-full bg-gray-200 dark:bg-gray-700" />
              <div className="h-3 w-24 rounded bg-gray-200 dark:bg-gray-700" />
            </div>
            <div className="grid gap-3">
              {[1, 2].map((m) => (
                <div
                  key={m}
                  className="flex animate-pulse overflow-hidden rounded-lg border border-gray-200 bg-gray-50 dark:border-gray-800 dark:bg-gray-900"
                >
                  <div className="w-1 flex-none bg-gray-200 dark:bg-gray-700" />
                  <div className="flex flex-1 flex-col gap-2 px-4 py-3">
                    <div className="h-3 w-48 rounded bg-gray-200 dark:bg-gray-700" />
                    <div className="h-2.5 w-32 rounded bg-gray-100 dark:bg-gray-800" />
                  </div>
                </div>
              ))}
            </div>
          </section>
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <Zone
        title="Needs Input"
        count={waiting.length}
        accentColor="red"
        empty="No sessions waiting for input."
      >
        {waiting.map((s) => (
          <SessionCard key={s.id} session={s} onView={onViewSession} onReply={handleReply} />
        ))}
      </Zone>

      <Zone title="Running" count={running.length} accentColor="green" empty="No sessions running.">
        {running.map((s) => (
          <SessionCard
            key={s.id}
            session={s}
            onView={onViewSession}
            onInterrupt={handleInterrupt}
          />
        ))}
      </Zone>

      <Zone title="Paused" count={paused.length} accentColor="gray" empty="No paused sessions.">
        {paused.map((s) => (
          <SessionCard key={s.id} session={s} onView={onViewSession} onResume={handleResume} />
        ))}
      </Zone>

      <Zone title="Idle / Done" count={idle.length} accentColor="gray" empty="No idle sessions.">
        {idle.map((s) => (
          <SessionCard key={s.id} session={s} onView={onViewSession} onResume={handleResume} />
        ))}
      </Zone>

      {sessions.length === 0 && (
        <div className="flex flex-col items-center justify-center py-24 text-center">
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
      )}
    </div>
  );
}

function Zone({
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

  return (
    <section>
      <h2 className="mb-3 flex items-center gap-2 text-sm font-medium uppercase tracking-wide text-gray-500 dark:text-gray-400">
        <span className={`inline-block h-2 w-2 rounded-full ${dotColors[accentColor]}`} />
        {title}
        <span className="text-gray-400 dark:text-gray-600">({count})</span>
      </h2>
      {count === 0 ? (
        <p className="text-sm text-gray-400 dark:text-gray-600">{empty}</p>
      ) : (
        <div className="grid gap-3">{children}</div>
      )}
    </section>
  );
}
