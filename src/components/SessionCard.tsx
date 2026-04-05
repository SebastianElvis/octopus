import type { Session } from "../lib/types";
import { timeAgo } from "../lib/utils";
import {
  STATUS_ACCENT,
  STATUS_PILL,
  STATUS_DOT,
  BLOCK_TYPE_PILL,
  RUNNING_PULSE,
} from "../lib/statusColors";

interface SessionCardProps {
  session: Session;
  onView: (id: string) => void;
  onInterrupt?: (id: string) => void;
  onResume?: (id: string) => void;
  onKill?: (id: string) => void;
}

export function SessionCard({ session, onView, onInterrupt, onResume, onKill }: SessionCardProps) {
  return (
    <div className="flex overflow-hidden rounded-sm border border-outline bg-surface transition-colors hover:border-outline-strong">
      {/* Accent bar */}
      <div className={`w-1 flex-none ${STATUS_ACCENT[session.status]}`} />

      {/* Content */}
      <div className="flex min-w-0 flex-1 flex-col gap-2 px-4 py-3">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <span className="truncate font-medium text-on-surface">{session.name}</span>
              <span
                className={`flex shrink-0 items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium transition-colors duration-300 ${STATUS_PILL[session.status]}`}
              >
                <span
                  className={`inline-block h-1.5 w-1.5 rounded-full ${STATUS_DOT[session.status] ?? "bg-gray-500"} ${session.status === "running" ? RUNNING_PULSE : ""}`}
                />
                {session.status}
              </span>
              {session.status === "attention" && session.blockType && (
                <span
                  className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-medium ${BLOCK_TYPE_PILL[session.blockType]}`}
                >
                  {session.blockType}
                </span>
              )}
            </div>
            <p className="mt-0.5 truncate text-xs text-on-surface-muted">
              {session.repo}
              {session.branch && (
                <span className="ml-1 text-on-surface-faint">· {session.branch}</span>
              )}
            </p>
          </div>
          <span className="shrink-0 text-xs text-on-surface-faint">
            {timeAgo(session.stateChangedAt)}
          </span>
        </div>

        {session.lastMessage && (
          <p className="truncate text-sm text-on-surface-muted">{session.lastMessage}</p>
        )}

        <div className="flex items-center gap-2">
          {session.status === "running" && (
            <button
              onClick={() => onInterrupt?.(session.id)}
              className="cursor-pointer rounded-sm bg-yellow-600 px-2.5 py-1 text-xs font-medium text-white hover:bg-yellow-500 active:bg-yellow-700 focus:outline-none focus:ring-2 focus:ring-yellow-500 focus:ring-offset-1"
            >
              Interrupt
            </button>
          )}
          {session.status === "attention" && (
            <button
              onClick={() => onResume?.(session.id)}
              className="cursor-pointer rounded-sm bg-brand px-2.5 py-1 text-xs font-medium text-white hover:bg-brand active:bg-brand focus:outline-none focus:ring-2 focus:ring-brand focus:ring-offset-1"
            >
              Resume
            </button>
          )}
          <button
            onClick={() => onView(session.id)}
            className="cursor-pointer rounded-sm border border-outline px-2.5 py-1 text-xs font-medium text-on-surface-muted hover:border-outline-strong hover:text-on-surface active:bg-hover focus:outline-none focus:ring-2 focus:ring-brand focus:ring-offset-1"
          >
            View
          </button>
          {onKill && (
            <button
              onClick={() => onKill(session.id)}
              className="cursor-pointer rounded-sm border border-danger/30 px-2.5 py-1 text-xs font-medium text-danger hover:border-danger hover:bg-danger-muted active:bg-danger-muted focus:outline-none focus:ring-2 focus:ring-danger focus:ring-offset-1"
            >
              Kill
            </button>
          )}

          {(session.linkedIssue ?? session.linkedPR) && (
            <div className="ml-auto flex items-center gap-2 text-xs text-on-surface-faint">
              {session.linkedIssue && <span>#{session.linkedIssue.number}</span>}
              {session.linkedPR && <span>PR #{session.linkedPR.number}</span>}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
