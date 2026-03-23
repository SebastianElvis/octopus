import { useState, useCallback, useEffect } from "react";
import { timeAgo } from "../lib/utils";
import {
  killSession as tauriKillSession,
  resumeSession as tauriResumeSession,
  fetchIssues,
  fetchPRs,
} from "../lib/tauri";
import { useSessionStore } from "../stores/sessionStore";
import { useEditorStore } from "../stores/editorStore";
import { useUIStore } from "../stores/uiStore";
import { TerminalPanel } from "./TerminalPanel";
import { CodeEditor } from "./CodeEditor";
import { EditorTabs } from "./EditorTabs";
import { RightPanel } from "./RightPanel";
import { ResizeHandle } from "./ResizeHandle";
import { ReviewComments } from "./ReviewComments";
import { GitHubDetailView } from "./GitHubDetailView";
import { ShellPanel } from "./ShellPanel";
import type { GitHubIssue, GitHubPR } from "../lib/types";

const STATUS_PILL: Record<string, string> = {
  waiting: "bg-red-500/20 text-red-600 ring-1 ring-red-500/30 dark:text-red-400",
  running: "bg-green-500/20 text-green-600 ring-1 ring-green-500/30 dark:text-green-400",
  idle: "bg-gray-500/20 text-gray-500 ring-1 ring-gray-500/30 dark:text-gray-400",
  done: "bg-gray-200/60 text-gray-500 ring-1 ring-gray-300/30 dark:bg-gray-700/40 dark:text-gray-500 dark:ring-gray-600/30",
  completed:
    "bg-green-200/60 text-green-600 ring-1 ring-green-300/30 dark:bg-green-900/30 dark:text-green-400 dark:ring-green-700/30",
  failed:
    "bg-red-200/60 text-red-600 ring-1 ring-red-300/30 dark:bg-red-900/30 dark:text-red-400 dark:ring-red-700/30",
  killed:
    "bg-gray-200/60 text-gray-500 ring-1 ring-gray-300/30 dark:bg-gray-700/40 dark:text-gray-500 dark:ring-gray-600/30",
  paused: "bg-gray-400/20 text-gray-500 ring-1 ring-gray-400/30 dark:text-gray-400",
  stuck: "bg-orange-500/20 text-orange-600 ring-1 ring-orange-500/30 dark:text-orange-400",
  interrupted: "bg-amber-500/20 text-amber-600 ring-1 ring-amber-500/30 dark:text-amber-400",
};

type CenterTab = "terminal" | "editor" | "github";

interface SessionDetailProps {
  sessionId: string;
  onBack: () => void;
}

