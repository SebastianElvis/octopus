import { useState } from "react";
import type { Session, Repo } from "../lib/types";
import { STATUS_DOT } from "../lib/statusColors";
import { archiveSession } from "../lib/tauri";
import { useSessionStore } from "../stores/sessionStore";

/** Sidebar status dots use the centralized STATUS_DOT from statusColors.ts,
 *  with running animation appended. */
const SIDEBAR_DOT: Record<string, string> = {
  ...Object.fromEntries(Object.entries(STATUS_DOT).map(([k, v]) => [k, v])),
  running: `${STATUS_DOT.running} animate-pulse`,
};

/** Subtle row background tint to indicate status at a glance. */
const STATUS_ROW_TINT: Record<string, string> = {
  attention: "bg-amber-50/50 dark:bg-amber-950/10",
  running: "",
};

/** Status label for accessibility (shown alongside the dot). */
const STATUS_ICON_LABEL: Record<string, string> = {
  attention: "Needs Attention",
  running: "Running",
  done: "Done",
};

interface SidebarTreeProps {
  repos: Repo[];
  sessions: Session[];
  activeSessionId: string | null;
  onSelectSession: (id: string) => void;
  onNewSession: (repo?: Repo) => void;
  onViewRepoTasks: (repoId: string) => void;
  onAddRepo: () => void;
  onRemoveRepo: (repoId: string) => void;
  issueCountsByRepo: Record<string, number>;
  activeView: string;
  tasksRepoId: string | null;
}

export function SidebarTree({
  repos,
  sessions,
  activeSessionId,
  onSelectSession,
  onNewSession,
  onViewRepoTasks,
  onAddRepo,
  onRemoveRepo,
  issueCountsByRepo,
  activeView,
  tasksRepoId,
}: SidebarTreeProps) {
  // Track which repos user has manually collapsed
  const [collapsedRepos, setCollapsedRepos] = useState<Set<string>>(new Set());
  const expandedRepos = new Set(repos.map((r) => r.id));
  for (const id of collapsedRepos) {
    expandedRepos.delete(id);
  }

  function toggleRepo(repoId: string) {
    setCollapsedRepos((prev) => {
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
        const issueCount = issueCountsByRepo[repo.id] ?? 0;
        const isTasksActive = activeView === "tasks" && tasksRepoId === repo.id;

        return (
          <div key={repo.id}>
            {/* Repo header */}
            <div className="group flex items-center">
              <button
                onClick={() => toggleRepo(repo.id)}
                className="flex min-w-0 flex-1 items-center gap-1.5 rounded-l px-2 py-1.5 text-left text-xs font-medium text-gray-600 hover:bg-gray-100 dark:text-gray-400 dark:hover:bg-gray-800/50"
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
              </button>
              {/* Remove repo button (visible on hover) */}
              <button
                onClick={() => onRemoveRepo(repo.id)}
                title="Remove repo"
                className="mr-1 shrink-0 rounded p-1 text-gray-400 opacity-0 transition-opacity hover:bg-gray-100 hover:text-gray-600 group-hover:opacity-100 dark:text-gray-500 dark:hover:bg-gray-800/50 dark:hover:text-gray-300"
              >
                <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            {/* Expanded repo content */}
            {isExpanded && (
              <div className="ml-3 flex flex-col gap-0.5 border-l border-gray-200 pl-2 dark:border-gray-800">
                {/* Issues & PRs row */}
                <button
                  data-testid={`repo-tasks-${repo.id}`}
                  onClick={() => onViewRepoTasks(repo.id)}
                  className={`flex w-full items-center justify-between rounded px-2 py-1.5 text-left text-xs transition-colors ${
                    isTasksActive
                      ? "bg-blue-50 font-medium text-blue-700 dark:bg-blue-950/40 dark:text-blue-300"
                      : "text-gray-500 hover:bg-gray-100 hover:text-gray-700 dark:text-gray-400 dark:hover:bg-gray-800/50 dark:hover:text-gray-200"
                  }`}
                >
                  <span className="flex items-center gap-1.5">
                    <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <circle cx="12" cy="12" r="10" />
                      <path strokeLinecap="round" d="M12 8v4M12 16h.01" />
                    </svg>
                    Issues & PRs
                  </span>
                  {issueCount > 0 && (
                    <span className={`rounded-full px-1.5 py-0.5 text-[10px] font-semibold ${
                      isTasksActive
                        ? "bg-blue-100 text-blue-700 dark:bg-blue-900/50 dark:text-blue-300"
                        : "bg-gray-100 text-gray-500 dark:bg-gray-800 dark:text-gray-400"
                    }`}>
                      {issueCount}
                    </span>
                  )}
                </button>

                {/* Active sessions (attention + running) */}
                {repoSessions
                  .filter((s) => s.status !== "done")
                  .map((s) => (
                    <SessionNode
                      key={s.id}
                      session={s}
                      isActive={s.id === activeSessionId}
                      onClick={() => onSelectSession(s.id)}
                    />
                  ))}

                {/* Done sessions (collapsed) */}
                <DoneGroup
                  sessions={repoSessions.filter((s) => s.status === "done")}
                  activeSessionId={activeSessionId}
                  onSelectSession={onSelectSession}
                />

                {/* Per-repo + New Session */}
                <button
                  onClick={() => onNewSession(repo)}
                  className="mt-0.5 rounded px-2 py-1 text-left text-xs text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-600 dark:text-gray-500 dark:hover:bg-gray-800/50 dark:hover:text-gray-300"
                >
                  + New Session
                </button>
              </div>
            )}
          </div>
        );
      })}

      {unlinked.length > 0 && (
        <div>
          <div className="px-2 py-1 text-xs text-gray-400 dark:text-gray-500">Other</div>
          <div className="ml-3 flex flex-col gap-0.5 border-l border-gray-200 pl-2 dark:border-gray-800">
            {unlinked.map((s) => (
              <SessionNode
                key={s.id}
                session={s}
                isActive={s.id === activeSessionId}
                onClick={() => onSelectSession(s.id)}
              />
            ))}
          </div>
        </div>
      )}

      {sessions.length === 0 && repos.length === 0 && (
        <p className="px-2 py-2 text-xs text-gray-400 dark:text-gray-500">No repos yet.</p>
      )}

      {/* + Add Repo */}
      <button
        data-testid="add-repo-button"
        onClick={onAddRepo}
        className="mx-2 mt-2 rounded-md border border-dashed border-gray-300 px-2 py-1.5 text-center text-xs font-medium text-gray-500 hover:border-blue-400 hover:bg-blue-50 hover:text-blue-600 dark:border-gray-700 dark:text-gray-500 dark:hover:border-blue-600 dark:hover:bg-blue-950/30 dark:hover:text-blue-400"
      >
        + Add Repo
      </button>
    </div>
  );
}

