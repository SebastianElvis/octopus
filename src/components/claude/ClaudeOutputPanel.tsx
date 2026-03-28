import { useEffect, useRef, useCallback, useState } from "react";
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
}

export function ClaudeOutputPanel({
  sessionId,
  sessionStatus,
  blockType,
  lastMessage,
  visible = true,
}: ClaudeOutputPanelProps) {
  const messages = useSessionStore((s) => s.messageBuffers[sessionId] ?? EMPTY_MESSAGES);
  const streamingMessage = useSessionStore((s) => s.streamingMessage[sessionId] ?? null);
  const loadSessionHistory = useSessionStore((s) => s.loadSessionHistory);

  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const [isAtBottom, setIsAtBottom] = useState(true);
  const [showScrollBtn, setShowScrollBtn] = useState(false);
  const [historyLoading, setHistoryLoading] = useState(true);

  // Load message history from log file on mount (if buffer is empty)
  useEffect(() => {
    let cancelled = false;
    void loadSessionHistory(sessionId)
      .finally(() => { if (!cancelled) setHistoryLoading(false); });
    return () => { cancelled = true; };
  }, [sessionId, loadSessionHistory]);

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

  const allMessages = streamingMessage ? [...messages, streamingMessage] : messages;
  const isEmpty = allMessages.length === 0;

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
                  <p className="text-sm text-gray-400 dark:text-gray-500">
                    Loading history...
                  </p>
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
