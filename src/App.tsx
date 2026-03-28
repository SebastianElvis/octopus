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
import { CommandPalette } from "./components/CommandPalette";
import { ToastContainer, type ToastItem } from "./components/Toast";
import { OnboardingDialog, useOnboarding } from "./components/OnboardingDialog";
import { SettingsModal } from "./components/SettingsModal";
import { KeyboardShortcutsOverlay } from "./components/KeyboardShortcutsOverlay";
import { useSessionStore } from "./stores/sessionStore";
import { useRepoStore } from "./stores/repoStore";
import { useUIStore } from "./stores/uiStore";
import { useHookStore } from "./stores/hookStore";
import {
  onSessionStateChanged,
  onSessionStructuredOutput,
  onHookEvent,
  onHookPermissionRequest,
  fetchIssues,
  fetchPRs,
} from "./lib/tauri";
import { requestNotificationPermission, sendSystemNotification } from "./lib/notifications";
import { playNotificationSound } from "./lib/sound";
import { useTauriEvent } from "./hooks/useTauriEvent";
import { useTheme } from "./hooks/useTheme";
import type { Repo, GitHubIssue, GitHubPR, ClaudeStreamEvent } from "./lib/types";
import { PermissionDialog } from "./components/claude/PermissionDialog";

type View = "home" | "session" | "repos" | "tasks";

