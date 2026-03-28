import { useState, useRef, useEffect, useCallback } from "react";
import type { SessionStatus, BlockType } from "../../lib/types";
import { isTauri } from "../../lib/env";
import { interruptSession, sendFollowup } from "../../lib/tauri";

interface UserInputAreaProps {
  sessionId: string;
  sessionStatus: SessionStatus;
  blockType?: BlockType;
  lastMessage?: string;
}

export function UserInputArea({
  sessionId,
  sessionStatus,
  blockType,
  lastMessage,
}: UserInputAreaProps) {
  const [inputText, setInputText] = useState("");
  const [sending, setSending] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const isFinished = ["completed", "done", "failed", "killed"].includes(sessionStatus);

  // Auto-focus input when session finishes or is waiting
  useEffect(() => {
    if ((isFinished || (sessionStatus === "waiting" && blockType !== "permission")) && textareaRef.current) {
      textareaRef.current.focus();
    }
  }, [sessionStatus, blockType, isFinished]);

  // Auto-resize textarea
  const adjustHeight = useCallback(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 150)}px`;
  }, []);

  async function handleSendFollowup() {
    if (!inputText.trim() || sending) return;
    setSending(true);
    try {
      if (isTauri()) {
        await sendFollowup(sessionId, inputText.trim());
      }
      setInputText("");
      if (textareaRef.current) {
        textareaRef.current.style.height = "auto";
      }
    } catch (err: unknown) {
      console.error("[UserInputArea] followup error:", err);
    } finally {
      setSending(false);
    }
  }

  async function handleInterrupt() {
    try {
      if (isTauri()) {
        await interruptSession(sessionId);
      }
    } catch (err: unknown) {
      console.error("[UserInputArea] interrupt error:", err);
    }
  }

  // Running state
  if (sessionStatus === "running") {
    return (
      <div className="flex items-center justify-between border-t border-gray-200 bg-white px-4 py-2.5 dark:border-gray-800 dark:bg-gray-950">
        <div className="flex items-center gap-2">
          <span className="inline-block h-2 w-2 animate-pulse rounded-full bg-green-500" />
          <span className="text-xs text-gray-500 dark:text-gray-400">Claude is working...</span>
        </div>
        <button
          onClick={() => {
            void handleInterrupt();
          }}
          className="cursor-pointer rounded border border-gray-300 px-2.5 py-1 text-xs font-medium text-gray-600 hover:bg-gray-50 active:bg-gray-100 dark:border-gray-700 dark:text-gray-400 dark:hover:bg-gray-800 dark:active:bg-gray-700"
        >
          Interrupt
        </button>
      </div>
    );
  }

  // Waiting for permission
  if (sessionStatus === "waiting" && blockType === "permission") {
    return (
      <div className="border-t border-gray-200 bg-white px-4 py-3 dark:border-gray-800 dark:bg-gray-950">
        {lastMessage && (
          <p className="mb-2 text-xs text-gray-500 dark:text-gray-400">{lastMessage}</p>
        )}
        <div className="flex items-center gap-2">
          <button
            onClick={() => {
              void handleSendFollowup();
            }}
            disabled={sending}
            className="cursor-pointer rounded bg-green-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-green-500 active:bg-green-700 disabled:cursor-not-allowed disabled:opacity-50"
          >
            Allow
          </button>
          <button
            onClick={() => {
              void handleSendFollowup();
            }}
            disabled={sending}
            className="cursor-pointer rounded border border-gray-300 px-3 py-1.5 text-xs font-medium text-gray-600 hover:bg-gray-50 active:bg-gray-100 disabled:cursor-not-allowed disabled:opacity-50 dark:border-gray-700 dark:text-gray-400 dark:hover:bg-gray-800"
          >
            Deny
          </button>
        </div>
      </div>
    );
  }

  // Follow-up input — shown for finished sessions AND waiting-for-input states
  if (isFinished || sessionStatus === "waiting") {
    const statusLabels: Record<string, string> = {
      completed: "Session completed", done: "Session completed",
      failed: "Session failed", killed: "Session killed",
    };
    const statusLabel = isFinished
      ? statusLabels[sessionStatus] ?? "Session ended"
      : undefined;

    return (
      <div className="border-t border-gray-200 bg-white dark:border-gray-800 dark:bg-gray-950">
        {statusLabel && (
          <div className="px-4 pt-2">
            <span className="text-xs text-gray-400 dark:text-gray-500">{statusLabel}</span>
          </div>
        )}
        {lastMessage && !isFinished && (
          <div className="px-4 pt-2">
            <p className="text-xs text-gray-500 dark:text-gray-400">{lastMessage}</p>
          </div>
        )}
        <div className="flex items-end gap-2 px-3 py-2.5">
          <textarea
            ref={textareaRef}
            value={inputText}
            onChange={(e) => {
              setInputText(e.target.value);
              adjustHeight();
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                void handleSendFollowup();
              }
            }}
            placeholder={isFinished ? "Send a follow-up message..." : "Type your response..."}
            disabled={sending}
            rows={1}
            className="flex-1 resize-none rounded-lg border border-gray-300 bg-gray-50 px-3 py-2 text-sm text-gray-900 placeholder-gray-400 focus:border-blue-500 focus:bg-white focus:outline-none focus:ring-1 focus:ring-blue-500 disabled:opacity-50 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-100 dark:placeholder-gray-500 dark:focus:border-blue-400 dark:focus:bg-gray-950 dark:focus:ring-blue-400"
          />
          <button
            onClick={() => {
              void handleSendFollowup();
            }}
            disabled={!inputText.trim() || sending}
            className="mb-0.5 flex h-8 w-8 shrink-0 cursor-pointer items-center justify-center rounded-lg bg-blue-600 text-white hover:bg-blue-500 active:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
            title="Send"
          >
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="h-4 w-4">
              <path d="M3.105 2.288a.75.75 0 0 0-.826.95l1.414 4.926A1.5 1.5 0 0 0 5.135 9.25h6.115a.75.75 0 0 1 0 1.5H5.135a1.5 1.5 0 0 0-1.442 1.086l-1.414 4.926a.75.75 0 0 0 .826.95l14.095-5.927a.75.75 0 0 0 0-1.37L3.105 2.288Z" />
            </svg>
          </button>
        </div>
      </div>
    );
  }

  // Default: no input area (idle, paused, etc.)
  return null;
}
