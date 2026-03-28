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
    // Replace optimistic user message if the text matches
    const lastMsg = messages[messages.length - 1];
    const incomingText = event.message.content.find((b: { type: string }) => b.type === "text");
    if (
      // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- lastMsg can be undefined (empty array)
      lastMsg?.role === "user" &&
      lastMsg.id.startsWith("optimistic-") &&
      incomingText &&
      "text" in incomingText
    ) {
      const lastText = lastMsg.blocks.find((b) => b.type === "text");
      if (lastText?.type === "text" && lastText.text === incomingText.text) {
        messages[messages.length - 1] = {
          id: `user-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
          role: "user",
          blocks: event.message.content,
          timestamp: Date.now(),
        };
        return { messages, streaming };
      }
    }
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
    } else if (event.subtype !== "success") {
      // Handle all error subtypes: error_max_turns, error_during_execution,
      // error_max_budget_usd, error_max_structured_output_retries, etc.
      const errorLabels: Record<string, string> = {
        error_max_turns: "Max turns reached",
        error_during_execution: "Error during execution",
        error_max_budget_usd: "Budget limit exceeded",
        error_max_structured_output_retries: "Max structured output retries exceeded",
      };
      const label = errorLabels[event.subtype] ?? "Error";
      const detail = event.error ?? event.errors?.join("; ") ?? "";
      const text = detail ? `${label}: ${detail}` : label;
      messages.push({
        id: `error-${Date.now()}`,
        role: "system",
        blocks: [{ type: "text", text }],
        timestamp: Date.now(),
      });
    }
  } else if (event.type === "system") {
    const subtype = event.subtype;
    if (subtype === "init") {
      messages.push({
        id: `system-${Date.now()}`,
        role: "system",
        blocks: [{ type: "text", text: "Session initialized" }],
        timestamp: Date.now(),
      });
    } else if (subtype === "api_retry") {
      const attempt = event.attempt ?? 0;
      const maxRetries = event.max_retries ?? 0;
      const reason = event.error ?? "unknown error";
      messages.push({
        id: `system-retry-${Date.now()}`,
        role: "system",
        blocks: [{ type: "text", text: `Retrying API call (${attempt}/${maxRetries}): ${reason}` }],
        timestamp: Date.now(),
      });
    } else if (subtype === "status" && event.status === "compacting") {
      messages.push({
        id: `system-compact-${Date.now()}`,
        role: "system",
        blocks: [{ type: "text", text: "Compacting conversation..." }],
        timestamp: Date.now(),
      });
    } else if (subtype === "task_notification") {
      const summary = event.summary ?? "Task completed";
      messages.push({
        id: `system-task-${Date.now()}`,
        role: "system",
        blocks: [{ type: "text", text: summary }],
        timestamp: Date.now(),
      });
    }
    // Other system subtypes (hook_started, hook_progress, hook_response,
    // task_started, task_progress, compact_boundary, files_persisted,
    // local_command_output) are intentionally ignored — they don't need
    // to be rendered as chat messages.
  } else if (event.type === "rate_limit_event") {
    const info = event.rate_limit_info;
    if (info.status === "rejected" || info.status === "allowed_warning") {
      const resets = info.resetsAt
        ? ` Resets at ${new Date(info.resetsAt * 1000).toLocaleTimeString()}.`
        : "";
      const label = info.status === "rejected" ? "Rate limited" : "Approaching rate limit";
      messages.push({
        id: `system-ratelimit-${Date.now()}`,
        role: "system",
        blocks: [{ type: "text", text: `${label}.${resets}` }],
        timestamp: Date.now(),
      });
    }
  }
  // tool_progress, error, and unknown event types are silently ignored

  return { messages, streaming };
}

// ---------------------------------------------------------------------------
// Store
// ---------------------------------------------------------------------------

/** Tools discovered from a session's init event */
export interface SessionTool {
  name: string;
  description?: string;
}

interface SessionState {
  sessions: Session[];
  outputBuffers: Record<string, string[]>;
  messageBuffers: Record<string, ClaudeMessage[]>;
  streamingMessage: Record<string, ClaudeMessage | null>;
  /** Tools reported by each session's system init event */
  sessionTools: Record<string, SessionTool[]>;
  sessionsLoading: boolean;
  sessionsError: string | null;

  // Actions
  addSession: (session: Session) => void;
  updateSession: (id: string, updates: Partial<Session>) => void;
  removeSession: (id: string) => void;
  appendOutput: (sessionId: string, line: string) => void;
  appendStructuredEvent: (sessionId: string, event: ClaudeStreamEvent) => void;
  appendStructuredEvents: (events: { sessionId: string; event: ClaudeStreamEvent }[]) => void;
  clearMessages: (sessionId: string) => void;
  addOptimisticUserMessage: (sessionId: string, text: string) => void;
  loadSessionHistory: (sessionId: string) => Promise<void>;
  loadSessions: () => Promise<void>;
}

export const useSessionStore = create<SessionState>((set) => ({
  sessions: [],
  outputBuffers: {},
  messageBuffers: {},
  streamingMessage: {},
  sessionTools: {},
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
      const updates: Partial<SessionState> = {
        messageBuffers: { ...state.messageBuffers, [sessionId]: result.messages },
        streamingMessage: { ...state.streamingMessage, [sessionId]: result.streaming },
      };
      // Capture tools from system init event
      if (event.type === "system" && event.subtype === "init" && event.tools) {
        updates.sessionTools = {
          ...state.sessionTools,
          [sessionId]: event.tools as SessionTool[],
        };
      }
      return updates;
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
      let newSessionTools = state.sessionTools;

      for (const [sessionId, sessionEvents] of bySession) {
        let msgState: MessageState = {
          messages: [...(newMessageBuffers[sessionId] ?? [])],
          streaming: newStreamingMessage[sessionId] ?? null,
        };
        for (const event of sessionEvents) {
          msgState = processEvent(msgState, event);
          // Capture tools from system init event
          if (event.type === "system" && event.subtype === "init" && event.tools) {
            newSessionTools = {
              ...newSessionTools,
              [sessionId]: event.tools as SessionTool[],
            };
          }
        }
        newMessageBuffers[sessionId] = msgState.messages;
        newStreamingMessage[sessionId] = msgState.streaming;
      }

      return {
        messageBuffers: newMessageBuffers,
        streamingMessage: newStreamingMessage,
        sessionTools: newSessionTools,
      };
    }),

  clearMessages: (sessionId) =>
    set((state) => ({
      messageBuffers: { ...state.messageBuffers, [sessionId]: [] },
      streamingMessage: { ...state.streamingMessage, [sessionId]: null },
    })),

  addOptimisticUserMessage: (sessionId, text) =>
    set((state) => ({
      messageBuffers: {
        ...state.messageBuffers,
        [sessionId]: [
          ...(state.messageBuffers[sessionId] ?? []),
          {
            id: `optimistic-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
            role: "user" as const,
            blocks: [{ type: "text" as const, text }],
            timestamp: Date.now(),
          },
        ],
      },
    })),

  loadSessionHistory: async (sessionId: string) => {
    // Skip if we already have messages or active streaming for this session
    const { messageBuffers, streamingMessage: streamMap } = useSessionStore.getState();
    if ((messageBuffers[sessionId] ?? []).length > 0 || streamMap[sessionId] != null) return;

    try {
      const events = await readSessionEvents(sessionId);
      if (events.length === 0) return;

      // Replay all events to build message history
      let msgState: MessageState = { messages: [], streaming: null };
      for (const event of events) {
        msgState = processEvent(msgState, event);
      }

      // Finalize any remaining streaming message
      if (msgState.streaming) {
        msgState.messages.push({ ...msgState.streaming, isStreaming: false });
      }

      set((s) => {
        // Don't overwrite if live events have populated the store while we were loading
        const currentMessages = s.messageBuffers[sessionId] ?? [];
        const currentStreaming = s.streamingMessage[sessionId];
        if (currentMessages.length > 0 || currentStreaming != null) {
          return s;
        }
        return {
          messageBuffers: { ...s.messageBuffers, [sessionId]: msgState.messages },
          streamingMessage: { ...s.streamingMessage, [sessionId]: null },
        };
      });
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
