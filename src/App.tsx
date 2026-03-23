import { useEffect, useState } from "react";
import { DispatchBoard } from "./components/DispatchBoard";
import { SessionDetail } from "./components/SessionDetail";
import { NewSessionModal } from "./components/NewSessionModal";
import { RepoSettings } from "./components/RepoSettings";
import { IssueBacklog } from "./components/IssueBacklog";
import { ErrorBoundary } from "./components/ErrorBoundary";
import { ThemeToggle } from "./components/ThemeToggle";
import { useSessionStore } from "./stores/sessionStore";
import { useRepoStore } from "./stores/repoStore";
import { onSessionStateChanged, onSessionOutput, fetchIssues, fetchPRs } from "./lib/tauri";
import { useTauriEvent } from "./hooks/useTauriEvent";
import { useTheme } from "./hooks/useTheme";
import type { Repo, GitHubIssue, GitHubPR } from "./lib/types";

type View = "board" | "session" | "repos" | "issues";

function App() {
  const [view, setView] = useState<View>("board");
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null);
  const [showNewSession, setShowNewSession] = useState(false);
  const [prefillRepo, setPrefillRepo] = useState<Repo | null>(null);
  const [prefillIssue, setPrefillIssue] = useState<GitHubIssue | null>(null);
  const [prefillPR, setPrefillPR] = useState<GitHubPR | null>(null);
  const [openIssueCount, setOpenIssueCount] = useState(0);
  const [reposCollapsed, setReposCollapsed] = useState(false);

  const loadSessions = useSessionStore((s) => s.loadSessions);
  const updateSession = useSessionStore((s) => s.updateSession);
  const appendOutput = useSessionStore((s) => s.appendOutput);
  const loadRepos = useRepoStore((s) => s.loadRepos);
  const repos = useRepoStore((s) => s.repos);
  const sessions = useSessionStore((s) => s.sessions);

  // Apply theme class to <html> and listen for OS changes
  useTheme();

  useEffect(() => {
    void loadSessions();
    void loadRepos();
  }, [loadSessions, loadRepos]);

  // Fetch total open issue count for badge
  useEffect(() => {
    if (repos.length === 0) return;
    let cancelled = false;
    void Promise.all(
      repos.flatMap((repo) => [
        fetchIssues(repo.id)
          .then((issues) => issues.filter((i) => i.state === "open").length)
          .catch(() => 0),
        fetchPRs(repo.id)
          .then((prs) => prs.filter((p) => p.state === "open").length)
          .catch(() => 0),
      ]),
    ).then((counts) => {
      if (!cancelled) {
        setOpenIssueCount(counts.reduce((a, b) => a + b, 0));
      }
    });
    return () => {
      cancelled = true;
    };
  }, [repos]);

  useTauriEvent(
    () =>
      onSessionStateChanged((payload) => {
        const { session } = payload;
        updateSession(session.id, session);
      }),
    [updateSession],
  );

  useTauriEvent(
    () =>
      onSessionOutput((payload) => {
        appendOutput(payload.sessionId, payload.data);
      }),
    [appendOutput],
  );

  function handleViewSession(id: string) {
    setActiveSessionId(id);
    setView("session");
  }

  function handleBack() {
    setView("board");
    setActiveSessionId(null);
  }

  function handleSelectIssue(repo: Repo, issue: GitHubIssue) {
    setPrefillRepo(repo);
    setPrefillIssue(issue);
    setPrefillPR(null);
    setShowNewSession(true);
  }

  function handleSelectPR(repo: Repo, pr: GitHubPR) {
    setPrefillRepo(repo);
    setPrefillPR(pr);
    setPrefillIssue(null);
    setShowNewSession(true);
  }

  function handleCloseModal() {
    setShowNewSession(false);
    setPrefillRepo(null);
    setPrefillIssue(null);
    setPrefillPR(null);
  }

  const waitingCount = sessions.filter((s) => s.status === "waiting").length;

  return (
    <div className="flex min-h-screen bg-white text-gray-900 dark:bg-gray-950 dark:text-gray-100">
      {/* Sidebar */}
      <aside className="flex w-56 flex-col border-r border-gray-200 bg-white dark:border-gray-800 dark:bg-gray-950">
        <div className="flex items-center justify-between px-4 py-4">
          <div>
            <h1 className="text-base font-semibold tracking-tight text-gray-900 dark:text-gray-100">
              TooManyTabs
            </h1>
            <p className="text-xs text-gray-500 dark:text-gray-600">Claude Code dispatch board</p>
          </div>
          <ThemeToggle />
        </div>

        <nav className="flex flex-col gap-1 px-2">
          <NavItem
            label="Board"
            active={view === "board" || view === "session"}
            badge={waitingCount > 0 ? waitingCount : undefined}
            onClick={() => {
              setView("board");
              setActiveSessionId(null);
            }}
          />
          <NavItem
            label="Issues"
            active={view === "issues"}
            badge={openIssueCount > 0 ? openIssueCount : undefined}
            onClick={() => setView("issues")}
          />
        </nav>

        {/* Repo list */}
        <div className="mt-4 px-4">
          <div className="mb-2 flex items-center justify-between">
            <button
              type="button"
              onClick={() => setReposCollapsed((v) => !v)}
              className="flex cursor-pointer items-center gap-1 text-xs font-medium uppercase tracking-wide text-gray-500 hover:text-gray-700 dark:text-gray-600 dark:hover:text-gray-400"
            >
              <svg
                className={`h-3 w-3 transition-transform ${reposCollapsed ? "" : "rotate-90"}`}
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={2}
              >
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
              </svg>
              Repos ({String(repos.length)})
            </button>
            <button
              type="button"
              onClick={() => setView("repos")}
              className="cursor-pointer rounded px-2 py-1 text-xs font-medium text-blue-600 hover:bg-blue-100 active:bg-blue-200 dark:text-blue-400 dark:hover:bg-blue-950/40 dark:active:bg-blue-950/60"
              title="Manage repositories"
            >
              +
            </button>
          </div>
          {!reposCollapsed && (
            <>
              {repos.length === 0 ? (
                <button
                  type="button"
                  onClick={() => setView("repos")}
                  className="w-full cursor-pointer rounded-md border border-dashed border-gray-300 px-3 py-2.5 text-center text-xs font-medium text-gray-600 transition-colors hover:border-blue-400 hover:bg-blue-50 hover:text-blue-600 active:bg-blue-100 dark:border-gray-700 dark:text-gray-400 dark:hover:border-blue-600 dark:hover:bg-blue-950/30 dark:hover:text-blue-400"
                >
                  Connect a repo
                </button>
              ) : (
                <div className="space-y-0.5">
                  {repos.map((repo) => {
                    const ghUrl = repo.githubUrl ?? "";
                    const name = ghUrl.split("/").slice(-2).join("/") || ghUrl || "unknown";
                    return (
                      <button
                        key={repo.id}
                        type="button"
                        onClick={() => setView("repos")}
                        className="block w-full cursor-pointer truncate rounded px-2 py-1 text-left text-xs text-gray-600 hover:bg-gray-100 hover:text-gray-900 dark:text-gray-500 dark:hover:bg-gray-800 dark:hover:text-gray-300"
                        title={ghUrl}
                      >
                        {name}
                      </button>
                    );
                  })}
                </div>
              )}
            </>
          )}
        </div>

        <div className="mt-auto flex flex-col gap-2 p-4">
          <button
            onClick={() => setShowNewSession(true)}
            className="w-full rounded-md bg-blue-600 px-3 py-2 text-sm font-medium text-white hover:bg-blue-500"
          >
            + New Session
          </button>
        </div>
      </aside>

      {/* Main content */}
      <main className="flex-1 overflow-y-auto p-6">
        <ErrorBoundary>
          {view === "board" && (
            <DispatchBoard
              onViewSession={handleViewSession}
              onNewSession={() => setShowNewSession(true)}
            />
          )}
          {view === "session" && activeSessionId && (
            <SessionDetail sessionId={activeSessionId} onBack={handleBack} />
          )}
          {view === "repos" && <RepoSettings />}
          {view === "issues" && (
            <IssueBacklog
              repos={repos}
              onSelectIssue={handleSelectIssue}
              onSelectPR={handleSelectPR}
              onNavigateSettings={() => setView("repos")}
            />
          )}
        </ErrorBoundary>
      </main>

      {/* New session modal */}
      {showNewSession && (
        <NewSessionModal
          repos={repos}
          onClose={handleCloseModal}
          prefillRepo={prefillRepo ?? undefined}
          prefillIssue={prefillIssue ?? undefined}
          prefillPR={prefillPR ?? undefined}
        />
      )}
    </div>
  );
}

function NavItem({
  label,
  active,
  badge,
  onClick,
}: {
  label: string;
  active: boolean;
  badge?: number;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={`flex items-center justify-between rounded-md px-3 py-2 text-sm font-medium transition-colors ${
        active
          ? "bg-gray-100 text-gray-900 dark:bg-gray-800 dark:text-gray-100"
          : "text-gray-500 hover:bg-gray-100 hover:text-gray-700 dark:text-gray-400 dark:hover:bg-gray-800/50 dark:hover:text-gray-200"
      }`}
    >
      {label}
      {badge !== undefined && (
        <span className="rounded-full bg-red-500 px-1.5 py-0.5 text-xs font-bold text-white">
          {badge}
        </span>
      )}
    </button>
  );
}

export default App;
