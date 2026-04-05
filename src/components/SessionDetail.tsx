import { useState, useCallback, useEffect } from "react";
import { timeAgo } from "../lib/utils";
import {
  killSession as tauriKillSession,
  resumeSession as tauriResumeSession,
  retrySession,
  readSessionLog,
  generateRecap,
  fetchIssues,
  fetchPRs,
  replyToSession,
  saveSessionImage,
} from "../lib/tauri";
import { formatError } from "../lib/errors";
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
import { STATUS_PILL, STATUS_DOT, RUNNING_PULSE } from "../lib/statusColors";
import { matchesKeybindingById } from "../lib/keybindings";
import { useImageAttachments } from "../hooks/useImageAttachments";
import { ImagePreview } from "./ImagePreview";

type CenterTab = "terminal" | "editor" | "github";

interface SessionDetailProps {
  sessionId: string;
  onBack: () => void;
}

export function SessionDetail({ sessionId, onBack }: SessionDetailProps) {
  const session = useSessionStore((s) => s.sessions.find((x) => x.id === sessionId));
  const updateSession = useSessionStore((s) => s.updateSession);
  const outputBuffer = useSessionStore((s) => s.outputBuffers[sessionId] ?? []);

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

  // Recap state
  const [recap, setRecap] = useState<string | null>(null);
  const [recapLoading, setRecapLoading] = useState(false);
  const [showRecap, setShowRecap] = useState(false);

  // Full log state
  const [fullLog, setFullLog] = useState<string | null>(null);
  const [showFullLog, setShowFullLog] = useState(false);
  const [logLoading, setLogLoading] = useState(false);

  // Reply state for waiting sessions
  const [replyText, setReplyText] = useState("");
  const [replying, setReplying] = useState(false);
  const [replyError, setReplyError] = useState<string | null>(null);

  // Image attachment state
  const {
    images: attachedImages,
    removeImage,
    clearImages,
    handlePaste: onImagePaste,
    handleDrop: onImageDrop,
    handleDragOver: onImageDragOver,
  } = useImageAttachments();

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

  async function handleRetry() {
    if (!session) return;
    try {
      await retrySession(session.id);
    } catch (err: unknown) {
      console.error("[SessionDetail] Failed to retry session:", err);
    }
  }

  async function handleGenerateRecap() {
    if (!session || recap) {
      setShowRecap(!showRecap);
      return;
    }
    setRecapLoading(true);
    try {
      const result = await generateRecap(session.id);
      setRecap(result);
      setShowRecap(true);
    } catch (err: unknown) {
      console.error("[SessionDetail] Failed to generate recap:", err);
    } finally {
      setRecapLoading(false);
    }
  }

  async function handleViewLog() {
    if (!session) return;
    if (fullLog) {
      setShowFullLog(!showFullLog);
      return;
    }
    setLogLoading(true);
    try {
      const log = await readSessionLog(session.id);
      setFullLog(log);
      setShowFullLog(true);
    } catch (err: unknown) {
      console.error("[SessionDetail] Failed to read log:", err);
    } finally {
      setLogLoading(false);
    }
  }

  async function handleReply() {
    if (!session || (!replyText.trim() && attachedImages.length === 0)) return;
    setReplying(true);
    setReplyError(null);
    try {
      // Save attached images and collect their paths
      const imagePaths: string[] = [];
      for (const img of attachedImages) {
        const path = await saveSessionImage(session.id, img.name, img.base64);
        imagePaths.push(path);
      }

      // Build the message with image references
      let message = replyText.trim();
      if (imagePaths.length > 0) {
        const imageRefs = imagePaths.map((p) => `[Attached image: ${p}]`).join("\n");
        message = message ? `${imageRefs}\n\n${message}` : imageRefs;
      }

      await replyToSession(session.id, message);
      setReplyText("");
      clearImages();
    } catch (err: unknown) {
      setReplyError(formatError(err));
    } finally {
      setReplying(false);
    }
  }

  const activeTab = tabs.find((t) => t.id === activeTabId);
  const activeContent = activeTabId ? contents[activeTabId] : null;
  const showEditor = centerTab === "editor" && activeTab != null && activeContent != null;

  // Last few lines of output for waiting sessions
  const lastOutputLines = outputBuffer.slice(-10);

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
          {session.status === "interrupted" && (
            <button
              onClick={() => {
                void handleResume();
              }}
              className="cursor-pointer rounded bg-blue-600 px-2 py-1 text-xs font-medium text-white hover:bg-blue-500 active:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-1"
            >
              Resume
            </button>
          )}
          {(session.status === "failed" || session.status === "stuck") && (
            <button
              onClick={() => {
                void handleRetry();
              }}
              className="cursor-pointer rounded bg-blue-600 px-2 py-1 text-xs font-medium text-white hover:bg-blue-500 active:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-1"
            >
              Retry
            </button>
          )}
          {(session.status === "failed" || session.status === "stuck") && (
            <button
              onClick={() => {
                void handleViewLog();
              }}
              disabled={logLoading}
              className="cursor-pointer rounded border border-gray-300 px-2 py-1 text-xs font-medium text-gray-600 hover:bg-gray-50 active:bg-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-1 disabled:cursor-not-allowed disabled:opacity-50 dark:border-gray-700 dark:text-gray-400 dark:hover:bg-gray-800 dark:active:bg-gray-700"
            >
              {logLoading ? "Loading..." : "View Full Log"}
            </button>
          )}
          {session.status === "waiting" && (
            <button
              onClick={() => {
                void handleGenerateRecap();
              }}
              disabled={recapLoading}
              className="cursor-pointer rounded border border-gray-300 px-2 py-1 text-xs font-medium text-gray-600 hover:bg-gray-50 active:bg-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-1 disabled:cursor-not-allowed disabled:opacity-50 dark:border-gray-700 dark:text-gray-400 dark:hover:bg-gray-800 dark:active:bg-gray-700"
            >
              {recapLoading
                ? "Generating..."
                : recap
                  ? showRecap
                    ? "Hide Recap"
                    : "Show Recap"
                  : "Generate Recap"}
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

      {/* Stuck warning */}
      {session.status === "stuck" && (
        <div className="flex shrink-0 items-center gap-2 border-b border-orange-200 bg-orange-50 px-4 py-2 dark:border-orange-800/60 dark:bg-orange-950/30">
          <span className="text-xs font-medium text-orange-700 dark:text-orange-400">
            Session stuck -- no output for 20+ minutes
          </span>
        </div>
      )}

      {/* Interrupted warning */}
      {session.status === "interrupted" && (
        <div className="flex shrink-0 items-center gap-2 border-b border-amber-200 bg-amber-50 px-4 py-2 dark:border-amber-800/60 dark:bg-amber-950/30">
          <span className="text-xs font-medium text-amber-700 dark:text-amber-400">
            Session interrupted -- the app was restarted while this session was active. Click Resume
            to continue.
          </span>
        </div>
      )}

      {/* Recap panel */}
      {showRecap && recap && (
        <div className="shrink-0 border-b border-blue-200 bg-blue-50 px-4 py-3 dark:border-blue-800/60 dark:bg-blue-950/20">
          <h3 className="mb-1 text-xs font-semibold text-blue-700 dark:text-blue-400">
            Session Recap
          </h3>
          <p className="whitespace-pre-wrap text-xs leading-relaxed text-gray-700 dark:text-gray-300">
            {recap}
          </p>
        </div>
      )}

      {/* Full log panel */}
      {showFullLog && fullLog && (
        <div className="max-h-60 shrink-0 overflow-y-auto border-b border-gray-200 bg-gray-900 px-4 py-3 dark:border-gray-700">
          <div className="flex items-center justify-between">
            <h3 className="mb-1 text-xs font-semibold text-gray-400">Full Log</h3>
            <button
              onClick={() => setShowFullLog(false)}
              className="cursor-pointer text-xs text-gray-500 hover:text-gray-300 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-1"
            >
              Close
            </button>
          </div>
          <pre className="whitespace-pre-wrap font-mono text-xs leading-5 text-gray-300">
            {fullLog}
          </pre>
        </div>
      )}

      {/* Waiting session reply panel */}
      {session.status === "waiting" && (
        <div className="shrink-0 border-b border-red-200 bg-red-50/50 px-4 py-3 dark:border-red-800/40 dark:bg-red-950/10">
          {/* Recent output context */}
          {lastOutputLines.length > 0 && (
            <div className="mb-2 max-h-32 overflow-y-auto rounded bg-gray-900 px-3 py-2">
              <pre className="font-mono text-xs leading-5 text-gray-300">
                {lastOutputLines.join("")}
              </pre>
            </div>
          )}
          <div
            onDrop={(e) => {
              void onImageDrop(e);
            }}
            onDragOver={onImageDragOver}
          >
            <ImagePreview images={attachedImages} onRemove={removeImage} />
            <div className="flex gap-2">
              <textarea
                value={replyText}
                onChange={(e) => setReplyText(e.target.value)}
                onPaste={(e) => {
                  void onImagePaste(e);
                }}
                onKeyDown={(e) => {
                  if (matchesKeybindingById(e.nativeEvent, "send-reply")) {
                    e.preventDefault();
                    void handleReply();
                    return;
                  }
                  // Alt+Enter or Ctrl+J → insert newline
                  if (
                    matchesKeybindingById(e.nativeEvent, "newline-alt") ||
                    matchesKeybindingById(e.nativeEvent, "newline-ctrl-j")
                  ) {
                    e.preventDefault();
                    const textarea = e.currentTarget;
                    const { selectionStart, selectionEnd } = textarea;
                    const val = textarea.value;
                    const newVal = val.slice(0, selectionStart) + "\n" + val.slice(selectionEnd);
                    setReplyText(newVal);
                    // Move cursor after the inserted newline on next tick
                    requestAnimationFrame(() => {
                      textarea.selectionStart = textarea.selectionEnd = selectionStart + 1;
                    });
                  }
                }}
                placeholder="Reply to session... (Cmd+Enter to send, paste images with Cmd+V)"
                rows={2}
                className="flex-1 resize-none rounded border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 placeholder-gray-400 outline-none focus:border-blue-500 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-100 dark:placeholder-gray-500"
              />
              <button
                onClick={() => {
                  void handleReply();
                }}
                disabled={replying || (!replyText.trim() && attachedImages.length === 0)}
                className="cursor-pointer self-end rounded bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-500 active:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-1 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {replying ? "..." : "Send"}
              </button>
            </div>
          </div>
          {replyError && (
            <p className="mt-1 text-xs text-red-600 dark:text-red-400">{replyError}</p>
          )}
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