function App() {
  const [view, setView] = useState<View>("home");
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null);
  const [lastViewedSessionId, setLastViewedSessionId] = useState<string | null>(null);
  const [showNewSession, setShowNewSession] = useState(false);
  const [showCommandPalette, setShowCommandPalette] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [showShortcuts, setShowShortcuts] = useState(false);
  const [prefillRepo, setPrefillRepo] = useState<Repo | null>(null);
  const [prefillIssue, setPrefillIssue] = useState<GitHubIssue | null>(null);
  const [prefillPR, setPrefillPR] = useState<GitHubPR | null>(null);
  const [openIssueCount, setOpenIssueCount] = useState(0);

  const { showOnboarding, dismissOnboarding } = useOnboarding();

  const loadSessions = useSessionStore((s) => s.loadSessions);
  const updateSession = useSessionStore((s) => s.updateSession);
  const appendStructuredEvents = useSessionStore((s) => s.appendStructuredEvents);
  const loadRepos = useRepoStore((s) => s.loadRepos);
  const repos = useRepoStore((s) => s.repos);
  const sessions = useSessionStore((s) => s.sessions);

  const sidebarWidth = useUIStore((s) => s.panelSizes.sidebarWidth);
  const sidebarCollapsed = useUIStore((s) => s.sidebarCollapsed);
  const toggleSidebar = useUIStore((s) => s.toggleSidebar);
  const setPanelSize = useUIStore((s) => s.setPanelSize);

  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const prevStatusRef = useRef<Record<string, string>>({});

  useTheme();

  const soundEnabled = useUIStore((s) => s.soundEnabled);

  // Keyboard shortcuts
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      // Ignore if typing in an input
      const tag = (e.target as HTMLElement).tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;

      const isMeta = e.metaKey || e.ctrlKey;

      if (isMeta && e.key === "k") {
        e.preventDefault();
        setShowCommandPalette((v) => !v);
        return;
      }
      if (isMeta && e.key === "n") {
        e.preventDefault();
        setShowNewSession(true);
        return;
      }
      if (isMeta && e.key === "j") {
        e.preventDefault();
        // Jump to next waiting session
        const waitingSessions = sessions.filter((s) => s.status === "waiting");
        if (waitingSessions.length > 0) {
          const sorted = [...waitingSessions].sort((a, b) => a.stateChangedAt - b.stateChangedAt);
          setActiveSessionId(sorted[0].id);
          setView("session");
        }
        return;
      }
      if (isMeta && e.key === "1") {
        e.preventDefault();
        setView("home");
        setActiveSessionId(null);
        return;
      }
      if (isMeta && e.key === "2") {
        e.preventDefault();
        setView("tasks");
        return;
      }
      if (isMeta && e.key === "3") {
        e.preventDefault();
        setView("repos");
        return;
      }
      if (isMeta && (e.key === "/" || e.key === "?")) {
        e.preventDefault();
        setShowShortcuts((v) => !v);
        return;
      }
      if (e.key === "Escape") {
        if (showShortcuts) {
          setShowShortcuts(false);
          return;
        }
        if (showSettings) {
          setShowSettings(false);
          return;
        }
        if (showCommandPalette) {
          setShowCommandPalette(false);
          return;
        }
        if (view === "session") {
          setView("home");
          setActiveSessionId(null);
          return;
        }
      }
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [view, showCommandPalette, showSettings, showShortcuts, sessions]);

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
          const messages: Record<
            string,
            { toast: string; system: string; type: ToastItem["type"] }
          > = {
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

          // session.status is guaranteed to be one of the keys above due to shouldNotify check
          const msg = messages[session.status] as {
            toast: string;
            system: string;
            type: ToastItem["type"];
          };
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

          // Sound notification
          if (soundEnabled) {
            void playNotificationSound(session.status === "completed" ? "success" : "alert");
          }
        }
      }),
    [updateSession, soundEnabled],
  );

  // Batch structured events to avoid overwhelming React with rapid updates.
  // Events are buffered in a ref and flushed once per animation frame.
  const pendingEventsRef = useRef<{ sessionId: string; event: ClaudeStreamEvent }[]>([]);
  const rafIdRef = useRef<number | null>(null);

  useEffect(() => {
    return () => {
      if (rafIdRef.current != null) cancelAnimationFrame(rafIdRef.current);
    };
  }, []);

  useTauriEvent(
    () =>
      onSessionStructuredOutput((payload) => {
        pendingEventsRef.current.push({
          sessionId: payload.sessionId,
          event: payload.event,
        });
        rafIdRef.current ??= requestAnimationFrame(() => {
          rafIdRef.current = null;
          const batch = pendingEventsRef.current;
          pendingEventsRef.current = [];
          if (batch.length > 0) {
            appendStructuredEvents(batch);
          }
        });
      }),
    [appendStructuredEvents],
  );

  // Subscribe to hook events from the Claude Code hooks server
  const addHookEvent = useHookStore((s) => s.addHookEvent);
  const addPermissionRequest = useHookStore((s) => s.addPermissionRequest);

  useTauriEvent(
    () => onHookEvent((payload) => { addHookEvent(payload); }),
    [addHookEvent],
  );

  useTauriEvent(
    () => onHookPermissionRequest((payload) => { addPermissionRequest(payload); }),
    [addPermissionRequest],
  );

  const handleSidebarResize = useCallback(
    (delta: number) => {
      setPanelSize("sidebarWidth", Math.max(0, sidebarWidth + delta));
    },
    [sidebarWidth, setPanelSize],
  );

  function handleViewSession(id: string) {
    setActiveSessionId(id);
    setLastViewedSessionId(id);
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
                <h1 className="text-base font-bold tracking-tight text-gray-900 dark:text-gray-100">
                  TooManyTabs
                </h1>
                <p className="text-[11px] text-gray-400 dark:text-gray-500">dispatch board</p>
              </div>
              <div className="flex items-center gap-1">
                {/* Settings gear */}
                <button
                  onClick={() => setShowSettings(true)}
                  title="Settings"
                  className="rounded-md p-1.5 text-gray-500 hover:bg-gray-100 dark:text-gray-400 dark:hover:bg-gray-800/50"
                >
                  <svg
                    className="h-4 w-4"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                    strokeWidth={2}
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.066 2.573c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.573 1.066c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.066-2.573c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z"
                    />
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"
                    />
                  </svg>
                </button>
                <SoundToggle />
                <ThemeToggle />
                {/* Collapse sidebar */}
                <button
                  onClick={toggleSidebar}
                  title="Collapse sidebar"
                  className="rounded-md p-1.5 text-gray-500 hover:bg-gray-100 dark:text-gray-400 dark:hover:bg-gray-800/50"
                >
                  <svg
                    className="h-4 w-4"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                    strokeWidth={2}
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      d="M11 19l-7-7 7-7m8 14l-7-7 7-7"
                    />
                  </svg>
                </button>
              </div>
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

      {/* Sidebar collapsed: show expand button */}
      {sidebarCollapsed && (
        <div className="flex shrink-0 flex-col items-center border-r border-gray-200 bg-white py-3 dark:border-gray-800 dark:bg-gray-950">
          <button
            onClick={toggleSidebar}
            title="Expand sidebar"
            className="rounded-md p-1.5 text-gray-500 hover:bg-gray-100 dark:text-gray-400 dark:hover:bg-gray-800/50"
          >
            <svg
              className="h-4 w-4"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2}
            >
              <path strokeLinecap="round" strokeLinejoin="round" d="M13 5l7 7-7 7M5 5l7 7-7 7" />
            </svg>
          </button>
        </div>
      )}

      {/* Main content — uses relative container so hidden views can be absolutely positioned */}
      <main className="relative flex-1 overflow-hidden">
        <ErrorBoundary>
          {view === "home" && (
            <div className="flex h-full flex-col">
              <DispatchBoard
                onViewSession={handleViewSession}
                onNewSession={() => setShowNewSession(true)}
                activeSessionId={lastViewedSessionId}
              />
            </div>
          )}
          {/* SessionDetail: kept mounted with visibility:hidden to preserve state.
              The raw terminal tab still uses xterm which auto-pauses when not visible. */}
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

      {/* Onboarding dialog */}
      {showOnboarding && (
        <OnboardingDialog
          onClose={dismissOnboarding}
          onOpenRepoSettings={() => {
            setView("repos");
            dismissOnboarding();
          }}
          onOpenNewSession={() => {
            setShowNewSession(true);
            dismissOnboarding();
          }}
        />
      )}

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

      {/* Command palette */}
      <CommandPalette
        open={showCommandPalette}
        onClose={() => setShowCommandPalette(false)}
        onSelectSession={handleViewSession}
      />

      {/* Settings modal */}
      <SettingsModal
        open={showSettings}
        onClose={() => setShowSettings(false)}
        onShowShortcuts={() => setShowShortcuts(true)}
      />

      {/* Keyboard shortcuts overlay */}
      <KeyboardShortcutsOverlay open={showShortcuts} onClose={() => setShowShortcuts(false)} />

      {/* Toast notifications */}
      <ToastContainer toasts={toasts} onDismiss={dismissToast} onClickToast={handleToastClick} />

      {/* Hook permission dialog (modal overlay) */}
      <PermissionDialog />
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
      data-testid={`nav-${label.toLowerCase()}`}
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

function SoundToggle() {
  const soundEnabled = useUIStore((s) => s.soundEnabled);
  const toggleSound = useUIStore((s) => s.toggleSound);

  return (
    <button
      onClick={toggleSound}
      title={soundEnabled ? "Mute notifications" : "Unmute notifications"}
      className="rounded-md p-1.5 text-gray-500 hover:bg-gray-100 dark:text-gray-400 dark:hover:bg-gray-800/50"
    >
      {soundEnabled ? (
        <svg
          className="h-4 w-4"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={2}
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M15.536 8.464a5 5 0 010 7.072M17.95 6.05a8 8 0 010 11.9M6.5 8.5H4a1 1 0 00-1 1v5a1 1 0 001 1h2.5l4.5 4V4.5l-4.5 4z"
          />
        </svg>
      ) : (
        <svg
          className="h-4 w-4"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={2}
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M5.586 15H4a1 1 0 01-1-1v-4a1 1 0 011-1h1.586l4.707-4.707A1 1 0 0112 5v14a1 1 0 01-1.707.707L5.586 15z"
          />
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M17 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2"
          />
        </svg>
      )}
    </button>
  );
}

export default App;
