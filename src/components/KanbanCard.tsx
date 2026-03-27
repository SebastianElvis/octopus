import { useState } from "react";
import type { Session } from "../lib/types";
import { timeAgo } from "../lib/utils";
import {
  STATUS_PILL,
  STATUS_LABEL,
  CLOSED_BORDER,
  BLOCK_TYPE_PILL,
  STATUS_DOT,
  RUNNING_PULSE,
} from "../lib/statusColors";

export type CIStatus = "success" | "failure" | "pending" | null;

interface KanbanCardProps {
  session: Session;
  onView: (id: string) => void;
  onInterrupt?: (id: string) => void;
  onResume?: (id: string) => void;
  onRetry?: (id: string) => void;
  onKill?: (id: string) => void;
  ciStatus?: CIStatus;
  isActive?: boolean;
}

export function KanbanCard({
  session,
  onView,
  onInterrupt,
  onResume,
  onRetry,
  onKill,
  ciStatus,
  isActive,
}: KanbanCardProps) {
  const isClosed = ["completed", "done", "failed", "killed", "idle"].includes(session.status);
  const closedBorder = isClosed ? `border-l-2 ${CLOSED_BORDER[session.status] ?? ""}` : "";
  const isStuck = session.status === "stuck";
  const [showKillConfirm, setShowKillConfirm] = useState(false);

  const ciDotColor =
    ciStatus === "success"
      ? "bg-green-500"
      : ciStatus === "failure"
        ? "bg-red-500"
        : ciStatus === "pending"
          ? "bg-yellow-500"
          : null;

  // Extract short repo name (last segment)
  const repoShort = session.repo.split("/").pop() ?? session.repo;

  return (
    <div
      data-testid={`session-card-${session.id}`}
      onClick={() => onView(session.id)}
      className={`cursor-pointer rounded-md border bg-white px-3 py-2.5 pl-7 shadow-sm transition-all hover:shadow-md dark:bg-gray-950 ${closedBorder} ${isClosed ? "opacity-75" : ""} ${
        isStuck
          ? "border-orange-300 ring-1 ring-orange-200 dark:border-orange-700 dark:ring-orange-900/30"
          : isActive
            ? "border-blue-400 ring-1 ring-blue-400/50 dark:border-blue-600 dark:ring-blue-600/40"
            : "border-gray-200 hover:border-gray-300 dark:border-gray-800 dark:hover:border-gray-700"
      }`}
    >
      {/* Title */}
      <span className="line-clamp-2 text-sm font-semibold leading-snug text-gray-900 dark:text-gray-100">
        {session.name}
      </span>

      {/* Metadata line: repo, branch, issue, time */}
      <div className="mt-1 flex items-center gap-1 text-xs text-gray-500 dark:text-gray-400">
        <span className="truncate">{repoShort}</span>
        {session.branch && (
          <>
            <span className="text-gray-300 dark:text-gray-600">&middot;</span>
            <span className="truncate font-mono text-[11px] text-gray-400 dark:text-gray-500">
              {session.branch}
            </span>
          </>
        )}
        {(session.linkedIssue ?? session.linkedPR) && (
          <>
            <span className="text-gray-300 dark:text-gray-600">&middot;</span>
            <span className="text-[11px] text-gray-400 dark:text-gray-500">
              {session.linkedIssue
                ? `#${String(session.linkedIssue.number)}`
                : session.linkedPR
                  ? `PR #${String(session.linkedPR.number)}`
                  : ""}
            </span>
          </>
        )}
        {/* CI indicator dot */}
        {ciDotColor && (
          <span className={`ml-0.5 h-2 w-2 shrink-0 rounded-full ${ciDotColor}`} title={`CI: ${ciStatus}`} />
        )}
      </div>

      {/* Last active */}
      <p className="mt-1 text-[11px] text-gray-400 dark:text-gray-500">
        Active {timeAgo(session.stateChangedAt)}
      </p>

      {/* Inline blocking prompt for waiting sessions */}
      {session.status === "waiting" && session.lastMessage && (
        <div className="mt-2 rounded border border-amber-200 bg-amber-50 px-2 py-1.5 dark:border-amber-800/50 dark:bg-amber-950/20">
          <p className="line-clamp-2 text-[11px] leading-relaxed text-amber-800 dark:text-amber-300">
            {session.lastMessage}
          </p>
        </div>
      )}

      {/* Pills row */}
      <div className="mt-2 flex flex-wrap items-center gap-1.5">
        <span
          className={`flex items-center gap-1 rounded-full px-1.5 py-0.5 text-[11px] font-medium transition-colors duration-300 ${STATUS_PILL[session.status]}`}
        >
          <span
            className={`inline-block h-1.5 w-1.5 rounded-full ${STATUS_DOT[session.status] ?? "bg-gray-500"} ${session.status === "running" ? RUNNING_PULSE : ""}`}
          />
          {STATUS_LABEL[session.status] ?? session.status}
        </span>
        {session.status === "waiting" && session.blockType && (
          <span
            className={`rounded-full px-1.5 py-0.5 text-[11px] font-medium ${BLOCK_TYPE_PILL[session.blockType]}`}
          >
            {session.blockType}
          </span>
        )}
        {isStuck && (
          <span className="flex items-center gap-0.5 rounded-full bg-orange-100 px-1.5 py-0.5 text-[11px] font-medium text-orange-700 dark:bg-orange-900/30 dark:text-orange-400">
            <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M12 9v2m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
              />
            </svg>
            stuck 20+ min
          </span>
        )}
      </div>

      {/* Action buttons */}
      <div className="mt-2 flex items-center gap-1.5" onClick={(e) => e.stopPropagation()}>
        {/* View is always first */}
        <button
          onClick={() => onView(session.id)}
          className="cursor-pointer rounded border border-gray-300 px-2 py-1 text-[11px] font-medium text-gray-500 hover:border-gray-400 hover:text-gray-700 active:bg-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-1 dark:border-gray-700 dark:text-gray-400 dark:hover:border-gray-600 dark:hover:text-gray-200 dark:active:bg-gray-800"
        >
          View
        </button>
        {session.status === "running" && (
          <button
            onClick={() => onInterrupt?.(session.id)}
            className="cursor-pointer rounded bg-yellow-600 px-2 py-1 text-[11px] font-medium text-white hover:bg-yellow-500 active:bg-yellow-700 focus:outline-none focus:ring-2 focus:ring-yellow-500 focus:ring-offset-1"
          >
            Interrupt
          </button>
        )}
        {/* For "Needs Attention" sessions, make Resume more prominent */}
        {(session.status === "idle" ||
          session.status === "paused" ||
          session.status === "interrupted") &&
          onResume && (
            <button
              onClick={() => onResume(session.id)}
              className="cursor-pointer rounded bg-blue-600 px-3 py-1 text-[11px] font-medium text-white hover:bg-blue-500 active:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-1"
            >
              Resume
            </button>
          )}
        {(session.status === "failed" || session.status === "stuck") && onRetry && (
          <button
            onClick={() => onRetry(session.id)}
            className="cursor-pointer rounded bg-blue-600 px-3 py-1 text-[11px] font-medium text-white hover:bg-blue-500 active:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-1"
          >
            Retry
          </button>
        )}
        {/* Kill with confirmation — always last */}
        {(session.status === "running" ||
          session.status === "waiting" ||
          session.status === "stuck") &&
          onKill &&
          !showKillConfirm && (
            <button
              onClick={() => setShowKillConfirm(true)}
              className="cursor-pointer rounded border border-red-300 px-2 py-1 text-[11px] font-medium text-red-600 hover:bg-red-50 active:bg-red-100 focus:outline-none focus:ring-2 focus:ring-red-500 focus:ring-offset-1 dark:border-red-800 dark:text-red-400 dark:hover:bg-red-950/30 dark:active:bg-red-950/50"
            >
              Kill
            </button>
          )}
        {showKillConfirm && onKill && (
          <>
            <span className="text-[11px] text-red-600 dark:text-red-400">
              Kill &quot;{session.name}&quot;?
            </span>
            <button
              onClick={() => setShowKillConfirm(false)}
              className="cursor-pointer rounded px-1.5 py-0.5 text-[11px] text-gray-500 hover:bg-gray-100 active:bg-gray-200 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-1 dark:hover:bg-gray-800 dark:active:bg-gray-700"
            >
              No
            </button>
            <button
              onClick={() => {
                setShowKillConfirm(false);
                onKill(session.id);
              }}
              className="cursor-pointer rounded bg-red-600 px-2 py-1 text-[11px] font-medium text-white hover:bg-red-500 active:bg-red-700 focus:outline-none focus:ring-2 focus:ring-red-500 focus:ring-offset-1"
            >
              Yes
            </button>
          </>
        )}
      </div>
    </div>
  );
}
