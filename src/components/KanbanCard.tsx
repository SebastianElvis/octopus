import { useState } from "react";
import type { Session } from "../lib/types";
import { timeAgo } from "../lib/utils";
import { replyToSession } from "../lib/tauri";
import { formatError } from "../lib/errors";

const STATUS_PILL: Record<string, string> = {
  waiting: "bg-red-500/20 text-red-600 ring-1 ring-red-500/30 dark:text-red-400",
  running: "bg-green-500/20 text-green-600 ring-1 ring-green-500/30 dark:text-green-400",
  idle: "bg-gray-500/20 text-gray-500 ring-1 ring-gray-500/30 dark:text-gray-400",
  done: "bg-purple-500/20 text-purple-600 ring-1 ring-purple-500/30 dark:text-purple-400",
  completed: "bg-purple-500/20 text-purple-600 ring-1 ring-purple-500/30 dark:text-purple-400",
  failed: "bg-red-500/20 text-red-600 ring-1 ring-red-500/30 dark:text-red-400",
  killed: "bg-gray-500/20 text-gray-500 ring-1 ring-gray-500/30 dark:text-gray-400",
  paused: "bg-yellow-500/20 text-yellow-600 ring-1 ring-yellow-500/30 dark:text-yellow-400",
  stuck: "bg-orange-500/20 text-orange-600 ring-1 ring-orange-500/30 dark:text-orange-400",
  interrupted: "bg-amber-500/20 text-amber-600 ring-1 ring-amber-500/30 dark:text-amber-400",
};

// Human-friendly labels for statuses
const STATUS_LABEL: Record<string, string> = {
  completed: "completed",
  done: "closed",
  failed: "failed",
  killed: "killed",
  idle: "idle",
  waiting: "waiting",
  running: "running",
  paused: "paused",
  stuck: "stuck",
  interrupted: "interrupted",
};

// GitHub-style left border color for closed sessions
const CLOSED_BORDER: Record<string, string> = {
  completed: "border-l-purple-500",
  done: "border-l-purple-500",
  failed: "border-l-red-500",
  killed: "border-l-gray-400",
  idle: "border-l-gray-400",
  interrupted: "border-l-amber-500",
};

const BLOCK_TYPE_PILL: Record<string, string> = {
  decision: "bg-orange-500/20 text-orange-600 ring-1 ring-orange-500/30 dark:text-orange-400",
  review: "bg-purple-500/20 text-purple-600 ring-1 ring-purple-500/30 dark:text-purple-400",
  confirm: "bg-yellow-500/20 text-yellow-600 ring-1 ring-yellow-500/30 dark:text-yellow-400",
};

export type CIStatus = "success" | "failure" | "pending" | null;

interface KanbanCardProps {
  session: Session;
  onView: (id: string) => void;
  onReply?: (id: string) => void;
  onInterrupt?: (id: string) => void;
  onResume?: (id: string) => void;
  onRetry?: (id: string) => void;
  onKill?: (id: string) => void;
  ciStatus?: CIStatus;
}

