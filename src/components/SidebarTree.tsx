import { useState } from "react";
import type { Session, Repo } from "../lib/types";
import { STATUS_DOT } from "../lib/statusColors";

/** Sidebar status dots use the centralized STATUS_DOT from statusColors.ts,
 *  with running animation appended. */
const SIDEBAR_DOT: Record<string, string> = {
  ...Object.fromEntries(Object.entries(STATUS_DOT).map(([k, v]) => [k, v])),
  running: `${STATUS_DOT.running} animate-pulse`,
};

/** Subtle row background tint to indicate status at a glance. */
const STATUS_ROW_TINT: Record<string, string> = {
  waiting: "bg-amber-50/50 dark:bg-amber-950/10",
  stuck: "bg-orange-50/50 dark:bg-orange-950/10",
  running: "",
  failed: "bg-red-50/30 dark:bg-red-950/10",
};

/** Status label for accessibility (shown alongside the dot). */
const STATUS_ICON_LABEL: Record<string, string> = {
  waiting: "Waiting",
  stuck: "Stuck",
  running: "Running",
  completed: "Done",
  failed: "Failed",
  killed: "Killed",
  paused: "Paused",
  interrupted: "Interrupted",
  idle: "Idle",
  done: "Done",
};

interface SidebarTreeProps {
  repos: Repo[];
  sessions: Session[];
  activeSessionId: string | null;
  onSelectSession: (id: string) => void;
  onNewSession: () => void;
}

export function SidebarTree({
  repos,
  sessions,
  activeSessionId,
  onSelectSession,
  onNewSession,
}: SidebarTreeProps) {
  const [expandedRepos, setExpandedRepos] = useState<Set<string>>(new Set(repos.map((r) => r.id)));

  function toggleRepo(repoId: string) {
    setExpandedRepos((prev) => {
      const next = new Set(prev);
      if (next.has(repoId)) next.delete(repoId);
      else next.add(repoId);
      return next;
    });
  }

  // Group sessions by repoId
  const sessionsByRepo = new Map<string, Session[]>();
  for (const s of sessions) {
    const key = s.repoId || "__unlinked__";
    const existing = sessionsByRepo.get(key);
    if (existing) {
      existing.push(s);
    } else {
      sessionsByRepo.set(key, [s]);
    }
  }

  // Unlinked sessions (no repo)
  const unlinked = sessionsByRepo.get("__unlinked__") ?? [];

  return (
    <div className="flex flex-col gap-0.5">
      {repos.map((repo) => {
        const repoSessions = sessionsByRepo.get(repo.id) ?? [];
        const isExpanded = expandedRepos.has(repo.id);
        const ghUrl = repo.githubUrl;
        const repoName = ghUrl.split("/").slice(-2).join("/") || ghUrl || "unknown";
        const waitingCount = repoSessions.filter((s) => s.status === "waiting").length;

        return (
          <div key={repo.id}>
            <button
              onClick={() => toggleRepo(repo.id)}
              className="flex w-full items-center gap-1.5 rounded px-2 py-1 text-left text-xs font-medium text-gray-600 hover:bg-gray-100 dark:text-gray-400 dark:hover:bg-gray-800/50"
            >
              <svg
                className={`h-3 w-3 shrink-0 text-gray-400 transition-transform dark:text-gray-500 ${isExpanded ? "rotate-90" : ""}`}
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={2}
              >
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
              </svg>
              <span className="truncate">{repoName}</span>
              {repoSessions.length > 0 && (
                <span className="ml-auto text-gray-400 dark:text-gray-500">
                  {repoSessions.length}
                </span>
              )}
              {waitingCount > 0 && (
                <span className="rounded-full bg-red-500 px-1.5 py-0.5 text-xs font-bold text-white">
                  {waitingCount}
                </span>
              )}
            </button>

            {isExpanded && repoSessions.length > 0 && (
              <div className="ml-3 flex flex-col gap-0.5 border-l border-gray-200 pl-2 dark:border-gray-800">
                {repoSessions.map((s) => (
                  <SessionNode
                    key={s.id}
                    session={s}
                    isActive={s.id === activeSessionId}
                    onClick={() => onSelectSession(s.id)}
                  />
                ))}
              </div>
            )}
          </div>
        );
      })}

      {unlinked.length > 0 && (
        <div>
          <div className="px-2 py-1 text-xs text-gray-400 dark:text-gray-500">Other</div>
          {unlinked.map((s) => (
            <SessionNode
              key={s.id}
              session={s}
              isActive={s.id === activeSessionId}
              onClick={() => onSelectSession(s.id)}
            />
          ))}
        </div>
      )}

      {sessions.length === 0 && (
        <p className="px-2 py-2 text-xs text-gray-400 dark:text-gray-500">No sessions yet.</p>
      )}

      <button
        onClick={onNewSession}
        className="mx-2 mt-2 rounded-md border border-dashed border-gray-300 px-2 py-1.5 text-center text-xs font-medium text-gray-500 hover:border-blue-400 hover:bg-blue-50 hover:text-blue-600 dark:border-gray-700 dark:text-gray-500 dark:hover:border-blue-600 dark:hover:bg-blue-950/30 dark:hover:text-blue-400"
      >
        + New Session
      </button>
    </div>
  );
}

function SessionNode({
  session,
  isActive,
  onClick,
}: {
  session: Session;
  isActive: boolean;
  onClick: () => void;
}) {
  const statusTint = STATUS_ROW_TINT[session.status] ?? "";
  const statusLabel = STATUS_ICON_LABEL[session.status] ?? session.status;

  return (
    <button
      onClick={onClick}
      title={statusLabel}
      className={`flex w-full flex-col gap-0.5 rounded px-2 py-1.5 text-left transition-colors ${statusTint} ${
        isActive
          ? "bg-blue-50 text-blue-700 dark:bg-blue-950/40 dark:text-blue-300"
          : "text-gray-600 hover:bg-gray-100 dark:text-gray-400 dark:hover:bg-gray-800/50"
      }`}
    >
      {/* First line: status dot + session name */}
      <div className="flex items-center gap-2">
        <span
          className={`h-2 w-2 shrink-0 rounded-full ${SIDEBAR_DOT[session.status] ?? "bg-gray-400"}`}
          aria-label={statusLabel}
        />
        <span className="line-clamp-2 text-xs leading-snug">{session.name}</span>
      </div>
      {/* Second line: branch name below */}
      {session.branch && (
        <span className="ml-4 truncate font-mono text-[10px] text-gray-400 dark:text-gray-500">
          {session.branch}
        </span>
      )}
    </button>
  );
}
