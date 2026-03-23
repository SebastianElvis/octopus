import type { Session } from "../lib/types";
import { timeAgo } from "../lib/utils";

const STATUS_ACCENT: Record<string, string> = {
  waiting: "bg-red-500",
  running: "bg-green-500",
  idle: "bg-gray-500",
  done: "bg-gray-600",
};

const STATUS_PILL: Record<string, string> = {
  waiting: "bg-red-500/20 text-red-600 ring-1 ring-red-500/30 dark:text-red-400",
  running: "bg-green-500/20 text-green-600 ring-1 ring-green-500/30 dark:text-green-400",
  idle: "bg-gray-500/20 text-gray-500 ring-1 ring-gray-500/30 dark:text-gray-400",
  done: "bg-gray-200/60 text-gray-500 ring-1 ring-gray-300/30 dark:bg-gray-700/40 dark:text-gray-500 dark:ring-gray-600/30",
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
}

export function SessionCard({ session, onView, onReply, onInterrupt, onResume }: SessionCardProps) {
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
            <p className="mt-0.5 truncate text-xs text-gray-500 dark:text-gray-500">
              {session.repo}
              {session.branch && (
                <span className="ml-1 text-gray-400 dark:text-gray-600">· {session.branch}</span>
              )}
            </p>
          </div>
          <span className="shrink-0 text-xs text-gray-400 dark:text-gray-600">
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
          <button
            onClick={() => onView(session.id)}
            className="rounded-md border border-gray-300 px-2.5 py-1 text-xs font-medium text-gray-600 hover:border-gray-400 hover:text-gray-900 dark:border-gray-700 dark:text-gray-300 dark:hover:border-gray-600 dark:hover:text-gray-100"
          >
            View
          </button>

          {(session.linkedIssue ?? session.linkedPR) && (
            <div className="ml-auto flex items-center gap-2 text-xs text-gray-400 dark:text-gray-600">
              {session.linkedIssue && <span>#{session.linkedIssue.number}</span>}
              {session.linkedPR && <span>PR #{session.linkedPR.number}</span>}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
