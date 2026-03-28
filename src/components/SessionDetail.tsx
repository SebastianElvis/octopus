import { useState, useCallback, useEffect, useRef } from "react";
import { timeAgo } from "../lib/utils";
import {
  killSession as tauriKillSession,
  resumeSession as tauriResumeSession,
  readSessionLog,
  generateRecap as tauriGenerateRecap,
  getDiff,
  fetchIssues,
  fetchPRs,
} from "../lib/tauri";
import { useSessionStore } from "../stores/sessionStore";
import { useEditorStore } from "../stores/editorStore";
import { useUIStore } from "../stores/uiStore";
import { ClaudeOutputPanel } from "./claude/ClaudeOutputPanel";
import { AnalyticsPanel } from "./claude/AnalyticsPanel";
import { CodeEditor } from "./CodeEditor";
import { DiffViewer } from "./DiffViewer";
import { EditorTabs } from "./EditorTabs";
import { RightPanel } from "./RightPanel";
import { ResizeHandle } from "./ResizeHandle";
import { ReviewComments } from "./ReviewComments";
import { GitHubDetailView } from "./GitHubDetailView";
import { ShellPanel } from "./ShellPanel";
import type { GitHubIssue, GitHubPR } from "../lib/types";
import { STATUS_PILL, STATUS_DOT, RUNNING_PULSE } from "../lib/statusColors";