export function KanbanCard({
  session,
  onView,
  onReply,
  onInterrupt,
  onResume,
  onRetry,
  onKill,
  ciStatus,
}: KanbanCardProps) {
  const isClosed = ["completed", "done", "failed", "killed", "idle"].includes(session.status);
  const closedBorder = isClosed ? `border-l-2 ${CLOSED_BORDER[session.status] ?? ""}` : "";
  const [quickReply, setQuickReply] = useState("");
  const [showQuickReply, setShowQuickReply] = useState(false);
  const [sending, setSending] = useState(false);
  const [replyError, setReplyError] = useState<string | null>(null);
  const [showKillConfirm, setShowKillConfirm] = useState(false);

  async function handleQuickReply(e: React.SyntheticEvent) {
    e.preventDefault();
    e.stopPropagation();
    if (!quickReply.trim() || sending) return;
    setSending(true);
    setReplyError(null);
    try {
      await replyToSession(session.id, quickReply.trim());
      setQuickReply("");
      setShowQuickReply(false);
    } catch (err) {
      setReplyError(formatError(err));
    } finally {
      setSending(false);
    }
  }

  const ciDotColor =
    ciStatus === "success"
      ? "bg-green-500"
      : ciStatus === "failure"
        ? "bg-red-500"
        : ciStatus === "pending"
          ? "bg-yellow-500"
          : null;

  return (
    <div
      onClick={() => onView(session.id)}
      className={`cursor-pointer rounded-md border border-gray-200 bg-white p-3 pl-7 transition-all hover:border-gray-300 hover:shadow-sm dark:border-gray-800 dark:bg-gray-950 dark:hover:border-gray-700 ${closedBorder} ${isClosed ? "opacity-75" : ""}`}
    >
      {/* Title + time */}
      <div className="flex items-start justify-between gap-2">
        <span className="line-clamp-2 text-sm font-medium text-gray-900 dark:text-gray-100">
          {session.name}
        </span>
        <div className="flex shrink-0 items-center gap-1.5">
          {/* CI indicator dot */}
          {ciDotColor && (
            <span className={`h-2 w-2 rounded-full ${ciDotColor}`} title={`CI: ${ciStatus}`} />
          )}
          <span className="text-[10px] text-gray-400 dark:text-gray-500">
            {timeAgo(session.stateChangedAt)}
          </span>
        </div>
      </div>

      {/* Repo + branch */}
      <p className="mt-1 truncate text-xs text-gray-500 dark:text-gray-400">
        {session.repo}
        {session.branch && (
          <span className="ml-1 text-gray-400 dark:text-gray-500">· {session.branch}</span>
        )}
      </p>

      {/* Last message preview */}
      {session.lastMessage && (
        <p className="mt-1.5 line-clamp-2 text-xs text-gray-400 dark:text-gray-500">
          {session.lastMessage}
        </p>
      )}

      {/* Pills row */}
      <div className="mt-2 flex flex-wrap items-center gap-1.5">
        <span
          className={`rounded-full px-1.5 py-0.5 text-[10px] font-medium ${STATUS_PILL[session.status]}`}
        >
          {STATUS_LABEL[session.status] ?? session.status}
        </span>
        {session.status === "waiting" && session.blockType && (
          <span
            className={`rounded-full px-1.5 py-0.5 text-[10px] font-medium ${BLOCK_TYPE_PILL[session.blockType]}`}
          >
            {session.blockType}
          </span>
        )}
        {session.status === "stuck" && (
          <span className="flex items-center gap-0.5 text-[10px] font-medium text-orange-600 dark:text-orange-400">
            <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M12 9v2m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
              />
            </svg>
            stuck
          </span>
        )}
        {(session.linkedIssue ?? session.linkedPR) && (
          <div className="ml-auto flex items-center gap-1 text-[10px] text-gray-400 dark:text-gray-500">
            {session.linkedIssue && <span>#{session.linkedIssue.number}</span>}
            {session.linkedPR && <span>PR #{session.linkedPR.number}</span>}
          </div>
        )}
      </div>

      {/* Action buttons */}
      <div className="mt-2 flex items-center gap-1.5" onClick={(e) => e.stopPropagation()}>
        {session.status === "waiting" && (
          <>
            <button
              onClick={() => setShowQuickReply((v) => !v)}
              className="rounded bg-red-600 px-2 py-0.5 text-[10px] font-medium text-white hover:bg-red-500"
            >
              Quick Reply
            </button>
            <button
              onClick={() => onReply?.(session.id)}
              className="rounded border border-red-300 px-2 py-0.5 text-[10px] font-medium text-red-600 hover:bg-red-50 dark:border-red-800 dark:text-red-400 dark:hover:bg-red-950/30"
            >
              Full View
            </button>
          </>
        )}
        {session.status === "running" && (
          <button
            onClick={() => onInterrupt?.(session.id)}
            className="rounded bg-yellow-600 px-2 py-0.5 text-[10px] font-medium text-white hover:bg-yellow-500"
          >
            Interrupt
          </button>
        )}
        {(session.status === "idle" ||
          session.status === "paused" ||
          session.status === "interrupted") && (
          <button
            onClick={() => onResume?.(session.id)}
            className="rounded bg-blue-600 px-2 py-0.5 text-[10px] font-medium text-white hover:bg-blue-500"
          >
            Resume
          </button>
        )}
        {(session.status === "failed" || session.status === "stuck") && onRetry && (
          <button
            onClick={() => onRetry(session.id)}
            className="rounded bg-blue-600 px-2 py-0.5 text-[10px] font-medium text-white hover:bg-blue-500"
          >
            Retry
          </button>
        )}
        {/* Kill with confirmation */}
        {(session.status === "running" ||
          session.status === "waiting" ||
          session.status === "stuck") &&
          onKill &&
          !showKillConfirm && (
            <button
              onClick={() => setShowKillConfirm(true)}
              className="rounded border border-red-300 px-2 py-0.5 text-[10px] font-medium text-red-600 hover:bg-red-50 dark:border-red-800 dark:text-red-400 dark:hover:bg-red-950/30"
            >
              Kill
            </button>
          )}
        {showKillConfirm && onKill && (
          <>
            <span className="text-[10px] text-red-600 dark:text-red-400">
              Kill &quot;{session.name}&quot;?
            </span>
            <button
              onClick={() => setShowKillConfirm(false)}
              className="rounded px-1.5 py-0.5 text-[10px] text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-800"
            >
              No
            </button>
            <button
              onClick={() => {
                setShowKillConfirm(false);
                onKill(session.id);
              }}
              className="rounded bg-red-600 px-2 py-0.5 text-[10px] font-medium text-white hover:bg-red-500"
            >
              Yes
            </button>
          </>
        )}
        <button
          onClick={() => onView(session.id)}
          className="rounded border border-gray-300 px-2 py-0.5 text-[10px] font-medium text-gray-500 hover:border-gray-400 hover:text-gray-700 dark:border-gray-700 dark:text-gray-400 dark:hover:border-gray-600 dark:hover:text-gray-200"
        >
          View
        </button>
      </div>

      {/* Inline quick reply - textarea for multi-line */}
      {showQuickReply && session.status === "waiting" && (
        <form
          onSubmit={(e) => {
            void handleQuickReply(e);
          }}
          className="mt-2 flex flex-col gap-1"
          onClick={(e) => e.stopPropagation()}
        >
          <textarea
            value={quickReply}
            onChange={(e) => setQuickReply(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
                void handleQuickReply(e);
              }
            }}
            placeholder="Type reply... (Cmd+Enter to send)"
            autoFocus
            rows={3}
            className="w-full resize-none rounded border border-gray-300 bg-white px-2 py-1 text-xs text-gray-900 placeholder-gray-400 outline-none focus:border-blue-500 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-100 dark:placeholder-gray-500"
          />
          {replyError && <p className="text-[10px] text-red-600 dark:text-red-400">{replyError}</p>}
          <button
            type="submit"
            disabled={sending || !quickReply.trim()}
            className="self-end rounded bg-blue-600 px-2 py-1 text-xs font-medium text-white hover:bg-blue-500 disabled:opacity-50"
          >
            {sending ? "..." : "Send"}
          </button>
        </form>
      )}
    </div>
  );
}