function DoneGroup({
  sessions,
  activeSessionId,
  onSelectSession,
}: {
  sessions: Session[];
  activeSessionId: string | null;
  onSelectSession: (id: string) => void;
}) {
  const [expanded, setExpanded] = useState(false);

  if (sessions.length === 0) return null;

  return (
    <div>
      <button
        onClick={() => setExpanded((v) => !v)}
        className="flex w-full items-center gap-1.5 rounded px-2 py-1 text-left text-[11px] text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-600 dark:text-gray-500 dark:hover:bg-gray-800/50 dark:hover:text-gray-300"
      >
        <svg
          className={`h-2.5 w-2.5 shrink-0 text-gray-400 transition-transform dark:text-gray-500 ${expanded ? "rotate-90" : ""}`}
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={2}
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
        </svg>
        <span>Done</span>
        <span className="rounded-full bg-green-100 px-1.5 py-0.5 text-[10px] font-medium text-green-600 dark:bg-green-900/30 dark:text-green-400">
          {sessions.length}
        </span>
      </button>
      {expanded &&
        sessions.map((s) => (
          <SessionNode
            key={s.id}
            session={s}
            isActive={s.id === activeSessionId}
            onClick={() => onSelectSession(s.id)}
          />
        ))}
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
  const removeSession = useSessionStore((s) => s.removeSession);

  async function handleArchive(e: React.MouseEvent) {
    e.stopPropagation();
    try {
      await archiveSession(session.id);
      removeSession(session.id);
    } catch (err) {
      console.error("Failed to archive session:", err);
    }
  }

  return (
    <div className="group/session relative">
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
      {/* Archive button (visible on hover) */}
      <button
        onClick={(e) => { void handleArchive(e); }}
        title="Archive"
        className="absolute right-1 top-1/2 -translate-y-1/2 rounded p-1 text-gray-400 opacity-0 transition-opacity hover:bg-gray-200 hover:text-gray-600 group-hover/session:opacity-100 dark:text-gray-500 dark:hover:bg-gray-700 dark:hover:text-gray-300"
      >
        <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M20 7l-2-3H6L4 7m16 0v12a1 1 0 01-1 1H5a1 1 0 01-1-1V7m16 0H4m4 4h8" />
        </svg>
      </button>
    </div>
  );
}