type CenterTab = "claude" | "editor" | "github" | "log" | "recap" | "analytics";

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
  const [centerTab, setCenterTab] = useState<CenterTab>("claude");

  // GitHub data for the detail tab
  const [ghIssue, setGhIssue] = useState<GitHubIssue | null>(null);
  const [ghPR, setGhPR] = useState<GitHubPR | null>(null);

  // Recap state
  const [recap, setRecap] = useState<string | null>(null);
  const [recapLoading, setRecapLoading] = useState(false);
  const [recapError, setRecapError] = useState<string | null>(null);

  // Full log state
  const [fullLog, setFullLog] = useState<string | null>(null);
  const [logLoading, setLogLoading] = useState(false);

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
  const prevTabIdRef = useRef(activeTabId);
  useEffect(() => {
    if (activeTabId !== prevTabIdRef.current) {
      prevTabIdRef.current = activeTabId;
      if (activeTabId) {
        setCenterTab("editor");
      }
      if (!activeTabId && tabs.length === 0 && centerTab === "editor") {
        setCenterTab("claude");
      }
    }
  }, [activeTabId, tabs.length, centerTab, setCenterTab]);

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

  function handleToggleRecap() {
    if (!session) return;
    if (recap) {
      setCenterTab(centerTab === "recap" ? "claude" : "recap");
    }
  }

  async function handleViewLog() {
    if (!session) return;
    if (fullLog) {
      setCenterTab(centerTab === "log" ? "claude" : "log");
      return;
    }
    setLogLoading(true);
    try {
      const log = await readSessionLog(session.id);
      setFullLog(log);
      setCenterTab("log");
    } catch (err: unknown) {
      console.error("[SessionDetail] Failed to read log:", err);
    } finally {
      setLogLoading(false);
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
            className="cursor-pointer text-xs text-gray-500 hover:text-gray-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-1 dark:text-gray-500 dark:hover:text-gray-300"
          >
            &larr; Board
          </button>
          <span className="text-gray-300 dark:text-gray-700">|</span>
          <h1 className="text-sm font-semibold text-gray-900 dark:text-gray-100">{session.name}</h1>
          <span
            className={`flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium transition-colors duration-300 ${STATUS_PILL[session.status]}`}
          >
            <span
              className={`inline-block h-1.5 w-1.5 rounded-full ${STATUS_DOT[session.status] ?? "bg-gray-500"} ${session.status === "running" ? RUNNING_PULSE : ""}`}
            />
            {session.status}
          </span>
          {session.branch && (
            <span className="font-mono text-xs text-gray-500 dark:text-gray-400">
              {session.branch}
            </span>
          )}
          <span className="text-xs text-gray-400 dark:text-gray-500">
            {timeAgo(session.stateChangedAt)}
          </span>
        </div>
        <div className="flex items-center gap-2">
          {session.status === "attention" && (
            <button
              onClick={() => {
                void handleResume();
              }}
              className="cursor-pointer rounded bg-blue-600 px-2 py-1 text-xs font-medium text-white hover:bg-blue-500 active:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-1"
            >
              Resume
            </button>
          )}
          {session.status === "attention" && (
            <button
              onClick={() => {
                void handleViewLog();
              }}
              disabled={logLoading}
              className="cursor-pointer rounded border border-gray-300 px-2 py-1 text-xs font-medium text-gray-600 hover:bg-gray-50 active:bg-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-1 disabled:cursor-not-allowed disabled:opacity-50 dark:border-gray-700 dark:text-gray-400 dark:hover:bg-gray-800 dark:active:bg-gray-700"
            >
              {logLoading ? "Loading..." : centerTab === "log" ? "Hide Log" : "View Full Log"}
            </button>
          )}
          {session.status === "attention" && recap && (
            <button
              onClick={() => {
                handleToggleRecap();
              }}
              className="cursor-pointer rounded border border-gray-300 px-2 py-1 text-xs font-medium text-gray-600 hover:bg-gray-50 active:bg-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-1 dark:border-gray-700 dark:text-gray-400 dark:hover:bg-gray-800 dark:active:bg-gray-700"
            >
              {centerTab === "recap" ? "Hide Recap" : "Show Recap"}
            </button>
          )}
          {session.worktreePath && (
            <button
              onClick={() => {
                void getDiff(session.worktreePath!).then((patch) => {
                  void navigator.clipboard.writeText(patch);
                });
              }}
              className="cursor-pointer rounded border border-gray-300 px-2 py-1 text-xs font-medium text-gray-600 hover:bg-gray-50 active:bg-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-1 dark:border-gray-700 dark:text-gray-400 dark:hover:bg-gray-800 dark:active:bg-gray-700"
              title="Copy git diff to clipboard"
            >
              Save Patch
            </button>
          )}
          {showKillConfirm ? (
            <>
              <span className="text-xs text-red-600 dark:text-red-400">
                Kill &quot;{session.name}&quot;?
              </span>
              <button
                onClick={() => setShowKillConfirm(false)}
                className="cursor-pointer rounded px-2 py-1 text-xs text-gray-500 hover:bg-gray-100 active:bg-gray-200 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-1 dark:hover:bg-gray-800 dark:active:bg-gray-700"
              >
                Cancel
              </button>
              <button
                onClick={() => {
                  setShowKillConfirm(false);
                  void handleKill();
                }}
                className="cursor-pointer rounded bg-red-600 px-2 py-1 text-xs font-medium text-white hover:bg-red-500 active:bg-red-700 focus:outline-none focus:ring-2 focus:ring-red-500 focus:ring-offset-1"
              >
                Confirm Kill
              </button>
            </>
          ) : (
            <button
              onClick={() => setShowKillConfirm(true)}
              className="cursor-pointer rounded border border-red-300 px-2 py-1 text-xs font-medium text-red-600 hover:bg-red-50 active:bg-red-100 focus:outline-none focus:ring-2 focus:ring-red-500 focus:ring-offset-1 dark:border-red-800 dark:text-red-400 dark:hover:bg-red-950/30 dark:active:bg-red-950/50"
            >
              Kill
            </button>
          )}
        </div>
      </div>

      {/* Main IDE area */}
      <div className="flex flex-1 overflow-hidden">
        {/* Center panel */}
        <div className="flex flex-1 flex-col overflow-hidden">
          {/* Unified tab bar */}
          <EditorTabs
            claudeActive={centerTab === "claude"}
            onSelectClaude={() => setCenterTab("claude")}
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
            hasLogTab={fullLog !== null}
            logActive={centerTab === "log"}
            onSelectLog={() => setCenterTab("log")}
            hasRecapTab={recap !== null}
            recapActive={centerTab === "recap"}
            onSelectRecap={() => setCenterTab("recap")}
            analyticsActive={centerTab === "analytics"}
            onSelectAnalytics={() => setCenterTab("analytics")}
          />

          {/* Content area — all panels use absolute positioning + visibility toggle
              to avoid layout overlap and keep xterm dimensions valid */}
          <div className="relative flex-1 overflow-hidden">
            {/* Claude output — structured view, primary tab */}
            <div
              className={
                centerTab === "claude" ? "absolute inset-0 z-10" : "invisible absolute inset-0 z-0"
              }
            >
              <ClaudeOutputPanel
                sessionId={session.id}
                sessionStatus={session.status}
                blockType={session.blockType}
                lastMessage={session.lastMessage}
                visible={centerTab === "claude"}
                prompt={session.prompt}
              />
            </div>

            {/* GitHub detail view */}
            <div
              className={
                centerTab === "github"
                  ? "absolute inset-0 z-10 overflow-auto"
                  : "invisible absolute inset-0 z-0"
              }
            >
              {hasGitHubLink && <GitHubDetailView issue={ghIssue} pr={ghPR} />}
            </div>

            {/* Code editor / diff viewer — absolute positioned like terminal */}
            <div
              className={showEditor ? "absolute inset-0 z-10" : "invisible absolute inset-0 z-0"}
            >
              {activeTab != null && activeContent != null && (
                <div className="h-full">
                  {activeTab.isDiff ? (
                    <DiffViewer diff={activeContent} filePath={activeTab.filePath} />
                  ) : (
                    <CodeEditor
                      content={activeContent}
                      language={activeTab.language}
                      readOnly
                      darkMode
                    />
                  )}
                </div>
              )}
            </div>

            {/* No file selected fallback */}
            {centerTab === "editor" && !showEditor && (
              <div className="absolute inset-0 z-10 flex items-center justify-center bg-[#0d1117]">
                <p className="text-sm text-gray-500">No file open</p>
              </div>
            )}

            {/* Full log panel */}
            {centerTab === "log" && fullLog && (
              <div className="absolute inset-0 z-10 overflow-y-auto bg-gray-900 px-4 py-3">
                <pre className="whitespace-pre-wrap font-mono text-xs leading-5 text-gray-300">
                  {fullLog}
                </pre>
              </div>
            )}

            {/* Recap panel */}
            {centerTab === "recap" && (
              <div className="absolute inset-0 z-10 overflow-y-auto bg-white px-6 py-4 dark:bg-gray-950">
                <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-400 dark:text-gray-500">
                  Session Recap
                </h3>
                {recapLoading && (
                  <p className="text-sm text-gray-500 dark:text-gray-400">
                    Generating recap…
                  </p>
                )}
                {recapError && (
                  <div className="space-y-2">
                    <p className="text-sm text-red-600 dark:text-red-400">
                      {recapError}
                    </p>
                    <button
                      className="rounded bg-gray-100 px-3 py-1 text-xs text-gray-700 hover:bg-gray-200 dark:bg-gray-800 dark:text-gray-300 dark:hover:bg-gray-700"
                      onClick={() => {
                        setRecapError(null);
                        setRecapLoading(true);
                        void tauriGenerateRecap(session.id)
                          .then(setRecap)
                          .catch((e: unknown) =>
                            setRecapError(
                              e instanceof Error ? e.message : "Failed to generate recap",
                            ),
                          )
                          .finally(() => setRecapLoading(false));
                      }}
                    >
                      Retry
                    </button>
                  </div>
                )}
                {recap && (
                  <p className="whitespace-pre-wrap text-sm leading-relaxed text-gray-700 dark:text-gray-300">
                    {recap}
                  </p>
                )}
                {!recap && !recapLoading && !recapError && (
                  <button
                    className="rounded bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
                    onClick={() => {
                      setRecapLoading(true);
                      void tauriGenerateRecap(session.id)
                        .then(setRecap)
                        .catch((e: unknown) =>
                          setRecapError(
                            e instanceof Error ? e.message : "Failed to generate recap",
                          ),
                        )
                        .finally(() => setRecapLoading(false));
                    }}
                  >
                    Generate Recap
                  </button>
                )}
              </div>
            )}

            {/* Analytics panel */}
            {centerTab === "analytics" && (
              <div className="absolute inset-0 z-10 overflow-hidden bg-white dark:bg-gray-950">
                <AnalyticsPanel sessionId={session.id} sessionStatus={session.status} />
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
