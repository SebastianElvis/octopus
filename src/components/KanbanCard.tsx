import { useState } from "react";
import type { Session } from "../lib/types";
import { timeAgo } from "../lib/utils";
import {
  STATUS_PILL,
  STATUS_LABEL,
  CLOSED_BORDER,
  BLOCK_TYPE_PILL,
  RUNNING_PULSE,
  STATUS_DOT,
} from "../lib/statusColors";

export type CIStatus = "success" | "failure" | "pending" | null;

interface KanbanCardProps {
  session: Session;
  onView: (id: string) => void;
  onInterrupt?: (id: string) => void;
  onResume?: (id: string) => void;
  onKill?: (id: string) => void;
  ciStatus?: CIStatus;
  isActive?: boolean;
  /** Index within column for staggered entrance animation */
  index?: number;
}

export function KanbanCard({
  session,
  onView,
  onInterrupt,
  onResume,
  onKill,
  ciStatus,
  isActive,
  index = 0,
}: KanbanCardProps) {
  const isClosed = session.status === "done";
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
      data-testid={`session-card-${session.id}`}
      onClick={() => onView(session.id)}
      style={{ animationDelay: `${index * 40}ms` }}
      className={`group animate-entrance cursor-pointer rounded-sm border bg-surface px-3 py-2.5 pl-7 transition-all ${closedBorder} ${isClosed ? "opacity-75" : ""} ${
        session.status === "running" ? "animate-pulse-glow" : ""
      } ${
        isActive
          ? "border-brand ring-1 ring-brand/50"
          : "border-outline hover:border-outline-strong"
      }`}
    >
      {/* Title */}
      <span className="line-clamp-2 text-sm font-semibold leading-snug text-on-surface">
        {session.name}
      </span>

      {/* Metadata line: branch, issue, time */}
      <div className="mt-1 flex items-center gap-1 text-xs text-on-surface-muted">
        {session.branch && (
          <span className="truncate font-mono text-[11px] text-on-surface-faint">
            {session.branch}
          </span>
        )}
        {(session.linkedIssue ?? session.linkedPR) && (
          <>
            {session.branch && <span className="text-on-surface-faint">&middot;</span>}
            <span className="text-[11px] text-on-surface-faint">
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
          <span
            className={`ml-0.5 h-2 w-2 shrink-0 rounded-full ${ciDotColor}`}
            title={`CI: ${ciStatus}`}
          />
        )}
      </div>

      {/* Last active */}
      <p className="mt-1 text-[11px] text-on-surface-faint">
        Active {timeAgo(session.stateChangedAt)}
      </p>

      {/* Inline blocking prompt for waiting sessions */}
      {session.status === "attention" && session.lastMessage && (
        <div className="mt-2 rounded border border-status-attention/30 bg-status-attention-muted px-2 py-1.5">
          <p className="line-clamp-2 text-[11px] leading-relaxed text-status-attention">
            {session.lastMessage}
          </p>
        </div>
      )}

      {/* Pills row — status pill without inner dot (pill color is the signal) */}
      <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
        <span
          className={`flex items-center gap-1 rounded-full px-1.5 py-0.5 text-xs font-medium transition-colors duration-300 ${STATUS_PILL[session.status]}`}
        >
          {/* Only show animated dot for running — otherwise pill color is enough */}
          {session.status === "running" && (
            <span
              className={`inline-block h-1.5 w-1.5 rounded-full ${STATUS_DOT[session.status]} ${RUNNING_PULSE}`}
            />
          )}
          {STATUS_LABEL[session.status] ?? session.status}
        </span>
        {session.status === "attention" && session.blockType && (
          <span
            className={`rounded-full px-1.5 py-0.5 text-xs font-medium ${BLOCK_TYPE_PILL[session.blockType]}`}
          >
            {session.blockType}
          </span>
        )}
      </div>

      {/* Action buttons — visible on hover only */}
      <div
        className="mt-2 flex items-center gap-1.5 opacity-0 transition-opacity group-hover:opacity-100"
        onClick={(e) => e.stopPropagation()}
      >
        <button
          onClick={() => onView(session.id)}
          className="cursor-pointer rounded border border-outline px-2 py-1 text-xs font-medium text-on-surface-muted hover:border-outline-strong hover:text-on-surface active:bg-hover focus:outline-none focus:ring-2 focus:ring-brand focus:ring-offset-1"
        >
          View
        </button>
        {session.status === "running" && (
          <button
            onClick={() => onInterrupt?.(session.id)}
            className="cursor-pointer rounded bg-status-attention px-2 py-1 text-xs font-medium text-white hover:bg-accent active:bg-accent focus:outline-none focus:ring-2 focus:ring-accent focus:ring-offset-1"
          >
            Interrupt
          </button>
        )}
        {/* For "Needs Attention" sessions, make Resume more prominent */}
        {session.status === "attention" && onResume && (
          <button
            onClick={() => onResume(session.id)}
            className="cursor-pointer rounded bg-brand px-3 py-1 text-[11px] font-medium text-white hover:bg-brand active:bg-brand focus:outline-none focus:ring-2 focus:ring-brand focus:ring-offset-1"
          >
            Resume
          </button>
        )}
        {/* Kill with confirmation — always last */}
        {session.status === "running" &&
          onKill &&
          !showKillConfirm && (
            <button
              onClick={() => setShowKillConfirm(true)}
              className="cursor-pointer rounded border border-danger/30 px-2 py-1 text-xs font-medium text-danger hover:bg-danger-muted active:bg-danger-muted focus:outline-none focus:ring-2 focus:ring-danger focus:ring-offset-1"
            >
              Kill
            </button>
          )}
        {showKillConfirm && onKill && (
          <>
            <span className="text-xs text-danger">
              Kill &quot;{session.name}&quot;?
            </span>
            <button
              onClick={() => setShowKillConfirm(false)}
              className="cursor-pointer rounded px-1.5 py-0.5 text-xs text-on-surface-muted hover:bg-hover active:bg-active focus:outline-none focus:ring-2 focus:ring-brand focus:ring-offset-1"
            >
              No
            </button>
            <button
              onClick={() => {
                setShowKillConfirm(false);
                onKill(session.id);
              }}
              className="cursor-pointer rounded bg-danger px-2 py-1 text-xs font-medium text-white hover:bg-danger active:bg-danger focus:outline-none focus:ring-2 focus:ring-danger focus:ring-offset-1"
            >
              Yes
            </button>
          </>
        )}
      </div>
    </div>
  );
}
