import { useEffect, useRef, useCallback, useState, useMemo } from "react";
import { useSessionStore } from "../../stores/sessionStore";
import type { SessionStatus, BlockType, ClaudeMessage } from "../../lib/types";
import { MessageBlock } from "./MessageBlock";
import { UserInputArea } from "./UserInputArea";

/** Stable reference to avoid new-array-per-render in Zustand selectors */
const EMPTY_MESSAGES: ClaudeMessage[] = [];

interface ClaudeOutputPanelProps {
  sessionId: string;
  sessionStatus: string;
  blockType?: string;
  lastMessage?: string;
  visible?: boolean;
  prompt?: string;
}

export function ClaudeOutputPanel({
  sessionId,
  sessionStatus,
  blockType,
  lastMessage,
  visible = true,
  prompt,
}: ClaudeOutputPanelProps) {
  const messages = useSessionStore((s) => s.messageBuffers[sessionId] ?? EMPTY_MESSAGES);
  const streamingMessage = useSessionStore((s) => s.streamingMessage[sessionId] ?? null);
  const loadSessionHistory = useSessionStore((s) => s.loadSessionHistory);

  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const [isAtBottom, setIsAtBottom] = useState(true);
  const [showScrollBtn, setShowScrollBtn] = useState(false);
  const [historyLoading, setHistoryLoading] = useState(true);

  // Inject the initial prompt as a user message right after "Session initialized"
  const messagesWithPrompt = useMemo(() => {
    if (!prompt) return messages;
    // Check if we already have a prompt message injected (avoid duplicates on re-render)
    if (messages.some((m) => m.id === "initial-prompt")) return messages;
    const initIdx = messages.findIndex(
      (m) => m.role === "system" && m.blocks.some((b) => b.type === "text" && b.text === "Session initialized"),
    );
    if (initIdx === -1) return messages;
    const promptMsg: ClaudeMessage = {
      id: "initial-prompt",
      role: "user",
      blocks: [{ type: "text", text: prompt }],
      timestamp: messages[initIdx].timestamp,
    };
    const result = [...messages];
    result.splice(initIdx + 1, 0, promptMsg);
    return result;
  }, [messages, prompt]);

  const allMessages = streamingMessage ? [...messagesWithPrompt, streamingMessage] : messagesWithPrompt;
  const isEmpty = allMessages.length === 0;

  // Load message history from log file on mount (if buffer is empty)
  useEffect(() => {
    let cancelled = false;
    void loadSessionHistory(sessionId).finally(() => {
      if (!cancelled) setHistoryLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, [sessionId, loadSessionHistory]);

  // Track document visibility for adaptive polling
  const [docVisible, setDocVisible] = useState(!document.hidden);
  useEffect(() => {
    const handler = () => setDocVisible(!document.hidden);
    document.addEventListener("visibilitychange", handler);
    return () => document.removeEventListener("visibilitychange", handler);
  }, []);

  // Retry loading history periodically while session is running but output is empty.
  // Polls faster (1s) when visible, slower (5s) when hidden. Stops when session ends.
  useEffect(() => {
    if (historyLoading || !isEmpty) return;
    if (sessionStatus !== "running" && sessionStatus !== "attention") return;
    const interval = docVisible ? 1000 : 5000;
    const timer = setInterval(() => {
      void loadSessionHistory(sessionId);
    }, interval);
    return () => clearInterval(timer);
  }, [historyLoading, isEmpty, sessionStatus, sessionId, loadSessionHistory, docVisible]);

  // Track scroll position
  const handleScroll = useCallback(() => {
    const el = scrollContainerRef.current;
    if (!el) return;
    const atBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 40;
    setIsAtBottom(atBottom);
    setShowScrollBtn(!atBottom);
  }, []);

  // Auto-scroll to bottom when new messages arrive (if already at bottom)
  useEffect(() => {
    if (isAtBottom && bottomRef.current) {
      bottomRef.current.scrollIntoView({ behavior: "smooth" });
    }
  }, [messages, streamingMessage, isAtBottom]);

  // Scroll to bottom on initial mount or when becoming visible
  useEffect(() => {
    if (visible && bottomRef.current) {
      bottomRef.current.scrollIntoView();
    }
  }, [visible]);

  function scrollToBottom() {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }

  return (
    <div className="flex h-full flex-col bg-white dark:bg-gray-950">
      {/* Message list */}
      <div
        ref={scrollContainerRef}
        onScroll={handleScroll}
        className="flex-1 overflow-y-auto px-4 py-3"
      >
        {isEmpty && (
          <div className="flex h-full items-center justify-center">
            <div className="text-center">
              {historyLoading ? (
                <div className="flex flex-col items-center gap-2">
                  <span className="inline-block h-3 w-3 animate-pulse rounded-full bg-gray-400" />
                  <p className="text-sm text-gray-400 dark:text-gray-500">Loading history...</p>
                </div>
              ) : sessionStatus === "running" ? (
                <div className="flex flex-col items-center gap-2">
                  <span className="inline-block h-3 w-3 animate-pulse rounded-full bg-green-500" />
                  <p className="text-sm text-gray-400 dark:text-gray-500">
                    Waiting for Claude output...
                  </p>
                </div>
              ) : (
                <p className="text-sm text-gray-400 dark:text-gray-500">No messages yet</p>
              )}
            </div>
          </div>
        )}

        {allMessages.map((msg) => (
          <MessageBlock key={msg.id} message={msg} />
        ))}

        <div ref={bottomRef} />
      </div>

      {/* Scroll to bottom button */}
      {showScrollBtn && (
        <div className="absolute bottom-16 left-1/2 z-20 -translate-x-1/2">
          <button
            onClick={scrollToBottom}
            className="cursor-pointer rounded-full bg-gray-800 px-3 py-1.5 text-xs font-medium text-white shadow-lg hover:bg-gray-700 dark:bg-gray-200 dark:text-gray-800 dark:hover:bg-gray-300"
          >
            Scroll to bottom
          </button>
        </div>
      )}

      {/* Input area */}
      <UserInputArea
        sessionId={sessionId}
        sessionStatus={sessionStatus as SessionStatus}
        blockType={blockType as BlockType | undefined}
        lastMessage={lastMessage}
      />
    </div>
  );
}
