import { useState } from "react";
import type { Session } from "../lib/types";
import { timeAgo } from "../lib/utils";
import {
  replyToSession,
  interruptSession,
  killSession as tauriKillSession,
  pauseSession as tauriPauseSession,
  resumeSession as tauriResumeSession,
} from "../lib/tauri";
import { useSessionStore } from "../stores/sessionStore";
import { formatError } from "../lib/errors";
import { DiffPanel } from "./DiffPanel";
import { TerminalPanel } from "./TerminalPanel";
import { GitHubSidebar } from "./GitHubSidebar";
import { ReviewComments } from "./ReviewComments";

const STATUS_PILL: Record<string, string> = {
  waiting: "bg-red-500/20 text-red-600 ring-1 ring-red-500/30 dark:text-red-400",
  running: "bg-green-500/20 text-green-600 ring-1 ring-green-500/30 dark:text-green-400",
  idle: "bg-gray-500/20 text-gray-500 ring-1 ring-gray-500/30 dark:text-gray-400",
  done: "bg-gray-200/60 text-gray-500 ring-1 ring-gray-300/30 dark:bg-gray-700/40 dark:text-gray-500 dark:ring-gray-600/30",
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

  const [replyText, setReplyText] = useState("");
  const [interruptText, setInterruptText] = useState("");
  const [sending, setSending] = useState(false);
  const [sendError, setSendError] = useState<string | null>(null);
  const [hasCommitted, setHasCommitted] = useState(false);
  const [showKillConfirm, setShowKillConfirm] = useState(false);

  if (!session) {
    return (
      <div className="flex h-full items-center justify-center">
        <p className="text-gray-500">Session not found.</p>
      </div>
    );
  }

  async function handleReply() {
    if (!replyText.trim() || !session) return;
    setSending(true);
    setSendError(null);
    try {
      await replyToSession(session.id, replyText.trim());
      setReplyText("");
      updateSession(session.id, { status: "running", stateChangedAt: Date.now() });
    } catch (err: unknown) {
      setSendError(formatError(err));
    } finally {
      setSending(false);
    }
  }

  async function handleInterrupt() {
    if (!session) return;
    try {
      await interruptSession(session.id, interruptText.trim() || undefined);
      setInterruptText("");
      // Session continues running after interrupt — don't change status
    } catch (err: unknown) {
      console.error("[SessionDetail] Failed to interrupt session:", formatError(err));
    }
  }

  async function handleKill() {
    if (!session) return;
    try {
      await tauriKillSession(session.id);
      removeSession(session.id);
      onBack();
    } catch (err: unknown) {
      console.error("[SessionDetail] Failed to kill session:", formatError(err));
    }
  }

  function handleCommitted() {
    if (!session) return;
    setHasCommitted(true);
    updateSession(session.id, { status: "done", stateChangedAt: Date.now() });
  }

  async function handlePause() {
    if (!session) return;
    try {
      await tauriPauseSession(session.id);
      updateSession(session.id, { status: "paused", stateChangedAt: Date.now() });
    } catch (err: unknown) {
      console.error("[SessionDetail] Failed to pause session:", formatError(err));
    }
  }

  async function handleResume() {
    if (!session) return;
    try {
      await tauriResumeSession(session.id);
      updateSession(session.id, { status: "running", stateChangedAt: Date.now() });
    } catch (err: unknown) {
      console.error("[SessionDetail] Failed to resume session:", formatError(err));
    }
  }

  return (
    <div className="flex flex-col gap-6">
      {/* Breadcrumb */}
      <div className="flex items-center gap-2 text-sm">
        <button
          onClick={onBack}
          className="text-gray-500 hover:text-gray-700 dark:text-gray-500 dark:hover:text-gray-300"
        >
          Board
        </button>
        <span className="text-gray-400 dark:text-gray-700">/</span>
        <span className="text-gray-900 dark:text-gray-100">{session.name}</span>
      </div>

      {/* Session header */}
      <SessionHeader
        session={session}
        interruptText={interruptText}
        onInterruptTextChange={setInterruptText}
        onInterrupt={() => {
          void handleInterrupt();
        }}
        onPause={() => {
          void handlePause();
        }}
        onResume={() => {
          void handleResume();
        }}
        onKill={() => setShowKillConfirm(true)}
      />

      {/* Kill confirmation dialog */}
      {showKillConfirm && (
        <div className="flex items-center justify-between rounded-lg border border-red-200 bg-red-50 px-4 py-3 dark:border-red-800/60 dark:bg-red-950/30">
          <p className="text-sm text-red-700 dark:text-red-400">
            Kill this session? The process will be terminated and the worktree cleaned up.
          </p>
          <div className="flex gap-2">
            <button
              onClick={() => setShowKillConfirm(false)}
              className="rounded-md border border-gray-300 px-3 py-1.5 text-sm font-medium text-gray-600 hover:bg-gray-100 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-gray-800"
            >
              Cancel
            </button>
            <button
              onClick={() => {
                setShowKillConfirm(false);
                void handleKill();
              }}
              className="rounded-md bg-red-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-red-500"
            >
              Kill Session
            </button>
          </div>
        </div>
      )}

      {/* Stuck warning banner */}
      {session.status === "stuck" && (
        <div className="flex items-center gap-2 rounded-lg border border-orange-200 bg-orange-50 px-4 py-3 dark:border-orange-800/60 dark:bg-orange-950/30">
          <svg
            className="h-5 w-5 shrink-0 text-orange-500"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M12 9v2m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
            />
          </svg>
          <p className="text-sm font-medium text-orange-700 dark:text-orange-400">
            This session appears stuck — no output for more than 20 minutes.
          </p>
        </div>
      )}

      {/* Blocker banner */}
      {session.status === "waiting" && (
        <BlockerBanner
          session={session}
          replyText={replyText}
          onReplyChange={setReplyText}
          onSend={() => {
            void handleReply();
          }}
          sending={sending}
          error={sendError}
        />
      )}

      {/* Two-column layout */}
      <div className="grid grid-cols-[1fr_280px] gap-6">
        {/* Left column */}
        <div className="flex flex-col gap-4">
          <TerminalPanel sessionId={session.id} sessionStatus={session.status} />
          <DiffPanel
            worktreePath={session.worktreePath}
            sessionName={session.name}
            onCommitted={handleCommitted}
          />
        </div>

        {/* Right sidebar */}
        <GitHubSidebar
          repoId={session.repoId}
          linkedIssueNumber={session.linkedIssue?.number}
          linkedPRNumber={session.linkedPR?.number}
          branch={session.branch}
          sessionName={session.name}
          hasCommittedChanges={hasCommitted}
        />
      </div>

      {/* PR Review Comments */}
      {session.linkedPR && (
        <ReviewComments repoId={session.repoId} prNumber={session.linkedPR.number} />
      )}
    </div>
  );
}

