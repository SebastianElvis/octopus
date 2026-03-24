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
  const [showKillConfirm, setShowKillConfirm] = useState(false);

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
      className={`cursor-pointer rounded-md border bg-white px-3 py-2.5 pl-7 transition-all hover:shadow-sm dark:bg-gray-950 ${closedBorder} ${isClosed ? "opacity-75" : ""} ${isActive ? "border-blue-400 ring-1 ring-blue-400/50 dark:border-blue-600 dark:ring-blue-600/40" : "border-gray-200 hover:border-gray-300 dark:border-gray-800 dark:hover:border-gray-700"}`}
    >
      {/* Title + time */}
      <div className="flex items-start justify-between gap-2">
        <span className="line-clamp-2 text-sm font-medium leading-snug text-gray-900 dark:text-gray-100">
          {session.name}
        </span>
        <div className="flex shrink-0 items-center gap-1.5">
          {/* CI indicator dot */}
          {ciDotColor && (
            <span className={`h-2 w-2 rounded-full ${ciDotColor}`} title={`CI: ${ciStatus}`} />
          )}
          <span className="text-[11px] text-gray-400 dark:text-gray-500">
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
        {session.status === "stuck" && (
          <span className="flex items-center gap-0.5 text-[11px] font-medium text-orange-600 dark:text-orange-400">
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
          <div className="ml-auto flex items-center gap-1 text-[11px] text-gray-400 dark:text-gray-500">
            {session.linkedIssue && <span>#{session.linkedIssue.number}</span>}
            {session.linkedPR && <span>PR #{session.linkedPR.number}</span>}
          </div>
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
        {(session.status === "idle" ||
          session.status === "paused" ||
          session.status === "interrupted") &&
          onResume && (
            <button
              onClick={() => onResume(session.id)}
              className="cursor-pointer rounded bg-blue-600 px-2 py-1 text-[11px] font-medium text-white hover:bg-blue-500 active:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-1"
            >
              Resume
            </button>
          )}
        {(session.status === "failed" || session.status === "stuck") && onRetry && (
          <button
            onClick={() => onRetry(session.id)}
            className="cursor-pointer rounded bg-blue-600 px-2 py-1 text-[11px] font-medium text-white hover:bg-blue-500 active:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-1"
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
