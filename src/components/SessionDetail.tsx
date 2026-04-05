import { useState, useCallback, useEffect, useRef } from "react";
import { timeAgo } from "../lib/utils";
import {
  killSession as tauriKillSession,
  resumeSession as tauriResumeSession,
  readSessionLog,
  generateRecap as tauriGenerateRecap,
  fetchIssues,
  fetchPRs,
  fetchCheckRuns,
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
import { STATUS_PILL, STATUS_DOT, RUNNING_PULSE, PR_STATE_PILL } from "../lib/statusColors";

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
  const [ciStatus, setCiStatus] = useState<"success" | "failure" | "pending" | null>(null);

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
    // Fetch CI status for the branch
    if (session.branch) {
      fetchCheckRuns(session.repoId, session.branch)
        .then((runs) => {
          if (runs.length === 0) return;
          const allPass = runs.every((r) => r.conclusion === "success");
          const anyFail = runs.some((r) => r.conclusion === "failure");
          setCiStatus(allPass ? "success" : anyFail ? "failure" : "pending");
        })
        .catch(() => {
          /* non-critical */
        });
    }
  }, [session?.repoId, session?.linkedIssue, session?.linkedPR, session?.branch]);

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
        <p className="text-on-surface-muted">Session not found.</p>
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
      <div className="flex shrink-0 items-center justify-between border-b border-outline bg-surface px-4 py-2">
        <div className="flex items-center gap-3">
          <button
            onClick={onBack}
            className="cursor-pointer text-xs text-on-surface-muted hover:text-on-surface focus:outline-none focus:ring-2 focus:ring-brand focus:ring-offset-1"
          >
            &larr; Board
          </button>
          <span className="text-on-surface-faint">|</span>
          <h1 className="text-sm font-semibold text-on-surface">{session.name}</h1>
          <span
            className={`flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium transition-colors duration-300 ${STATUS_PILL[session.status]}`}
          >
            <span
              className={`inline-block h-1.5 w-1.5 rounded-full ${STATUS_DOT[session.status] ?? "bg-gray-500"} ${session.status === "running" ? RUNNING_PULSE : ""}`}
            />
            {session.status}
          </span>
          {session.branch && (
            <span className="font-mono text-xs text-on-surface-muted">
              {session.branch}
            </span>
          )}
          <span className="text-xs text-on-surface-faint">
            {timeAgo(session.stateChangedAt)}
          </span>
          {/* PR state pill */}
          {ghPR && (
            <span
              className={`rounded-full px-1.5 py-0.5 text-xs font-medium ${PR_STATE_PILL[ghPR.state] ?? ""}`}
            >
              PR #{ghPR.number} {ghPR.state}
            </span>
          )}
          {/* CI status dot */}
          {ciStatus && (
            <span className="flex items-center gap-1">
              <span
                className={`h-2 w-2 rounded-full ${
                  ciStatus === "success"
                    ? "bg-green-500"
                    : ciStatus === "failure"
                      ? "bg-red-500"
                      : "bg-yellow-500"
                }`}
                title={`CI: ${ciStatus}`}
              />
              <span className="text-xs text-on-surface-faint">CI</span>
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          {session.status === "attention" && (
            <button
              onClick={() => {
                void handleResume();
              }}
              className="cursor-pointer rounded bg-brand px-2 py-1 text-xs font-medium text-white hover:bg-blue-500 active:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-brand focus:ring-offset-1"
            >
              Resume
            </button>
          )}
          {session.status === "attention" && recap && (
            <button
              onClick={() => {
                handleToggleRecap();
              }}
              className="cursor-pointer rounded border border-outline px-2 py-1 text-xs font-medium text-on-surface-muted hover:bg-hover active:bg-active focus:outline-none focus:ring-2 focus:ring-brand focus:ring-offset-1"
            >
              {centerTab === "recap" ? "Hide Recap" : "Show Recap"}
            </button>
          )}
          {showKillConfirm ? (
            <>
              <span className="text-xs text-danger">
                Kill &quot;{session.name}&quot;?
              </span>
              <button
                onClick={() => setShowKillConfirm(false)}
                className="cursor-pointer rounded px-2 py-1 text-xs text-on-surface-muted hover:bg-hover active:bg-active focus:outline-none focus:ring-2 focus:ring-brand focus:ring-offset-1"
              >
                Cancel
              </button>
              <button
                onClick={() => {
                  setShowKillConfirm(false);
                  void handleKill();
                }}
                className="cursor-pointer rounded bg-danger px-2 py-1 text-xs font-medium text-white hover:bg-red-500 active:bg-red-700 focus:outline-none focus:ring-2 focus:ring-danger focus:ring-offset-1"
              >
                Confirm Kill
              </button>
            </>
          ) : (
            <button
              onClick={() => setShowKillConfirm(true)}
              className="cursor-pointer rounded border border-danger/30 px-2 py-1 text-xs font-medium text-danger hover:bg-danger-muted active:bg-danger-muted focus:outline-none focus:ring-2 focus:ring-danger focus:ring-offset-1"
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
            hasLogTab={session.status === "attention"}
            logActive={centerTab === "log"}
            logLoading={logLoading}
            onSelectLog={() => {
              void handleViewLog();
            }}
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
                <p className="text-sm text-on-surface-muted">No file open</p>
              </div>
            )}

            {/* Full log panel */}
            {centerTab === "log" && fullLog && (
              <div className="absolute inset-0 z-10 overflow-y-auto bg-surface-sunken px-4 py-3">
                <pre className="whitespace-pre-wrap font-mono text-xs leading-5 text-on-surface">
                  {fullLog}
                </pre>
              </div>
            )}

            {/* Recap panel */}
            {centerTab === "recap" && (
              <div className="absolute inset-0 z-10 overflow-y-auto bg-surface px-6 py-4">
                <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-on-surface-faint">
                  Session Recap
                </h3>
                {recapLoading && (
                  <p className="text-sm text-on-surface-muted">
                    Generating recap…
                  </p>
                )}
                {recapError && (
                  <div className="space-y-2">
                    <p className="text-sm text-danger">
                      {recapError}
                    </p>
                    <button
                      className="rounded bg-hover px-3 py-1 text-xs text-on-surface hover:bg-active"
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
                  <p className="whitespace-pre-wrap text-sm leading-relaxed text-on-surface">
                    {recap}
                  </p>
                )}
                {!recap && !recapLoading && !recapError && (
                  <button
                    className="rounded bg-brand px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
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
              <div className="absolute inset-0 z-10 overflow-hidden bg-surface">
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
                <RightPanel session={session} />
              </div>
              {/* Shell terminal */}
              <ResizeHandle direction="vertical" onResize={handleOutputResize} />
              <div
                style={{ height: `${rightOutputHeight}px` }}
                className="shrink-0 overflow-hidden border-t border-outline"
              >
                <ShellPanel cwd={session.worktreePath ?? ""} shellKey={session.id} />
              </div>
            </div>
          </>
        )}
      </div>

      {/* PR Review Comments */}
      {session.linkedPR && (
        <div className="min-h-0 shrink border-t border-outline">
          <ReviewComments repoId={session.repoId} prNumber={session.linkedPR.number} />
        </div>
      )}
    </div>
  );
}