function SessionHeader({
  session,
  interruptText,
  onInterruptTextChange,
  onInterrupt,
  onPause,
  onResume,
  onKill,
}: {
  session: Session;
  interruptText: string;
  onInterruptTextChange: (v: string) => void;
  onInterrupt: () => void;
  onPause: () => void;
  onResume: () => void;
  onKill: () => void;
}) {
  return (
    <div className="flex flex-col gap-3 rounded-lg border border-gray-200 bg-gray-50 px-5 py-4 dark:border-gray-800 dark:bg-gray-900">
      <div className="flex items-start justify-between">
        <div className="flex flex-col gap-1">
          <div className="flex items-center gap-3">
            <h1 className="text-lg font-semibold text-gray-900 dark:text-gray-100">{session.name}</h1>
            <span
              className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${STATUS_PILL[session.status]}`}
            >
              {session.status}
            </span>
          </div>
          <div className="flex items-center gap-3 text-sm text-gray-500">
            <span>{session.repo}</span>
            {session.branch && (
              <>
                <span className="text-gray-400 dark:text-gray-700">·</span>
                <span className="font-mono text-xs text-gray-500 dark:text-gray-400">
                  {session.branch}
                </span>
              </>
            )}
            <span className="text-gray-400 dark:text-gray-700">·</span>
            <span className="text-xs">{timeAgo(session.stateChangedAt)}</span>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {session.status === "running" && (
            <>
              <button
                onClick={onPause}
                className="rounded-md border border-gray-300 px-3 py-1.5 text-sm font-medium text-gray-600 hover:border-gray-400 hover:text-gray-900 dark:border-gray-700 dark:text-gray-300 dark:hover:border-gray-600 dark:hover:text-gray-100"
              >
                Pause
              </button>
              <button
                onClick={onInterrupt}
                className="rounded-md bg-yellow-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-yellow-500"
              >
                Interrupt
              </button>
            </>
          )}
          {session.status === "paused" && (
            <button
              onClick={onResume}
              className="rounded-md bg-blue-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-blue-500"
            >
              Resume
            </button>
          )}
          <button
            onClick={onKill}
            className="rounded-md border border-red-300 px-3 py-1.5 text-sm font-medium text-red-600 hover:border-red-400 hover:bg-red-50 dark:border-red-800 dark:text-red-400 dark:hover:border-red-700 dark:hover:bg-red-950/30"
          >
            Kill
          </button>
        </div>
      </div>

      {/* Interrupt message input — shown when running */}
      {session.status === "running" && (
        <div className="flex gap-2">
          <input
            type="text"
            value={interruptText}
            onChange={(e) => onInterruptTextChange(e.target.value)}
            placeholder="Type a correction message and press Interrupt…"
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                onInterrupt();
              }
            }}
            className="flex-1 rounded-md border border-gray-300 bg-white px-3 py-1.5 text-sm text-gray-900 placeholder-gray-400 focus:border-yellow-500 focus:outline-none dark:border-gray-700 dark:bg-gray-800 dark:text-gray-100 dark:placeholder-gray-600"
          />
        </div>
      )}
    </div>
  );
}

function BlockerBanner({
  session,
  replyText,
  onReplyChange,
  onSend,
  sending,
  error,
}: {
  session: Session;
  replyText: string;
  onReplyChange: (v: string) => void;
  onSend: () => void;
  sending: boolean;
  error: string | null;
}) {
  return (
    <div className="rounded-lg border border-red-200 bg-red-50 p-4 dark:border-red-800/60 dark:bg-red-950/30">
      <div className="mb-3 flex items-center gap-2">
        <span className="h-2 w-2 rounded-full bg-red-500" />
        <span className="text-sm font-medium text-red-600 dark:text-red-400">
          Waiting for input
          {session.blockType && (
            <span className="ml-2 text-xs text-red-500/80">({session.blockType})</span>
          )}
        </span>
      </div>

      {session.lastMessage && (
        <div className="mb-3 rounded-md bg-white/60 p-3 font-mono text-sm text-gray-700 dark:bg-gray-900/60 dark:text-gray-300">
          {session.lastMessage}
        </div>
      )}

      {error && <p className="mb-2 text-xs text-red-600 dark:text-red-400">{error}</p>}

      <div className="flex gap-2">
        <textarea
          value={replyText}
          onChange={(e) => onReplyChange(e.target.value)}
          placeholder="Type your reply…"
          rows={3}
          onKeyDown={(e) => {
            if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
              onSend();
            }
          }}
          className="flex-1 resize-none rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 placeholder-gray-400 focus:border-blue-600 focus:outline-none dark:border-gray-700 dark:bg-gray-900 dark:text-gray-100 dark:placeholder-gray-600"
        />
        <button
          onClick={() => {
            onSend();
          }}
          disabled={sending || !replyText.trim()}
          className="self-end rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-500 disabled:opacity-40"
        >
          {sending ? "Sending…" : "Send"}
        </button>
      </div>
      <p className="mt-1 text-xs text-gray-400 dark:text-gray-600">Cmd+Enter to send</p>
    </div>
  );
}
