import { useEffect, useState, useCallback, useRef } from "react";
import { DispatchBoard } from "./components/DispatchBoard";
import { SessionDetail } from "./components/SessionDetail";
import { NewSessionModal } from "./components/NewSessionModal";
import { AddRepoDialog } from "./components/AddRepoDialog";
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
import { BrandMark } from "./components/BrandMark";
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
  interruptSession,
  writeToSession,
} from "./lib/tauri";
import { requestNotificationPermission, sendSystemNotification } from "./lib/notifications";
import { playNotificationSound } from "./lib/sound";
import { matchesKeybindingById } from "./lib/keybindings";
import { useTauriEvent } from "./hooks/useTauriEvent";
import { useTheme } from "./hooks/useTheme";
import type { Repo, GitHubIssue, GitHubPR, ClaudeStreamEvent } from "./lib/types";
type View = "home" | "session" | "tasks";

function App() {
  const [view, setView] = useState<View>("home");
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null);
  const [lastViewedSessionId, setLastViewedSessionId] = useState<string | null>(null);
  const [showNewSession, setShowNewSession] = useState(false);
  const [showCommandPalette, setShowCommandPalette] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [showShortcuts, setShowShortcuts] = useState(false);
  const [showAddRepo, setShowAddRepo] = useState(false);
  const [prefillRepo, setPrefillRepo] = useState<Repo | null>(null);
  const [prefillIssue, setPrefillIssue] = useState<GitHubIssue | null>(null);
  const [prefillPR, setPrefillPR] = useState<GitHubPR | null>(null);
  const [issueCountsByRepo, setIssueCountsByRepo] = useState<Record<string, number>>({});
  const [tasksRepoId, setTasksRepoId] = useState<string | null>(null);

  const { showOnboarding, dismissOnboarding } = useOnboarding();

  const loadSessions = useSessionStore((s) => s.loadSessions);
  const updateSession = useSessionStore((s) => s.updateSession);
  const appendStructuredEvents = useSessionStore((s) => s.appendStructuredEvents);
  const loadRepos = useRepoStore((s) => s.loadRepos);
  const repos = useRepoStore((s) => s.repos);
  const removeRepo = useRepoStore((s) => s.removeRepo);
  const sessions = useSessionStore((s) => s.sessions);

  const sidebarWidth = useUIStore((s) => s.panelSizes.sidebarWidth);
  const sidebarCollapsed = useUIStore((s) => s.sidebarCollapsed);
  const toggleSidebar = useUIStore((s) => s.toggleSidebar);
  const setPanelSize = useUIStore((s) => s.setPanelSize);
  const setActiveSessionIdInStore = useUIStore((s) => s.setActiveSessionId);

  // Sync local activeSessionId to UI store (for PermissionDialog filtering)
  useEffect(() => {
    setActiveSessionIdInStore(activeSessionId);
  }, [activeSessionId, setActiveSessionIdInStore]);

  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const prevStatusRef = useRef<Record<string, string>>({});

  useTheme();

  const soundEnabled = useUIStore((s) => s.soundEnabled);

  // Keyboard shortcuts
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      // Interrupt shortcut (Ctrl+C) — works globally when viewing a running session
      // and no text is selected (so native copy still works)
      if (matchesKeybindingById(e, "interrupt-session")) {
        const sel = window.getSelection();
        const hasSelection = sel != null && sel.toString().length > 0;
        if (!hasSelection && view === "session" && activeSessionId) {
          const activeSession = sessions.find((s) => s.id === activeSessionId);
          if (activeSession?.status === "running") {
            e.preventDefault();
            void interruptSession(activeSessionId);
            return;
          }
        }
      }

      // Clear terminal (Ctrl+L) — works when viewing a session
      if (matchesKeybindingById(e, "clear-terminal")) {
        if (view === "session" && activeSessionId) {
          e.preventDefault();
          // Send form-feed character to clear terminal
          void writeToSession(activeSessionId, "\x0c");
          return;
        }
      }

      // Ignore remaining shortcuts if typing in an input
      const tag = (e.target as HTMLElement).tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;

      if (matchesKeybindingById(e, "command-palette")) {
        e.preventDefault();
        setShowCommandPalette((v) => !v);
        return;
      }
      if (matchesKeybindingById(e, "new-session")) {
        e.preventDefault();
        setShowNewSession(true);
        return;
      }
      if (matchesKeybindingById(e, "jump-waiting")) {
        e.preventDefault();
        // Jump to next waiting session
        const waitingSessions = sessions.filter((s) => s.status === "attention");
        if (waitingSessions.length > 0) {
          const sorted = [...waitingSessions].sort((a, b) => a.stateChangedAt - b.stateChangedAt);
          setActiveSessionId(sorted[0].id);
          setView("session");
        }
        return;
      }
      if (matchesKeybindingById(e, "go-home")) {
        e.preventDefault();
        setView("home");
        setActiveSessionId(null);
        return;
      }
      if (matchesKeybindingById(e, "go-tasks")) {
        e.preventDefault();
        setView("tasks");
        return;
      }
      if (matchesKeybindingById(e, "toggle-sidebar")) {
        e.preventDefault();
        toggleSidebar();
        return;
      }
      if (matchesKeybindingById(e, "open-settings")) {
        e.preventDefault();
        setShowSettings(true);
        return;
      }
      if (matchesKeybindingById(e, "show-shortcuts")) {
        e.preventDefault();
        setShowShortcuts((v) => !v);
        return;
      }
      if (matchesKeybindingById(e, "close-or-back")) {
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
  }, [
    view,
    activeSessionId,
    showCommandPalette,
    showSettings,
    showShortcuts,
    sessions,
    toggleSidebar,
  ]);

  // Request notification permission on startup
  useEffect(() => {
    void requestNotificationPermission();
  }, []);

  useEffect(() => {
    void loadSessions();
    void loadRepos();
  }, [loadSessions, loadRepos]);

  // Fetch open issue+PR counts per repo for sidebar badges
  useEffect(() => {
    if (repos.length === 0) return;
    let cancelled = false;
    void Promise.all(
      repos.map(async (repo) => {
        const [issues, prs] = await Promise.all([
          fetchIssues(repo.id).catch(() => [] as { state: string }[]),
          fetchPRs(repo.id).catch(() => [] as { state: string }[]),
        ]);
        const count =
          issues.filter((i) => i.state === "open").length +
          prs.filter((p) => p.state === "open").length;
        return { repoId: repo.id, count };
      }),
    ).then((results) => {
      if (!cancelled) {
        const counts: Record<string, number> = {};
        for (const { repoId, count } of results) {
          counts[repoId] = count;
        }
        setIssueCountsByRepo(counts);
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
        const shouldNotify = session.status === "attention" && prevStatus !== "attention";

        if (shouldNotify) {
          const msg = {
            toast: `"${session.name}" needs your attention`,
            system: `Session "${session.name}" needs your attention.`,
            type: "warning" as ToastItem["type"],
          };

          // In-app toast (deduplicate: skip if same session+status toast already showing)
          setToasts((prev) => {
            const prefix = `${session.id}-${session.status}-`;
            if (prev.some((t) => t.id.startsWith(prefix))) return prev;
            return [
              ...prev,
              {
                id: `${prefix}${Date.now()}`,
                message: msg.toast,
                type: msg.type,
                sessionId: session.id,
              },
            ];
          });

          // System notification
          void sendSystemNotification("Octopus", msg.system);

          // Sound notification
          if (soundEnabled) {
            void playNotificationSound("alert");
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
    () =>
      onHookEvent((payload) => {
        addHookEvent(payload);
      }),
    [addHookEvent],
  );

  useTauriEvent(
    () =>
      onHookPermissionRequest((payload) => {
        addPermissionRequest(payload);
      }),
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

  const waitingCount = sessions.filter((s) => s.status === "attention").length;
  const isSessionView = view === "session" && activeSessionId;

  return (
    <div className="flex h-screen overflow-hidden bg-surface text-on-surface">
      {/* Sidebar */}
      {!sidebarCollapsed && (
        <>
          <aside
            style={{ width: `${sidebarWidth}px` }}
            className="flex shrink-0 flex-col overflow-hidden border-r border-outline bg-surface"
          >
            {/* Brand */}
            <div className="flex shrink-0 items-center justify-between px-4 py-3">
              <div className="flex items-center gap-2.5">
                <BrandMark size={22} />
                <div>
                  <h1 className="text-base font-bold tracking-tight text-on-surface">Octopus</h1>
                  <p className="text-[11px] text-on-surface-faint">dispatch board</p>
                </div>
              </div>
              <div className="flex items-center gap-1">
                {/* Settings gear */}
                <button
                  onClick={() => setShowSettings(true)}
                  title="Settings"
                  className="rounded-sm p-1.5 text-on-surface-muted hover:bg-hover"
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
                  className="rounded-sm p-1.5 text-on-surface-muted hover:bg-hover"
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
            </nav>

            {/* Session tree */}
            <div className="mt-3 flex-1 overflow-y-auto px-1">
              <SidebarTree
                repos={repos}
                sessions={sessions}
                activeSessionId={activeSessionId}
                onSelectSession={handleViewSession}
                onNewSession={(repo?: Repo) => {
                  if (repo) setPrefillRepo(repo);
                  setShowNewSession(true);
                }}
                onViewRepoTasks={(repoId: string) => {
                  setTasksRepoId(repoId);
                  setView("tasks");
                }}
                onAddRepo={() => setShowAddRepo(true)}
                onRemoveRepo={(repoId: string) => {
                  void removeRepo(repoId);
                }}
                issueCountsByRepo={issueCountsByRepo}
                activeView={view}
                tasksRepoId={tasksRepoId}
              />
            </div>
          </aside>
          <ResizeHandle direction="horizontal" onResize={handleSidebarResize} />
        </>
      )}

      {/* Sidebar collapsed: show expand button + attention indicator */}
      {sidebarCollapsed && (
        <div className="flex shrink-0 flex-col items-center gap-2 border-r border-outline bg-surface py-3">
          <button
            onClick={toggleSidebar}
            title="Expand sidebar"
            className="rounded-sm p-1.5 text-on-surface-muted hover:bg-hover"
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
          {waitingCount > 0 && (
            <span
              className="h-2 w-2 animate-pulse rounded-full bg-amber-500"
              title={`${waitingCount} session${waitingCount > 1 ? "s" : ""} need input`}
            />
          )}
        </div>
      )}

      {/* Main content — uses relative container so hidden views can be absolutely positioned */}
      <main className="relative flex-1 overflow-hidden">
        <ErrorBoundary>
          {view === "home" && (
            <div className="absolute inset-0 flex flex-col overflow-hidden">
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
          {view === "tasks" && (
            <div className="absolute inset-0 overflow-y-auto p-6">
              <IssueBacklog
                repos={tasksRepoId ? repos.filter((r) => r.id === tasksRepoId) : repos}
                onSelectIssue={handleSelectIssue}
                onSelectPR={handleSelectPR}
                onNavigateSettings={() => setShowAddRepo(true)}
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
            setShowAddRepo(true);
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

      {/* Add repo dialog */}
      <AddRepoDialog open={showAddRepo} onClose={() => setShowAddRepo(false)} />

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
      className={`flex items-center justify-between rounded-sm px-3 py-2 text-sm font-medium transition-colors ${
        active
          ? "bg-hover text-on-surface"
          : "text-on-surface-muted hover:bg-hover hover:text-on-surface"
      }`}
    >
      {label}
      {badge !== undefined && (
        <span className="rounded-full bg-danger px-1.5 py-0.5 text-xs font-bold text-white">
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
      className="rounded-sm p-1.5 text-on-surface-muted hover:bg-hover"
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
