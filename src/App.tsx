import { useEffect, useState, useCallback, useRef } from "react";
import { DispatchBoard } from "./components/DispatchBoard";
import { SessionDetail } from "./components/SessionDetail";
import { NewSessionModal } from "./components/NewSessionModal";
import { RepoSettings } from "./components/RepoSettings";
import { IssueBacklog } from "./components/IssueBacklog";
import { ErrorBoundary } from "./components/ErrorBoundary";
import { ThemeToggle } from "./components/ThemeToggle";
import { SidebarTree } from "./components/SidebarTree";
import { ResizeHandle } from "./components/ResizeHandle";
import { ToastContainer, type ToastItem } from "./components/Toast";
import { useSessionStore } from "./stores/sessionStore";
import { useRepoStore } from "./stores/repoStore";
import { useUIStore } from "./stores/uiStore";
import { onSessionStateChanged, onSessionOutput, fetchIssues, fetchPRs } from "./lib/tauri";
import { requestNotificationPermission, sendSystemNotification } from "./lib/notifications";
import { useTauriEvent } from "./hooks/useTauriEvent";
import { useTheme } from "./hooks/useTheme";
import type { Repo, GitHubIssue, GitHubPR } from "./lib/types";

type View = "home" | "session" | "repos" | "tasks";

