import { create } from "zustand";
import type { Session, ClaudeMessage, ClaudeStreamEvent } from "../lib/types";
import { listSessions, readSessionEvents } from "../lib/tauri";
import { formatError } from "../lib/errors";

export type { Session };
export type { SessionStatus, BlockType } from "../lib/types";
export type { ClaudeMessage, ClaudeStreamEvent, ClaudeContentBlock } from "../lib/types";

// ---------------------------------------------------------------------------
// Pure event processing logic (extracted so it can be reused by single + batch)
// ---------------------------------------------------------------------------

interface MessageState {
  messages: ClaudeMessage[];
  streaming: ClaudeMessage | null;
}

function processEvent(state: MessageState, event: ClaudeStreamEvent): MessageState {
  const messages = state.messages;
  let streaming = state.streaming;

  // Unwrap stream_event wrapper — the CLI wraps raw API events in this
  if (event.type === "stream_event") {
    const inner = event.event;
    if (inner.type === "content_block_start") {
      streaming ??= {
        id: `msg-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        role: "assistant",
        blocks: [],
        timestamp: Date.now(),
        isStreaming: true,
      };
      streaming = { ...streaming, blocks: [...streaming.blocks, inner.content_block] };
    } else if (inner.type === "content_block_delta" && streaming) {
      const blocks = [...streaming.blocks];
      const lastBlock = blocks[blocks.length - 1];
      if (lastBlock.type === "text" && inner.delta.text != null) {
        blocks[blocks.length - 1] = { ...lastBlock, text: lastBlock.text + inner.delta.text };
      } else if (lastBlock.type === "thinking" && inner.delta.thinking != null) {
        blocks[blocks.length - 1] = {
          ...lastBlock,
          thinking: lastBlock.thinking + inner.delta.thinking,
        };
      } else if (lastBlock.type === "tool_use" && inner.delta.partial_json != null) {
        const currentInput = JSON.stringify(lastBlock.input);
        const base = currentInput === "{}" ? "" : currentInput;
        try {
          const newInput = JSON.parse(base + inner.delta.partial_json) as Record<string, unknown>;
          blocks[blocks.length - 1] = { ...lastBlock, input: newInput };
        } catch {
          // Partial JSON not yet parseable
        }
      }
      streaming = { ...streaming, blocks };
    }
    // content_block_stop, message_start/delta/stop — no action needed
  } else if (event.type === "assistant") {
    // Complete assistant message — finalize any streaming and replace with the full message
    const msg: ClaudeMessage = {
      id: streaming?.id ?? `msg-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      role: "assistant",
      blocks: event.message.content,
      timestamp: Date.now(),
      isStreaming: false,
    };
    messages.push(msg);
    streaming = null;
  } else if (event.type === "user") {
    // User message (tool results, replayed prompts)
    messages.push({
      id: `user-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      role: "user",
      blocks: event.message.content,
      timestamp: Date.now(),
    });
  } else if (event.type === "result") {
    if (streaming) {
      messages.push({ ...streaming, isStreaming: false });
      streaming = null;
    }
    if (event.subtype === "success" && event.result) {
      messages.push({
        id: `result-${Date.now()}`,
        role: "system",
        blocks: [{ type: "text", text: event.result }],
        timestamp: Date.now(),
      });
    } else if (event.subtype === "error" && event.error) {
      messages.push({
        id: `error-${Date.now()}`,
        role: "system",
        blocks: [{ type: "text", text: `Error: ${event.error}` }],
        timestamp: Date.now(),
      });
    }
  } else if (event.type === "system") {
    messages.push({
      id: `system-${Date.now()}`,
      role: "system",
      blocks: [{ type: "text", text: "Session initialized" }],
      timestamp: Date.now(),
    });
  }

  return { messages, streaming };
}

// ---------------------------------------------------------------------------
// Store
// ---------------------------------------------------------------------------

interface SessionState {
  sessions: Session[];
  outputBuffers: Record<string, string[]>;
  messageBuffers: Record<string, ClaudeMessage[]>;
  streamingMessage: Record<string, ClaudeMessage | null>;
  sessionsLoading: boolean;
  sessionsError: string | null;

  // Actions
  addSession: (session: Session) => void;
  updateSession: (id: string, updates: Partial<Session>) => void;
  removeSession: (id: string) => void;
  appendOutput: (sessionId: string, line: string) => void;
  appendStructuredEvent: (sessionId: string, event: ClaudeStreamEvent) => void;
  appendStructuredEvents: (
    events: { sessionId: string; event: ClaudeStreamEvent }[],
  ) => void;
  clearMessages: (sessionId: string) => void;
  loadSessionHistory: (sessionId: string) => Promise<void>;
  loadSessions: () => Promise<void>;
}

export const useSessionStore = create<SessionState>((set) => ({
  sessions: [],
  outputBuffers: {},
  messageBuffers: {},
  streamingMessage: {},
  sessionsLoading: true,
  sessionsError: null,

  addSession: (session) => set((state) => ({ sessions: [...state.sessions, session] })),

  updateSession: (id, updates) =>
    set((state) => ({
      sessions: state.sessions.map((s) => (s.id === id ? { ...s, ...updates } : s)),
    })),

  removeSession: (id) =>
    set((state) => ({
      sessions: state.sessions.filter((s) => s.id !== id),
    })),

  appendOutput: (sessionId, line) =>
    set((state) => ({
      outputBuffers: {
        ...state.outputBuffers,
        [sessionId]: [...(state.outputBuffers[sessionId] ?? []), line],
      },
    })),

  appendStructuredEvent: (sessionId, event) =>
    set((state) => {
      const result = processEvent(
        {
          messages: [...(state.messageBuffers[sessionId] ?? [])],
          streaming: state.streamingMessage[sessionId] ?? null,
        },
        event,
      );
      return {
        messageBuffers: { ...state.messageBuffers, [sessionId]: result.messages },
        streamingMessage: { ...state.streamingMessage, [sessionId]: result.streaming },
      };
    }),

  // Batch version: processes many events in a single set() to avoid rapid re-renders
  appendStructuredEvents: (events) =>
    set((state) => {
      // Group events by sessionId
      const bySession = new Map<string, ClaudeStreamEvent[]>();
      for (const { sessionId, event } of events) {
        let list = bySession.get(sessionId);
        if (!list) {
          list = [];
          bySession.set(sessionId, list);
        }
        list.push(event);
      }

      const newMessageBuffers = { ...state.messageBuffers };
      const newStreamingMessage = { ...state.streamingMessage };

      for (const [sessionId, sessionEvents] of bySession) {
        let msgState: MessageState = {
          messages: [...(newMessageBuffers[sessionId] ?? [])],
          streaming: newStreamingMessage[sessionId] ?? null,
        };
        for (const event of sessionEvents) {
          msgState = processEvent(msgState, event);
        }
        newMessageBuffers[sessionId] = msgState.messages;
        newStreamingMessage[sessionId] = msgState.streaming;
      }

      return { messageBuffers: newMessageBuffers, streamingMessage: newStreamingMessage };
    }),

  clearMessages: (sessionId) =>
    set((state) => ({
      messageBuffers: { ...state.messageBuffers, [sessionId]: [] },
      streamingMessage: { ...state.streamingMessage, [sessionId]: null },
    })),

  loadSessionHistory: async (sessionId: string) => {
    // Skip if we already have messages for this session
    const existing = useSessionStore.getState().messageBuffers[sessionId];
    if (existing && existing.length > 0) return;

    try {
      const events = await readSessionEvents(sessionId);
      if (events.length === 0) return;

      // Replay all events to build message history
      let msgState: MessageState = { messages: [], streaming: null };
      for (const event of events) {
        msgState = processEvent(msgState, event as ClaudeStreamEvent);
      }

      // Finalize any remaining streaming message
      if (msgState.streaming) {
        msgState.messages.push({ ...msgState.streaming, isStreaming: false });
      }

      set((state) => ({
        messageBuffers: { ...state.messageBuffers, [sessionId]: msgState.messages },
        streamingMessage: { ...state.streamingMessage, [sessionId]: null },
      }));
    } catch (err) {
      console.error("[sessionStore] Failed to load session history:", formatError(err));
    }
  },

  loadSessions: async () => {
    set({ sessionsLoading: true, sessionsError: null });
    try {
      const sessions = await listSessions();
      set({ sessions, sessionsLoading: false });
    } catch (err) {
      set({ sessionsLoading: false, sessionsError: formatError(err) });
    }
  },
}));
