import { useState, useCallback, useEffect, useRef } from "react";
import { timeAgo } from "../lib/utils";
import { killSession as tauriKillSession } from "../lib/tauri";
import { useSessionStore } from "../stores/sessionStore";
import { useEditorStore } from "../stores/editorStore";
import { useUIStore } from "../stores/uiStore";
import { TerminalPanel } from "./TerminalPanel";
import { CodeEditor } from "./CodeEditor";
import { EditorTabs } from "./EditorTabs";
import { RightPanel } from "./RightPanel";
import { ResizeHandle } from "./ResizeHandle";
import { ReviewComments } from "./ReviewComments";

const STATUS_PILL: Record<string, string> = {
  waiting: "bg-red-500/20 text-red-600 ring-1 ring-red-500/30 dark:text-red-400",
  running: "bg-green-500/20 text-green-600 ring-1 ring-green-500/30 dark:text-green-400",
  idle: "bg-gray-500/20 text-gray-500 ring-1 ring-gray-500/30 dark:text-gray-400",
  done: "bg-gray-200/60 text-gray-500 ring-1 ring-gray-300/30 dark:bg-gray-700/40 dark:text-gray-500 dark:ring-gray-600/30",
  completed: "bg-green-200/60 text-green-600 ring-1 ring-green-300/30 dark:bg-green-900/30 dark:text-green-400 dark:ring-green-700/30",
  failed: "bg-red-200/60 text-red-600 ring-1 ring-red-300/30 dark:bg-red-900/30 dark:text-red-400 dark:ring-red-700/30",
  paused: "bg-gray-400/20 text-gray-500 ring-1 ring-gray-400/30 dark:text-gray-400",
  stuck: "bg-orange-500/20 text-orange-600 ring-1 ring-orange-500/30 dark:text-orange-400",
};

interface SessionDetailProps {
  sessionId: string;
  onBack: () => void;
}

export function SessionDetail({ sessionId, onBack }: SessionDetailProps) {
  const session = useSessionStore((s) => s.sessions.find((x) => x.id === sessionId));
  const updateSession = useSessionStore((s) => s.updateSession);
  const removeSession = useSessionStore((s) => s.removeSession);

  const activeTabId = useEditorStore((s) => s.activeTabId);
  const contents = useEditorStore((s) => s.contents);
  const tabs = useEditorStore((s) => s.tabs);
  const rightPanelWidth = useUIStore((s) => s.panelSizes.rightPanelWidth);
  const rightPanelCollapsed = useUIStore((s) => s.rightPanelCollapsed);
  const setPanelSize = useUIStore((s) => s.setPanelSize);

  const [hasCommitted, setHasCommitted] = useState(false);
  const [showKillConfirm, setShowKillConfirm] = useState(false);
  // "terminal" means Claude tab is active; otherwise activeTabId from editor store
  const [centerTab, setCenterTab] = useState<"terminal" | "editor">("terminal");

  // When a file tab is clicked in EditorTabs (which calls store.setActiveTab),
  // automatically switch center panel to editor mode
  const prevTabId = useRef(activeTabId);
  useEffect(() => {
    if (activeTabId && activeTabId !== prevTabId.current) {
      setCenterTab("editor");
    }
    // If all tabs closed, switch back to terminal
    if (!activeTabId && tabs.length === 0) {
      setCenterTab("terminal");
    }
    prevTabId.current = activeTabId;
  }, [activeTabId, tabs.length]);

  const handleRightResize = useCallback(
    (delta: number) => {
      const clamped = Math.max(200, Math.min(600, rightPanelWidth - delta));
      setPanelSize("rightPanelWidth", clamped);
    },
    [rightPanelWidth, setPanelSize],
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
      removeSession(session.id);
      onBack();
    } catch (err: unknown) {
      console.error("[SessionDetail] Failed to kill session:", err);
    }
  }

  function handleCommitted() {
    if (!session) return;
    setHasCommitted(true);
    updateSession(session.id, { status: "done", stateChangedAt: Date.now() });
  }

  function handleSelectTerminal() {
    setCenterTab("terminal");
  }

  const isTerminalActive = centerTab === "terminal";
  const activeTab = tabs.find((t) => t.id === activeTabId);
  const activeContent = activeTabId ? contents[activeTabId] : null;
  const showEditor = !isTerminalActive && activeTab != null && activeContent != null;

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

      {/* Main IDE area */}
      <div className="flex flex-1 overflow-hidden">
        {/* Center panel: unified tab bar + content */}
        <div className="flex flex-1 flex-col overflow-hidden">
          {/* Unified tab bar: Claude (pinned) + file tabs */}
          <EditorTabs
            terminalActive={isTerminalActive}
            onSelectTerminal={handleSelectTerminal}
            sessionStatus={session.status}
          />

          {/* Content area */}
          <div className="flex-1 overflow-hidden">
            {/* Terminal is always mounted but hidden when not active, to preserve state */}
            <div className={isTerminalActive ? "h-full" : "hidden"}>
              <TerminalPanel sessionId={session.id} sessionStatus={session.status} />
            </div>

            {/* Code editor shown when a file tab is active */}
            {showEditor && (
              <div className={!isTerminalActive ? "h-full" : "hidden"}>
                <CodeEditor
                  content={activeContent}
                  language={activeTab.language}
                  readOnly
                  darkMode
                />
              </div>
            )}

            {/* No file selected fallback */}
            {!isTerminalActive && !showEditor && (
              <div className="flex h-full items-center justify-center bg-[#0d1117]">
                <p className="text-sm text-gray-500">No file open</p>
              </div>
            )}
          </div>
        </div>

        {/* Right panel resize handle + right panel */}
        {!rightPanelCollapsed && (
          <>
            <ResizeHandle direction="horizontal" onResize={handleRightResize} />
            <div style={{ width: `${rightPanelWidth}px` }} className="shrink-0 overflow-hidden">
              <RightPanel
                session={session}
                onCommitted={handleCommitted}
                hasCommitted={hasCommitted}
              />
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