function App() {
  const [view, setView] = useState<View>("home");
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null);
  const [showNewSession, setShowNewSession] = useState(false);
  const [prefillRepo, setPrefillRepo] = useState<Repo | null>(null);
  const [prefillIssue, setPrefillIssue] = useState<GitHubIssue | null>(null);
  const [prefillPR, setPrefillPR] = useState<GitHubPR | null>(null);
  const [openIssueCount, setOpenIssueCount] = useState(0);

  const loadSessions = useSessionStore((s) => s.loadSessions);
  const updateSession = useSessionStore((s) => s.updateSession);
  const appendOutput = useSessionStore((s) => s.appendOutput);
  const loadRepos = useRepoStore((s) => s.loadRepos);
  const repos = useRepoStore((s) => s.repos);
  const sessions = useSessionStore((s) => s.sessions);

  const sidebarWidth = useUIStore((s) => s.panelSizes.sidebarWidth);
  const sidebarCollapsed = useUIStore((s) => s.sidebarCollapsed);
  const setPanelSize = useUIStore((s) => s.setPanelSize);

  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const prevStatusRef = useRef<Record<string, string>>({});

  useTheme();

  // Request notification permission on startup
  useEffect(() => {
    void requestNotificationPermission();
  }, []);

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
        const prevStatus = prevStatusRef.current[session.id];
        prevStatusRef.current[session.id] = session.status;

        updateSession(session.id, session);

        // Notify on important status transitions
        const shouldNotify =
          (session.status === "waiting" && prevStatus !== "waiting") ||
          (session.status === "stuck" && prevStatus !== "stuck") ||
          (session.status === "completed" && prevStatus !== "completed") ||
          (session.status === "failed" && prevStatus !== "failed");

        if (shouldNotify) {
          const messages: Record<string, { toast: string; system: string; type: ToastItem["type"] }> = {
            waiting: {
              toast: `"${session.name}" needs your input`,
              system: `Session "${session.name}" is waiting for your response.`,
              type: "warning",
            },
            stuck: {
              toast: `"${session.name}" appears stuck`,
              system: `Session "${session.name}" has been inactive for 20+ minutes.`,
              type: "warning",
            },
            completed: {
              toast: `"${session.name}" completed`,
              system: `Session "${session.name}" finished successfully.`,
              type: "success",
            },
            failed: {
              toast: `"${session.name}" failed`,
              system: `Session "${session.name}" exited with an error.`,
              type: "warning",
            },
          };

          const msg = messages[session.status];
          if (msg) {
            // In-app toast
            setToasts((prev) => [
              ...prev,
              {
                id: `${session.id}-${session.status}-${Date.now()}`,
                message: msg.toast,
                type: msg.type,
                sessionId: session.id,
              },
            ]);

            // System notification
            void sendSystemNotification("TooManyTabs", msg.system);
          }
        }
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

  const handleSidebarResize = useCallback(
    (delta: number) => {
      const clamped = Math.max(180, Math.min(400, sidebarWidth + delta));
      setPanelSize("sidebarWidth", clamped);
    },
    [sidebarWidth, setPanelSize],
  );

  function handleViewSession(id: string) {
    setActiveSessionId(id);
    setView("session");
  }

  function handleBack() {
    setView("home");
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

  function handleSessionCreated(_sessionId: string) {
    setView("home");
    setActiveSessionId(null);
  }

  function dismissToast(id: string) {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }

  function handleToastClick(toast: ToastItem) {
    if (toast.sessionId) {
      handleViewSession(toast.sessionId);
    }
    dismissToast(toast.id);
  }

  const waitingCount = sessions.filter((s) => s.status === "waiting").length;
  const isSessionView = view === "session" && activeSessionId;

  return (
    <div className="flex h-screen overflow-hidden bg-white text-gray-900 dark:bg-gray-950 dark:text-gray-100">
      {/* Sidebar */}
      {!sidebarCollapsed && (
        <>
          <aside
            style={{ width: `${sidebarWidth}px` }}
            className="flex shrink-0 flex-col overflow-hidden border-r border-gray-200 bg-white dark:border-gray-800 dark:bg-gray-950"
          >
            {/* Brand */}
            <div className="flex shrink-0 items-center justify-between px-4 py-3">
              <div>
                <h1 className="text-sm font-semibold tracking-tight text-gray-900 dark:text-gray-100">
                  TooManyTabs
                </h1>
                <p className="text-xs text-gray-500 dark:text-gray-600">dispatch board</p>
              </div>
              <ThemeToggle />
            </div>

            {/* Nav */}
            <nav className="flex shrink-0 flex-col gap-0.5 px-2">
              <NavItem
                label="Home"
                active={view === "home" || view === "session"}
                badge={waitingCount > 0 ? waitingCount : undefined}
                onClick={() => {
                  setView("home");
                  setActiveSessionId(null);
                }}
              />
              <NavItem
                label="Tasks"
                active={view === "tasks"}
                badge={openIssueCount > 0 ? openIssueCount : undefined}
                onClick={() => setView("tasks")}
              />
              <NavItem label="Repos" active={view === "repos"} onClick={() => setView("repos")} />
            </nav>

            {/* Session tree */}
            <div className="mt-3 flex-1 overflow-y-auto px-1">
              <SidebarTree
                repos={repos}
                sessions={sessions}
                activeSessionId={activeSessionId}
                onSelectSession={handleViewSession}
                onNewSession={() => setShowNewSession(true)}
              />
            </div>
          </aside>
          <ResizeHandle direction="horizontal" onResize={handleSidebarResize} />
        </>
      )}

      {/* Main content — uses relative container so hidden views can be absolutely positioned */}
      <main className="relative flex-1 overflow-hidden">
        <ErrorBoundary>
          {view === "home" && (
            <div className="flex h-full flex-col">
              <DispatchBoard
                onViewSession={handleViewSession}
                onNewSession={() => setShowNewSession(true)}
              />
            </div>
          )}
          {/* SessionDetail: kept mounted with visibility:hidden to preserve xterm state.
              xterm's IntersectionObserver auto-pauses rendering when not visible. */}
          {activeSessionId && (
            <div
              className={
                isSessionView
                  ? "absolute inset-0 flex flex-col overflow-hidden"
                  : "invisible absolute inset-0 overflow-hidden"
              }
            >
              <SessionDetail sessionId={activeSessionId} onBack={handleBack} />
            </div>
          )}
          {view === "repos" && (
            <div className="h-full overflow-y-auto p-6">
              <RepoSettings />
            </div>
          )}
          {view === "tasks" && (
            <div className="h-full overflow-y-auto p-6">
              <IssueBacklog
                repos={repos}
                onSelectIssue={handleSelectIssue}
                onSelectPR={handleSelectPR}
                onNavigateSettings={() => setView("repos")}
              />
            </div>
          )}
        </ErrorBoundary>
      </main>

      {/* New session modal */}
      {showNewSession && (
        <NewSessionModal
          repos={repos}
          onClose={handleCloseModal}
          onCreated={handleSessionCreated}
          prefillRepo={prefillRepo ?? undefined}
          prefillIssue={prefillIssue ?? undefined}
          prefillPR={prefillPR ?? undefined}
        />
      )}

      {/* Toast notifications */}
      <ToastContainer
        toasts={toasts}
        onDismiss={dismissToast}
        onClickToast={handleToastClick}
      />
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
