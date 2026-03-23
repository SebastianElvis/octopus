import { useState } from "react";
import type { Session } from "../lib/types";
import { timeAgo } from "../lib/utils";
import { replyToSession, interruptSession } from "../lib/tauri";
import { useSessionStore } from "../stores/sessionStore";
import { formatError } from "../lib/errors";
import { DiffPanel } from "./DiffPanel";
import { OutputPanel } from "./OutputPanel";
import { GitHubSidebar } from "./GitHubSidebar";

const STATUS_PILL: Record<string, string> = {
  waiting: "bg-red-500/20 text-red-600 ring-1 ring-red-500/30 dark:text-red-400",
  running: "bg-green-500/20 text-green-600 ring-1 ring-green-500/30 dark:text-green-400",
  idle: "bg-gray-500/20 text-gray-500 ring-1 ring-gray-500/30 dark:text-gray-400",
  done: "bg-gray-200/60 text-gray-500 ring-1 ring-gray-300/30 dark:bg-gray-700/40 dark:text-gray-500 dark:ring-gray-600/30",
};

interface SessionDetailProps {
  sessionId: string;
  onBack: () => void;
}

export function SessionDetail({ sessionId, onBack }: SessionDetailProps) {
  const session = useSessionStore((s) => s.sessions.find((x) => x.id === sessionId));
  const updateSession = useSessionStore((s) => s.updateSession);

  const [replyText, setReplyText] = useState("");
  const [sending, setSending] = useState(false);
  const [sendError, setSendError] = useState<string | null>(null);

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
      await interruptSession(session.id);
      updateSession(session.id, { status: "idle", stateChangedAt: Date.now() });
    } catch (err: unknown) {
      console.error("[SessionDetail] Failed to interrupt session:", formatError(err));
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
        onInterrupt={() => {
          void handleInterrupt();
        }}
      />

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
          <DiffPanel worktreePath={session.worktreePath} />
          <OutputPanel sessionId={session.id} />
        </div>

        {/* Right sidebar */}
        <GitHubSidebar
          repoId={session.repoId}
          linkedIssueNumber={session.linkedIssue?.number}
          linkedPRNumber={session.linkedPR?.number}
          branch={session.branch}
          sessionName={session.name}
        />
      </div>
    </div>
  );
}

function SessionHeader({ session, onInterrupt }: { session: Session; onInterrupt: () => void }) {
  return (
    <div className="flex items-start justify-between rounded-lg border border-gray-200 bg-gray-50 px-5 py-4 dark:border-gray-800 dark:bg-gray-900">
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
          <button
            onClick={onInterrupt}
            className="rounded-md bg-yellow-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-yellow-500"
          >
            Interrupt
          </button>
        )}
      </div>
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
