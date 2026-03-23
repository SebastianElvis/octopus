import { useState } from "react";
import { useSessionStore } from "../stores/sessionStore";
import { useRepoStore } from "../stores/repoStore";
import { SessionCard } from "./SessionCard";
import type { Repo } from "../lib/types";

interface SessionsViewProps {
  onViewSession: (id: string) => void;
  onNewSession: () => void;
  onManageRepos: () => void;
}

function repoDisplayName(repo: Repo): string {
  const ghUrl = repo.githubUrl ?? "";
  return ghUrl.split("/").slice(-2).join("/") || ghUrl || "unknown";
}

export function SessionsView({ onViewSession, onNewSession, onManageRepos }: SessionsViewProps) {
  const sessions = useSessionStore((s) => s.sessions);
  const updateSession = useSessionStore((s) => s.updateSession);
  const repos = useRepoStore((s) => s.repos);
  const [collapsedRepos, setCollapsedRepos] = useState<Set<string>>(new Set());

  // Group sessions by repoId
  const sessionsByRepo = new Map<string, typeof sessions>();
  for (const session of sessions) {
    const key = session.repoId || "__unlinked__";
    if (!sessionsByRepo.has(key)) sessionsByRepo.set(key, []);
    sessionsByRepo.get(key)!.push(session);
  }

  // Build ordered list: repos with sessions first, then repos without sessions
  const repoOrder: Repo[] = [];
  const reposWithSessions = new Set<string>();
  for (const repo of repos) {
    if (sessionsByRepo.has(repo.id)) {
      repoOrder.push(repo);
      reposWithSessions.add(repo.id);
    }
  }
  for (const repo of repos) {
    if (!reposWithSessions.has(repo.id)) {
      repoOrder.push(repo);
    }
  }

  // Unlinked sessions (shouldn't normally happen but be safe)
  const unlinkedSessions = sessionsByRepo.get("__unlinked__") ?? [];

  function toggleRepo(repoId: string) {
    setCollapsedRepos((prev) => {
      const next = new Set(prev);
      if (next.has(repoId)) next.delete(repoId);
      else next.add(repoId);
      return next;
    });
  }

  function handleReply(id: string) {
    onViewSession(id);
  }

  function handleInterrupt(id: string) {
    updateSession(id, { status: "idle", stateChangedAt: Date.now() });
  }

  function handleResume(id: string) {
    onViewSession(id);
  }

  if (repos.length === 0 && sessions.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-24 text-center">
        <p className="text-lg font-medium text-gray-500 dark:text-gray-400">No sessions yet</p>
        <p className="mt-1 text-sm text-gray-400 dark:text-gray-600">
          Connect a repository and create a session to get started.
        </p>
        <div className="mt-4 flex gap-2">
          <button
            onClick={onManageRepos}
            className="rounded-md border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-gray-800"
          >
            Add a Repo
          </button>
          <button
            onClick={onNewSession}
            className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-500"
          >
            + New Session
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-base font-semibold text-gray-900 dark:text-gray-100">Sessions</h2>
        <button
          onClick={onManageRepos}
          className="rounded-md px-2.5 py-1 text-xs font-medium text-blue-600 hover:bg-blue-50 dark:text-blue-400 dark:hover:bg-blue-950/40"
        >
          Manage Repos
        </button>
      </div>

      {repoOrder.map((repo) => {
        const repoSessions = sessionsByRepo.get(repo.id) ?? [];
        const isCollapsed = collapsedRepos.has(repo.id);
        const activeCount = repoSessions.filter(
          (s) => s.status === "running" || s.status === "waiting",
        ).length;

        return (
          <section
            key={repo.id}
            className="rounded-lg border border-gray-200 bg-white dark:border-gray-800 dark:bg-gray-900"
          >
            {/* Repo header */}
            <button
              type="button"
              onClick={() => toggleRepo(repo.id)}
              className="flex w-full cursor-pointer items-center gap-3 px-4 py-3 text-left"
            >
              <svg
                className={`h-3.5 w-3.5 shrink-0 text-gray-400 transition-transform ${isCollapsed ? "" : "rotate-90"}`}
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={2}
              >
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
              </svg>
              <div className="min-w-0 flex-1">
                <span className="text-sm font-medium text-gray-900 dark:text-gray-100">
                  {repoDisplayName(repo)}
                </span>
              </div>
              <div className="flex items-center gap-2">
                {activeCount > 0 && (
                  <span className="rounded-full bg-green-500/20 px-1.5 py-0.5 text-xs font-medium text-green-600 ring-1 ring-green-500/30 dark:text-green-400">
                    {activeCount} active
                  </span>
                )}
                <span className="text-xs text-gray-400 dark:text-gray-600">
                  {repoSessions.length} {repoSessions.length === 1 ? "session" : "sessions"}
                </span>
              </div>
            </button>

            {/* Sessions under this repo */}
            {!isCollapsed && (
              <div className="border-t border-gray-100 px-4 py-3 dark:border-gray-800">
                {repoSessions.length === 0 ? (
                  <p className="text-xs text-gray-400 dark:text-gray-600">
                    No sessions for this repository.
                  </p>
                ) : (
                  <div className="grid gap-3">
                    {repoSessions.map((s) => (
                      <SessionCard
                        key={s.id}
                        session={s}
                        onView={onViewSession}
                        onReply={s.status === "waiting" ? handleReply : undefined}
                        onInterrupt={s.status === "running" ? handleInterrupt : undefined}
                        onResume={
                          s.status === "idle" || s.status === "paused" ? handleResume : undefined
                        }
                      />
                    ))}
                  </div>
                )}
              </div>
            )}
          </section>
        );
      })}

      {/* Unlinked sessions */}
      {unlinkedSessions.length > 0 && (
        <section className="rounded-lg border border-gray-200 bg-white dark:border-gray-800 dark:bg-gray-900">
          <div className="px-4 py-3">
            <span className="text-sm font-medium text-gray-500 dark:text-gray-400">
              Other Sessions
            </span>
          </div>
          <div className="border-t border-gray-100 px-4 py-3 dark:border-gray-800">
            <div className="grid gap-3">
              {unlinkedSessions.map((s) => (
                <SessionCard
                  key={s.id}
                  session={s}
                  onView={onViewSession}
                  onReply={s.status === "waiting" ? handleReply : undefined}
                  onInterrupt={s.status === "running" ? handleInterrupt : undefined}
                  onResume={
                    s.status === "idle" || s.status === "paused" ? handleResume : undefined
                  }
                />
              ))}
            </div>
          </div>
        </section>
      )}
    </div>
  );
}
