import type { Session } from "../lib/types";
import { timeAgo } from "../lib/utils";

const STATUS_ACCENT: Record<string, string> = {
  waiting: "bg-red-500",
  running: "bg-green-500",
  idle: "bg-gray-500",
  done: "bg-gray-600",
  completed: "bg-green-600",
  failed: "bg-red-600",
  paused: "bg-gray-400",
  stuck: "bg-orange-500",
};

const STATUS_PILL: Record<string, string> = {
  waiting: "bg-red-500/20 text-red-600 ring-1 ring-red-500/30 dark:text-red-400",
  running: "bg-green-500/20 text-green-600 ring-1 ring-green-500/30 dark:text-green-400",
  idle: "bg-gray-500/20 text-gray-500 ring-1 ring-gray-500/30 dark:text-gray-400",
  done: "bg-gray-200/60 text-gray-500 ring-1 ring-gray-300/30 dark:bg-gray-700/40 dark:text-gray-500 dark:ring-gray-600/30",
  completed:
    "bg-green-200/60 text-green-600 ring-1 ring-green-300/30 dark:bg-green-900/30 dark:text-green-400 dark:ring-green-700/30",
  failed:
    "bg-red-200/60 text-red-600 ring-1 ring-red-300/30 dark:bg-red-900/30 dark:text-red-400 dark:ring-red-700/30",
  paused: "bg-gray-400/20 text-gray-500 ring-1 ring-gray-400/30 dark:text-gray-400",
  stuck: "bg-orange-500/20 text-orange-600 ring-1 ring-orange-500/30 dark:text-orange-400",
};

const BLOCK_TYPE_PILL: Record<string, string> = {
  decision: "bg-orange-500/20 text-orange-600 ring-1 ring-orange-500/30 dark:text-orange-400",
  review: "bg-purple-500/20 text-purple-600 ring-1 ring-purple-500/30 dark:text-purple-400",
  confirm: "bg-yellow-500/20 text-yellow-600 ring-1 ring-yellow-500/30 dark:text-yellow-400",
};

interface SessionCardProps {
  session: Session;
  onView: (id: string) => void;
  onReply?: (id: string) => void;
  onInterrupt?: (id: string) => void;
  onResume?: (id: string) => void;
  onKill?: (id: string) => void;
}

export function SessionCard({
  session,
  onView,
  onReply,
  onInterrupt,
  onResume,
  onKill,
}: SessionCardProps) {
  return (
    <div className="flex overflow-hidden rounded-lg border border-gray-200 bg-white transition-colors hover:border-gray-300 dark:border-gray-800 dark:bg-gray-900 dark:hover:border-gray-700">
      {/* Accent bar */}
      <div className={`w-1 flex-none ${STATUS_ACCENT[session.status]}`} />

      {/* Content */}
      <div className="flex min-w-0 flex-1 flex-col gap-2 px-4 py-3">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <span className="truncate font-medium text-gray-900 dark:text-gray-100">
                {session.name}
              </span>
              <span
                className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_PILL[session.status]}`}
              >
                {session.status}
              </span>
              {session.status === "waiting" && session.blockType && (
                <span
                  className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-medium ${BLOCK_TYPE_PILL[session.blockType]}`}
                >
                  {session.blockType}
                </span>
              )}
            </div>
            <p className="mt-0.5 truncate text-xs text-gray-500 dark:text-gray-400">
              {session.repo}
              {session.branch && (
                <span className="ml-1 text-gray-400 dark:text-gray-500">· {session.branch}</span>
              )}
            </p>
          </div>
          <span className="shrink-0 text-xs text-gray-400 dark:text-gray-500">
            {timeAgo(session.stateChangedAt)}
          </span>
        </div>

        {session.lastMessage && (
          <p className="truncate text-sm text-gray-500 dark:text-gray-400">{session.lastMessage}</p>
        )}

        <div className="flex items-center gap-2">
          {session.status === "waiting" && (
            <button
              onClick={() => onReply?.(session.id)}
              className="rounded-md bg-red-600 px-2.5 py-1 text-xs font-medium text-white hover:bg-red-500"
            >
              Reply
            </button>
          )}
          {session.status === "running" && (
            <button
              onClick={() => onInterrupt?.(session.id)}
              className="rounded-md bg-yellow-600 px-2.5 py-1 text-xs font-medium text-white hover:bg-yellow-500"
            >
              Interrupt
            </button>
          )}
          {session.status === "idle" && (
            <button
              onClick={() => onResume?.(session.id)}
              className="rounded-md bg-blue-600 px-2.5 py-1 text-xs font-medium text-white hover:bg-blue-500"
            >
              Resume
            </button>
          )}
          {session.status === "paused" && (
            <button
              onClick={() => onResume?.(session.id)}
              className="rounded-md bg-blue-600 px-2.5 py-1 text-xs font-medium text-white hover:bg-blue-500"
            >
              Resume
            </button>
          )}
          {session.status === "stuck" && (
            <span className="flex items-center gap-1 text-xs font-medium text-orange-600 dark:text-orange-400">
              <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M12 9v2m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                />
              </svg>
              No output for &gt;20min
            </span>
          )}
          <button
            onClick={() => onView(session.id)}
            className="rounded-md border border-gray-300 px-2.5 py-1 text-xs font-medium text-gray-600 hover:border-gray-400 hover:text-gray-900 dark:border-gray-700 dark:text-gray-300 dark:hover:border-gray-600 dark:hover:text-gray-100"
          >
            View
          </button>
          {onKill && (
            <button
              onClick={() => onKill(session.id)}
              className="rounded-md border border-red-300 px-2.5 py-1 text-xs font-medium text-red-600 hover:border-red-400 hover:bg-red-50 dark:border-red-800 dark:text-red-400 dark:hover:border-red-700 dark:hover:bg-red-950/30"
            >
              Kill
            </button>
          )}

          {(session.linkedIssue ?? session.linkedPR) && (
            <div className="ml-auto flex items-center gap-2 text-xs text-gray-400 dark:text-gray-500">
              {session.linkedIssue && <span>#{session.linkedIssue.number}</span>}
              {session.linkedPR && <span>PR #{session.linkedPR.number}</span>}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
