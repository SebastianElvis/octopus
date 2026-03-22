import { useEffect, useState } from "react";
import { DispatchBoard } from "./components/DispatchBoard";
import { SessionDetail } from "./components/SessionDetail";
import { NewSessionModal } from "./components/NewSessionModal";
import { RepoSettings } from "./components/RepoSettings";
import { ErrorBoundary } from "./components/ErrorBoundary";
import { useSessionStore } from "./stores/sessionStore";
import { useRepoStore } from "./stores/repoStore";
import { onSessionStateChanged, onSessionOutput } from "./lib/tauri";
import { useTauriEvent } from "./hooks/useTauriEvent";

type View = "board" | "session" | "settings";

function App() {
  const [view, setView] = useState<View>("board");
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null);
  const [showNewSession, setShowNewSession] = useState(false);

  const loadSessions = useSessionStore((s) => s.loadSessions);
  const updateSession = useSessionStore((s) => s.updateSession);
  const appendOutput = useSessionStore((s) => s.appendOutput);
  const loadRepos = useRepoStore((s) => s.loadRepos);
  const repos = useRepoStore((s) => s.repos);
  const sessions = useSessionStore((s) => s.sessions);

  useEffect(() => {
    void loadSessions();
    void loadRepos();
  }, [loadSessions, loadRepos]);

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
        appendOutput(payload.sessionId, payload.line);
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

  const waitingCount = sessions.filter((s) => s.status === "waiting").length;

  return (
    <div className="flex min-h-screen bg-gray-950 text-gray-100">
      {/* Sidebar */}
      <aside className="flex w-56 flex-col border-r border-gray-800 bg-gray-950">
        <div className="px-4 py-4">
          <h1 className="text-base font-semibold tracking-tight text-gray-100">TooManyTabs</h1>
          <p className="text-xs text-gray-600">Claude Code dispatch board</p>
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
            label="Settings"
            active={view === "settings"}
            onClick={() => setView("settings")}
          />
        </nav>

        {/* Repo list */}
        <div className="mt-4 px-4">
          <p className="mb-2 text-xs font-medium uppercase tracking-wide text-gray-600">Repos</p>
          {repos.length === 0 ? (
            <p className="text-xs text-gray-700">None added</p>
          ) : (
            <div className="space-y-1">
              {repos.map((repo) => {
                const name = repo.githubUrl.split("/").slice(-2).join("/");
                return (
                  <div
                    key={repo.id}
                    className="truncate text-xs text-gray-500"
                    title={repo.githubUrl}
                  >
                    {name}
                  </div>
                );
              })}
            </div>
          )}
        </div>

        <div className="mt-auto p-4">
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
          {view === "settings" && <RepoSettings />}
        </ErrorBoundary>
      </main>

      {/* New session modal */}
      {showNewSession && <NewSessionModal repos={repos} onClose={() => setShowNewSession(false)} />}
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
          ? "bg-gray-800 text-gray-100"
          : "text-gray-400 hover:bg-gray-800/50 hover:text-gray-200"
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