export function SessionDetail({ sessionId, onBack }: SessionDetailProps) {
  const session = useSessionStore((s) => s.sessions.find((x) => x.id === sessionId));
  const updateSession = useSessionStore((s) => s.updateSession);

  const activeTabId = useEditorStore((s) => s.activeTabId);
  const contents = useEditorStore((s) => s.contents);
  const tabs = useEditorStore((s) => s.tabs);
  const rightPanelWidth = useUIStore((s) => s.panelSizes.rightPanelWidth);
  const rightOutputHeight = useUIStore((s) => s.panelSizes.rightOutputHeight);
  const rightPanelCollapsed = useUIStore((s) => s.rightPanelCollapsed);
  const setPanelSize = useUIStore((s) => s.setPanelSize);

  const [showKillConfirm, setShowKillConfirm] = useState(false);
  const [centerTab, setCenterTab] = useState<CenterTab>("terminal");

  // GitHub data for the detail tab
  const [ghIssue, setGhIssue] = useState<GitHubIssue | null>(null);
  const [ghPR, setGhPR] = useState<GitHubPR | null>(null);

  const hasGitHubLink = !!(session?.linkedIssue ?? session?.linkedPR);

  // Fetch linked issue/PR data
  useEffect(() => {
    if (!session?.repoId) return;
    const linkedIssueNumber = session.linkedIssue?.number;
    if (linkedIssueNumber != null) {
      fetchIssues(session.repoId)
        .then((issues) => {
          const found = issues.find((i) => i.number === linkedIssueNumber);
          if (found) setGhIssue(found);
        })
        .catch((_err: unknown) => {
          /* fetch error ignored */
        });
    }
    const linkedPRNumber = session.linkedPR?.number;
    if (linkedPRNumber != null) {
      fetchPRs(session.repoId)
        .then((prs) => {
          const found = prs.find((p) => p.number === linkedPRNumber);
          if (found) setGhPR(found);
        })
        .catch((_err: unknown) => {
          /* fetch error ignored */
        });
    }
  }, [session?.repoId, session?.linkedIssue, session?.linkedPR]);

  // When a file tab is clicked, switch to editor mode
  const [prevTabId, setPrevTabId] = useState(activeTabId);
  if (activeTabId !== prevTabId) {
    setPrevTabId(activeTabId);
    if (activeTabId) {
      setCenterTab("editor");
    }
    if (!activeTabId && tabs.length === 0 && centerTab === "editor") {
      setCenterTab("terminal");
    }
  }

  const handleRightResize = useCallback(
    (delta: number) => {
      setPanelSize("rightPanelWidth", Math.max(0, rightPanelWidth - delta));
    },
    [rightPanelWidth, setPanelSize],
  );

  const handleOutputResize = useCallback(
    (delta: number) => {
      setPanelSize("rightOutputHeight", Math.max(0, rightOutputHeight - delta));
    },
    [rightOutputHeight, setPanelSize],
  );

  if (!session) {
    return (
      <div className="flex h-full items-center justify-center">
        <p className="text-gray-500">Session not found.</p>
      </div>
    );
  }

  async function handleKill() {
    if (!session) return;
    try {
      await tauriKillSession(session.id);
      updateSession(session.id, { status: "killed", stateChangedAt: Date.now() });
      onBack();
    } catch (err: unknown) {
      console.error("[SessionDetail] Failed to kill session:", err);
    }
  }

  function handleCommitted() {
    if (!session) return;
    updateSession(session.id, { status: "done", stateChangedAt: Date.now() });
  }

  async function handleResume() {
    if (!session) return;
    try {
      await tauriResumeSession(session.id);
      updateSession(session.id, { status: "running", stateChangedAt: Date.now() });
    } catch (err: unknown) {
      console.error("[SessionDetail] Failed to resume session:", err);
    }
  }

  const activeTab = tabs.find((t) => t.id === activeTabId);
  const activeContent = activeTabId ? contents[activeTabId] : null;
  const showEditor = centerTab === "editor" && activeTab != null && activeContent != null;

  return (
    <div className="flex h-full flex-col overflow-hidden">
      {/* Session header bar */}
      <div className="flex shrink-0 items-center justify-between border-b border-gray-200 bg-white px-4 py-2 dark:border-gray-800 dark:bg-gray-950">
        <div className="flex items-center gap-3">
          <button
            onClick={onBack}
            className="text-xs text-gray-500 hover:text-gray-700 dark:text-gray-500 dark:hover:text-gray-300"
          >
            ← Board
          </button>
          <span className="text-gray-300 dark:text-gray-700">|</span>
          <h1 className="text-sm font-semibold text-gray-900 dark:text-gray-100">{session.name}</h1>
          <span
            className={`rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_PILL[session.status]}`}
          >
            {session.status}
          </span>
          {session.branch && (
            <span className="font-mono text-xs text-gray-500 dark:text-gray-400">
              {session.branch}
            </span>
          )}
          <span className="text-xs text-gray-400 dark:text-gray-600">
            {timeAgo(session.stateChangedAt)}
          </span>
        </div>
        <div className="flex items-center gap-2">
          {session.status === "interrupted" && (
            <button
              onClick={() => {
                void handleResume();
              }}
              className="rounded bg-blue-600 px-2 py-1 text-xs font-medium text-white hover:bg-blue-500"
            >
              Resume
            </button>
          )}
          {showKillConfirm ? (
            <>
              <span className="text-xs text-red-600 dark:text-red-400">Kill session?</span>
              <button
                onClick={() => setShowKillConfirm(false)}
                className="rounded px-2 py-1 text-xs text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-800"
              >
                Cancel
              </button>
              <button
                onClick={() => {
                  setShowKillConfirm(false);
                  void handleKill();
                }}
                className="rounded bg-red-600 px-2 py-1 text-xs font-medium text-white hover:bg-red-500"
              >
                Confirm Kill
              </button>
            </>
          ) : (
            <button
              onClick={() => setShowKillConfirm(true)}
              className="rounded border border-red-300 px-2 py-1 text-xs font-medium text-red-600 hover:bg-red-50 dark:border-red-800 dark:text-red-400 dark:hover:bg-red-950/30"
            >
              Kill
            </button>
          )}
        </div>
      </div>

      {/* Stuck warning */}
      {session.status === "stuck" && (
        <div className="flex shrink-0 items-center gap-2 border-b border-orange-200 bg-orange-50 px-4 py-2 dark:border-orange-800/60 dark:bg-orange-950/30">
          <span className="text-xs font-medium text-orange-700 dark:text-orange-400">
            ⚠ Session stuck — no output for 20+ minutes
          </span>
        </div>
      )}

      {/* Interrupted warning */}
      {session.status === "interrupted" && (
        <div className="flex shrink-0 items-center gap-2 border-b border-amber-200 bg-amber-50 px-4 py-2 dark:border-amber-800/60 dark:bg-amber-950/30">
          <span className="text-xs font-medium text-amber-700 dark:text-amber-400">
            ⚠ Session interrupted — the app was restarted while this session was active. Click
            Resume to continue.
          </span>
        </div>
      )}

      {/* Main IDE area */}
      <div className="flex flex-1 overflow-hidden">
        {/* Center panel */}
        <div className="flex flex-1 flex-col overflow-hidden">
          {/* Unified tab bar */}
          <EditorTabs
            terminalActive={centerTab === "terminal"}
            onSelectTerminal={() => setCenterTab("terminal")}
            sessionStatus={session.status}
            hasGitHubTab={hasGitHubLink}
            githubActive={centerTab === "github"}
            onSelectGitHub={() => setCenterTab("github")}
            githubLabel={
              session.linkedIssue
                ? `Issue #${session.linkedIssue.number}`
                : session.linkedPR
                  ? `PR #${session.linkedPR.number}`
                  : undefined
            }
          />

          {/* Content area — all panels use absolute positioning + visibility toggle
              to avoid layout overlap and keep xterm dimensions valid */}
          <div className="relative flex-1 overflow-hidden">
            {/* Terminal — always mounted, visibility toggled */}
            <div
              className={
                centerTab === "terminal"
                  ? "absolute inset-0 z-10"
                  : "invisible absolute inset-0 z-0"
              }
            >
              <TerminalPanel
                sessionId={session.id}
                sessionStatus={session.status}
                visible={centerTab === "terminal"}
              />
            </div>

            {/* GitHub detail view — absolute positioned like terminal */}
            <div
              className={
                centerTab === "github"
                  ? "absolute inset-0 z-10 overflow-auto"
                  : "invisible absolute inset-0 z-0"
              }
            >
              {hasGitHubLink && <GitHubDetailView issue={ghIssue} pr={ghPR} />}
            </div>

            {/* Code editor — absolute positioned like terminal */}
            <div
              className={showEditor ? "absolute inset-0 z-10" : "invisible absolute inset-0 z-0"}
            >
              {activeTab != null && activeContent != null && (
                <div className="h-full">
                  <CodeEditor
                    content={activeContent}
                    language={activeTab.language}
                    readOnly
                    darkMode
                  />
                </div>
              )}
            </div>

            {/* No file selected fallback */}
            {centerTab === "editor" && !showEditor && (
              <div className="absolute inset-0 z-10 flex items-center justify-center bg-[#0d1117]">
                <p className="text-sm text-gray-500">No file open</p>
              </div>
            )}
          </div>
        </div>

        {/* Right panel */}
        {!rightPanelCollapsed && (
          <>
            <ResizeHandle direction="horizontal" onResize={handleRightResize} />
            <div
              style={{ width: `${rightPanelWidth}px` }}
              className="flex shrink-0 flex-col overflow-hidden"
            >
              {/* Files / Changes */}
              <div className="flex-1 overflow-hidden">
                <RightPanel session={session} onCommitted={handleCommitted} />
              </div>
              {/* Shell terminal */}
              <ResizeHandle direction="vertical" onResize={handleOutputResize} />
              <div
                style={{ height: `${rightOutputHeight}px` }}
                className="shrink-0 overflow-hidden border-t border-gray-200 dark:border-gray-800"
              >
                <ShellPanel cwd={session.worktreePath ?? ""} shellKey={session.id} />
              </div>
            </div>
          </>
        )}
      </div>

      {/* PR Review Comments */}
      {session.linkedPR && (
        <div className="shrink-0 border-t border-gray-200 dark:border-gray-800">
          <ReviewComments repoId={session.repoId} prNumber={session.linkedPR.number} />
        </div>
      )}
    </div>
  );
}
