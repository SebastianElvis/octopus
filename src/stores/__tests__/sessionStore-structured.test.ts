/* eslint-disable @typescript-eslint/no-non-null-assertion */
import { describe, it, expect, beforeEach, vi } from "vitest";
import { useSessionStore } from "../sessionStore";
import type { ClaudeStreamEvent } from "../../lib/types";

// Mock readSessionEvents for loadSessionHistory tests
const mockReadSessionEvents = vi.fn<(id: string) => Promise<ClaudeStreamEvent[]>>();
vi.mock("../../lib/tauri", async () => {
  const actual = await vi.importActual("../../lib/tauri");
  return {
    ...actual,
    readSessionEvents: (...args: [string]) => mockReadSessionEvents(...args),
  };
});

/** Helper to wrap a raw streaming event in the stream_event envelope */
function streamEvent(inner: Record<string, unknown>): ClaudeStreamEvent {
  return { type: "stream_event", event: inner } as ClaudeStreamEvent;
}

beforeEach(() => {
  useSessionStore.setState({
    sessions: [],
    outputBuffers: {},
    messageBuffers: {},
    streamingMessage: {},
    sessionsLoading: false,
    sessionsError: null,
  });
  vi.restoreAllMocks();
  mockReadSessionEvents.mockReset();
});

describe("sessionStore — structured events", () => {
  describe("appendStructuredEvent", () => {
    it("starts a streaming message on content_block_start with text", () => {
      const event = streamEvent({
        type: "content_block_start",
        index: 0,
        content_block: { type: "text", text: "Hello" },
      });

      useSessionStore.getState().appendStructuredEvent("s1", event);

      const streaming = useSessionStore.getState().streamingMessage.s1;
      expect(streaming).not.toBeNull();
      expect(streaming!.role).toBe("assistant");
      expect(streaming!.isStreaming).toBe(true);
      expect(streaming!.blocks).toHaveLength(1);
      expect(streaming!.blocks[0]).toEqual({ type: "text", text: "Hello" });
    });

    it("starts a streaming message on content_block_start with thinking", () => {
      const event = streamEvent({
        type: "content_block_start",
        index: 0,
        content_block: { type: "thinking", thinking: "Let me think..." },
      });

      useSessionStore.getState().appendStructuredEvent("s1", event);

      const streaming = useSessionStore.getState().streamingMessage.s1;
      expect(streaming!.blocks[0]).toEqual({
        type: "thinking",
        thinking: "Let me think...",
      });
    });

    it("starts a streaming message on content_block_start with tool_use", () => {
      const event = streamEvent({
        type: "content_block_start",
        index: 0,
        content_block: { type: "tool_use", id: "tool-1", name: "Read", input: {} },
      });

      useSessionStore.getState().appendStructuredEvent("s1", event);

      const streaming = useSessionStore.getState().streamingMessage.s1;
      expect(streaming!.blocks[0]).toEqual({
        type: "tool_use",
        id: "tool-1",
        name: "Read",
        input: {},
      });
    });

    it("appends text delta to last text block", () => {
      useSessionStore.getState().appendStructuredEvent(
        "s1",
        streamEvent({
          type: "content_block_start",
          index: 0,
          content_block: { type: "text", text: "He" },
        }),
      );

      useSessionStore.getState().appendStructuredEvent(
        "s1",
        streamEvent({
          type: "content_block_delta",
          index: 0,
          delta: { type: "text_delta", text: "llo world" },
        }),
      );

      const streaming = useSessionStore.getState().streamingMessage.s1;
      expect(streaming!.blocks[0]).toEqual({ type: "text", text: "Hello world" });
    });

    it("appends thinking delta to last thinking block", () => {
      useSessionStore.getState().appendStructuredEvent(
        "s1",
        streamEvent({
          type: "content_block_start",
          index: 0,
          content_block: { type: "thinking", thinking: "I need to " },
        }),
      );

      useSessionStore.getState().appendStructuredEvent(
        "s1",
        streamEvent({
          type: "content_block_delta",
          index: 0,
          delta: { type: "thinking_delta", thinking: "analyze this" },
        }),
      );

      const streaming = useSessionStore.getState().streamingMessage.s1;
      const block = streaming!.blocks[0];
      expect(block.type).toBe("thinking");
      if (block.type === "thinking") {
        expect(block.thinking).toBe("I need to analyze this");
      }
    });

    it("ignores delta when no streaming message exists", () => {
      useSessionStore.getState().appendStructuredEvent(
        "s1",
        streamEvent({
          type: "content_block_delta",
          index: 0,
          delta: { type: "text_delta", text: "orphan" },
        }),
      );

      const streaming = useSessionStore.getState().streamingMessage.s1;
      expect(streaming).toBeNull();
    });

    it("finalizes streaming message on assistant event", () => {
      useSessionStore.getState().appendStructuredEvent(
        "s1",
        streamEvent({
          type: "content_block_start",
          index: 0,
          content_block: { type: "text", text: "Hello" },
        }),
      );

      const assistantEvent: ClaudeStreamEvent = {
        type: "assistant",
        message: {
          role: "assistant",
          content: [{ type: "text", text: "Hello, complete message" }],
        },
      };
      useSessionStore.getState().appendStructuredEvent("s1", assistantEvent);

      expect(useSessionStore.getState().streamingMessage.s1).toBeNull();
      const messages = useSessionStore.getState().messageBuffers.s1;
      expect(messages).toHaveLength(1);
      expect(messages[0].role).toBe("assistant");
      expect(messages[0].isStreaming).toBe(false);
    });

    it("handles result event with success subtype", () => {
      const resultEvent: ClaudeStreamEvent = {
        type: "result",
        subtype: "success",
        result: "Task completed successfully",
      };
      useSessionStore.getState().appendStructuredEvent("s1", resultEvent);

      const messages = useSessionStore.getState().messageBuffers.s1;
      expect(messages).toHaveLength(1);
      expect(messages[0].role).toBe("system");
      expect(messages[0].blocks[0]).toEqual({
        type: "text",
        text: "Task completed successfully",
      });
    });

    it("handles result event with error subtype", () => {
      const resultEvent: ClaudeStreamEvent = {
        type: "result",
        subtype: "error",
        error: "Something went wrong",
      };
      useSessionStore.getState().appendStructuredEvent("s1", resultEvent);

      const messages = useSessionStore.getState().messageBuffers.s1;
      expect(messages).toHaveLength(1);
      expect(messages[0].blocks[0]).toEqual({
        type: "text",
        text: "Error: Something went wrong",
      });
    });

    it("flushes streaming message into buffer on result event", () => {
      useSessionStore.getState().appendStructuredEvent(
        "s1",
        streamEvent({
          type: "content_block_start",
          index: 0,
          content_block: { type: "text", text: "Working..." },
        }),
      );

      useSessionStore.getState().appendStructuredEvent("s1", {
        type: "result",
        subtype: "success",
        result: "Done",
      });

      const messages = useSessionStore.getState().messageBuffers.s1;
      expect(messages).toHaveLength(2);
      expect(messages[0].isStreaming).toBe(false);
      expect(messages[0].blocks[0]).toEqual({ type: "text", text: "Working..." });
      expect(messages[1].role).toBe("system");
    });

    it("handles system init event", () => {
      const systemEvent: ClaudeStreamEvent = {
        type: "system",
        subtype: "init",
        session_id: "s1",
      };
      useSessionStore.getState().appendStructuredEvent("s1", systemEvent);

      const messages = useSessionStore.getState().messageBuffers.s1;
      expect(messages).toHaveLength(1);
      expect(messages[0].role).toBe("system");
      expect(messages[0].blocks[0]).toEqual({
        type: "text",
        text: "Session initialized",
      });
    });

    it("adds multiple blocks to the same streaming message", () => {
      useSessionStore.getState().appendStructuredEvent(
        "s1",
        streamEvent({
          type: "content_block_start",
          index: 0,
          content_block: { type: "thinking", thinking: "Analyzing..." },
        }),
      );

      useSessionStore.getState().appendStructuredEvent(
        "s1",
        streamEvent({
          type: "content_block_start",
          index: 1,
          content_block: { type: "text", text: "Here is the answer" },
        }),
      );

      const streaming = useSessionStore.getState().streamingMessage.s1;
      expect(streaming!.blocks).toHaveLength(2);
      expect(streaming!.blocks[0].type).toBe("thinking");
      expect(streaming!.blocks[1].type).toBe("text");
    });

    it("handles user message events", () => {
      const userEvent: ClaudeStreamEvent = {
        type: "user",
        message: {
          role: "user",
          content: [{ type: "text", text: "User said something" }],
        },
      };
      useSessionStore.getState().appendStructuredEvent("s1", userEvent);

      const messages = useSessionStore.getState().messageBuffers.s1;
      expect(messages).toHaveLength(1);
      expect(messages[0].role).toBe("user");
    });

    // --- System subtypes ---

    it("handles system api_retry event", () => {
      useSessionStore.getState().appendStructuredEvent("s1", {
        type: "system",
        subtype: "api_retry",
        attempt: 2,
        max_retries: 5,
        error: "rate_limit",
        retry_delay_ms: 3000,
      } as ClaudeStreamEvent);

      const messages = useSessionStore.getState().messageBuffers.s1;
      expect(messages).toHaveLength(1);
      expect(messages[0].role).toBe("system");
      expect(messages[0].blocks[0]).toEqual({
        type: "text",
        text: "Retrying API call (2/5): rate_limit",
      });
    });

    it("handles system status compacting event", () => {
      useSessionStore.getState().appendStructuredEvent("s1", {
        type: "system",
        subtype: "status",
        status: "compacting",
      } as ClaudeStreamEvent);

      const messages = useSessionStore.getState().messageBuffers.s1;
      expect(messages).toHaveLength(1);
      expect(messages[0].blocks[0]).toEqual({
        type: "text",
        text: "Compacting conversation...",
      });
    });

    it("ignores system status event when status is null", () => {
      useSessionStore.getState().appendStructuredEvent("s1", {
        type: "system",
        subtype: "status",
        status: null,
      } as ClaudeStreamEvent);

      expect(useSessionStore.getState().messageBuffers.s1 ?? []).toHaveLength(0);
    });

    it("handles system task_notification event", () => {
      useSessionStore.getState().appendStructuredEvent("s1", {
        type: "system",
        subtype: "task_notification",
        task_id: "task-1",
        status: "completed",
        summary: "Background task finished successfully",
      } as ClaudeStreamEvent);

      const messages = useSessionStore.getState().messageBuffers.s1;
      expect(messages).toHaveLength(1);
      expect(messages[0].blocks[0]).toEqual({
        type: "text",
        text: "Background task finished successfully",
      });
    });

    it("ignores system subtypes that should not render (hook_started, task_started, etc.)", () => {
      const subtypes = [
        "hook_started",
        "hook_progress",
        "hook_response",
        "task_started",
        "task_progress",
        "compact_boundary",
        "files_persisted",
        "local_command_output",
      ];

      for (const subtype of subtypes) {
        useSessionStore.setState({ messageBuffers: {}, streamingMessage: {} });
        useSessionStore.getState().appendStructuredEvent("s1", {
          type: "system",
          subtype,
        } as ClaudeStreamEvent);
        expect(
          useSessionStore.getState().messageBuffers.s1,
          `subtype "${subtype}" should not produce messages`,
        ).toSatisfy((v: unknown) => v === undefined || (Array.isArray(v) && v.length === 0));
      }
    });

    // --- Result subtypes ---

    it("handles result error_max_turns subtype", () => {
      useSessionStore.getState().appendStructuredEvent("s1", {
        type: "result",
        subtype: "error_max_turns",
        is_error: true,
        errors: ["Reached maximum number of turns"],
      } as ClaudeStreamEvent);

      const messages = useSessionStore.getState().messageBuffers.s1;
      expect(messages).toHaveLength(1);
      expect(messages[0].blocks[0]).toEqual({
        type: "text",
        text: "Max turns reached: Reached maximum number of turns",
      });
    });

    it("handles result error_during_execution subtype", () => {
      useSessionStore.getState().appendStructuredEvent("s1", {
        type: "result",
        subtype: "error_during_execution",
        error: "Process crashed unexpectedly",
      } as ClaudeStreamEvent);

      const messages = useSessionStore.getState().messageBuffers.s1;
      expect(messages).toHaveLength(1);
      expect(messages[0].blocks[0]).toEqual({
        type: "text",
        text: "Error during execution: Process crashed unexpectedly",
      });
    });

    it("handles result error_max_budget_usd subtype", () => {
      useSessionStore.getState().appendStructuredEvent("s1", {
        type: "result",
        subtype: "error_max_budget_usd",
        is_error: true,
        total_cost_usd: 5.0,
      } as ClaudeStreamEvent);

      const messages = useSessionStore.getState().messageBuffers.s1;
      expect(messages).toHaveLength(1);
      expect(messages[0].blocks[0]).toEqual({
        type: "text",
        text: "Budget limit exceeded",
      });
    });

    it("handles unknown result error subtypes gracefully", () => {
      useSessionStore.getState().appendStructuredEvent("s1", {
        type: "result",
        subtype: "error_new_unknown_type",
        error: "Something new happened",
      } as ClaudeStreamEvent);

      const messages = useSessionStore.getState().messageBuffers.s1;
      expect(messages).toHaveLength(1);
      expect(messages[0].blocks[0]).toEqual({
        type: "text",
        text: "Error: Something new happened",
      });
    });

    // --- Rate limit events ---

    it("handles rate_limit_event with rejected status", () => {
      useSessionStore.getState().appendStructuredEvent("s1", {
        type: "rate_limit_event",
        rate_limit_info: {
          status: "rejected",
          resetsAt: Math.floor(Date.now() / 1000) + 3600,
        },
      } as ClaudeStreamEvent);

      const messages = useSessionStore.getState().messageBuffers.s1;
      expect(messages).toHaveLength(1);
      expect(messages[0].role).toBe("system");
      expect(messages[0].blocks[0].type).toBe("text");
      if (messages[0].blocks[0].type === "text") {
        expect(messages[0].blocks[0].text).toContain("Rate limited");
        expect(messages[0].blocks[0].text).toContain("Resets at");
      }
    });

    it("handles rate_limit_event with allowed_warning status", () => {
      useSessionStore.getState().appendStructuredEvent("s1", {
        type: "rate_limit_event",
        rate_limit_info: { status: "allowed_warning" },
      } as ClaudeStreamEvent);

      const messages = useSessionStore.getState().messageBuffers.s1;
      expect(messages).toHaveLength(1);
      if (messages[0].blocks[0].type === "text") {
        expect(messages[0].blocks[0].text).toContain("Approaching rate limit");
      }
    });

    it("ignores rate_limit_event with allowed status", () => {
      useSessionStore.getState().appendStructuredEvent("s1", {
        type: "rate_limit_event",
        rate_limit_info: { status: "allowed" },
      } as ClaudeStreamEvent);

      expect(useSessionStore.getState().messageBuffers.s1 ?? []).toHaveLength(0);
    });

    // --- Graceful handling of unknown types ---

    it("ignores tool_progress events without crashing", () => {
      useSessionStore.getState().appendStructuredEvent("s1", {
        type: "tool_progress",
        tool_use_id: "tool-1",
        tool_name: "Bash",
        elapsed_time_seconds: 5,
      } as ClaudeStreamEvent);

      expect(useSessionStore.getState().messageBuffers.s1 ?? []).toHaveLength(0);
    });

    it("ignores completely unknown event types without crashing", () => {
      useSessionStore.getState().appendStructuredEvent("s1", {
        type: "prompt_suggestion",
        suggestion: "Try asking about...",
      } as unknown as ClaudeStreamEvent);

      expect(useSessionStore.getState().messageBuffers.s1 ?? []).toHaveLength(0);
    });

    // --- Optimistic user message dedup ---

    it("deduplicates optimistic user message when real event arrives", () => {
      useSessionStore.getState().addOptimisticUserMessage("s1", "Hello Claude");

      const before = useSessionStore.getState().messageBuffers.s1;
      expect(before).toHaveLength(1);
      expect(before[0].id).toMatch(/^optimistic-/);

      useSessionStore.getState().appendStructuredEvent("s1", {
        type: "user",
        message: {
          role: "user",
          content: [{ type: "text", text: "Hello Claude" }],
        },
      });

      const after = useSessionStore.getState().messageBuffers.s1;
      expect(after).toHaveLength(1);
      expect(after[0].id).toMatch(/^user-/);
    });

    it("does not dedup when text does not match", () => {
      useSessionStore.getState().addOptimisticUserMessage("s1", "Hello Claude");

      useSessionStore.getState().appendStructuredEvent("s1", {
        type: "user",
        message: {
          role: "user",
          content: [{ type: "text", text: "Different text" }],
        },
      });

      const messages = useSessionStore.getState().messageBuffers.s1;
      expect(messages).toHaveLength(2);
    });
  });

  describe("appendStructuredEvents (batch)", () => {
    it("processes multiple events for the same session in one update", () => {
      const events = [
        {
          sessionId: "s1",
          event: streamEvent({
            type: "content_block_start",
            index: 0,
            content_block: { type: "text", text: "Hello " },
          }),
        },
        {
          sessionId: "s1",
          event: streamEvent({
            type: "content_block_delta",
            index: 0,
            delta: { type: "text_delta", text: "world" },
          }),
        },
      ];

      useSessionStore.getState().appendStructuredEvents(events);

      const streaming = useSessionStore.getState().streamingMessage.s1;
      expect(streaming!.blocks[0]).toEqual({ type: "text", text: "Hello world" });
    });

    it("processes events for different sessions independently", () => {
      const events = [
        {
          sessionId: "s1",
          event: streamEvent({
            type: "content_block_start",
            index: 0,
            content_block: { type: "text", text: "Session 1" },
          }),
        },
        {
          sessionId: "s2",
          event: streamEvent({
            type: "content_block_start",
            index: 0,
            content_block: { type: "text", text: "Session 2" },
          }),
        },
      ];

      useSessionStore.getState().appendStructuredEvents(events);

      expect(useSessionStore.getState().streamingMessage.s1!.blocks[0]).toEqual({
        type: "text",
        text: "Session 1",
      });
      expect(useSessionStore.getState().streamingMessage.s2!.blocks[0]).toEqual({
        type: "text",
        text: "Session 2",
      });
    });

    it("handles empty batch without error", () => {
      useSessionStore.getState().appendStructuredEvents([]);
      expect(useSessionStore.getState().messageBuffers).toEqual({});
    });

    it("batch produces same result as sequential single events", () => {
      const events: { sessionId: string; event: ClaudeStreamEvent }[] = [
        {
          sessionId: "s1",
          event: {
            type: "system",
            subtype: "init",
            session_id: "s1",
          },
        },
        {
          sessionId: "s1",
          event: streamEvent({
            type: "content_block_start",
            index: 0,
            content_block: { type: "text", text: "Hi" },
          }),
        },
        {
          sessionId: "s1",
          event: streamEvent({
            type: "content_block_delta",
            index: 0,
            delta: { type: "text_delta", text: " there" },
          }),
        },
      ];

      // Batch
      useSessionStore.getState().appendStructuredEvents(events);
      const batchMessages = [...useSessionStore.getState().messageBuffers.s1];
      const batchStreaming = useSessionStore.getState().streamingMessage.s1;

      // Reset
      useSessionStore.setState({ messageBuffers: {}, streamingMessage: {} });

      // Sequential
      for (const { sessionId, event } of events) {
        useSessionStore.getState().appendStructuredEvent(sessionId, event);
      }
      const seqMessages = useSessionStore.getState().messageBuffers.s1;
      const seqStreaming = useSessionStore.getState().streamingMessage.s1;

      expect(batchMessages).toEqual(seqMessages);
      expect(batchStreaming?.blocks).toEqual(seqStreaming?.blocks);
    });
  });

  describe("clearMessages", () => {
    it("clears messages and streaming for a session", () => {
      useSessionStore.getState().appendStructuredEvent("s1", {
        type: "system",
        subtype: "init",
      } as ClaudeStreamEvent);
      useSessionStore.getState().appendStructuredEvent(
        "s1",
        streamEvent({
          type: "content_block_start",
          index: 0,
          content_block: { type: "text", text: "Hello" },
        }),
      );

      useSessionStore.getState().clearMessages("s1");

      expect(useSessionStore.getState().messageBuffers.s1).toEqual([]);
      expect(useSessionStore.getState().streamingMessage.s1).toBeNull();
    });

    it("does not affect other sessions", () => {
      useSessionStore.getState().appendStructuredEvent("s1", {
        type: "system",
        subtype: "init",
      } as ClaudeStreamEvent);
      useSessionStore.getState().appendStructuredEvent("s2", {
        type: "system",
        subtype: "init",
      } as ClaudeStreamEvent);

      useSessionStore.getState().clearMessages("s1");

      expect(useSessionStore.getState().messageBuffers.s1).toEqual([]);
      expect(useSessionStore.getState().messageBuffers.s2).toHaveLength(1);
    });
  });

  describe("loadSessionHistory", () => {
    it("loads events from backend and replays them into messageBuffers", async () => {
      mockReadSessionEvents.mockResolvedValue([
        { type: "system", subtype: "init", session_id: "s1" },
        {
          type: "assistant",
          message: {
            role: "assistant",
            content: [{ type: "text", text: "Hello from history" }],
          },
        },
        { type: "result", subtype: "success", result: "Done" },
      ] as ClaudeStreamEvent[]);

      await useSessionStore.getState().loadSessionHistory("s1");

      const messages = useSessionStore.getState().messageBuffers.s1;
      expect(messages.length).toBeGreaterThanOrEqual(3);
      expect(messages[0].role).toBe("system");
      expect(messages[1].role).toBe("assistant");
      expect(messages[1].blocks[0]).toEqual({ type: "text", text: "Hello from history" });
      expect(useSessionStore.getState().streamingMessage.s1).toBeNull();
    });

    it("skips loading if messages already exist for the session", async () => {
      useSessionStore.getState().appendStructuredEvent("s1", {
        type: "system",
        subtype: "init",
      } as ClaudeStreamEvent);

      await useSessionStore.getState().loadSessionHistory("s1");

      expect(mockReadSessionEvents).not.toHaveBeenCalled();
    });

    it("handles empty log gracefully", async () => {
      mockReadSessionEvents.mockResolvedValue([]);

      await useSessionStore.getState().loadSessionHistory("s1");

      expect(useSessionStore.getState().messageBuffers.s1 ?? []).toHaveLength(0);
    });

    it("handles errors gracefully without crashing", async () => {
      mockReadSessionEvents.mockRejectedValue(new Error("File not found"));

      await useSessionStore.getState().loadSessionHistory("s1");

      expect(useSessionStore.getState().messageBuffers.s1 ?? []).toHaveLength(0);
    });

    it("finalizes any leftover streaming message from history", async () => {
      // Simulate a log that ends mid-stream (stream_event without result)
      mockReadSessionEvents.mockResolvedValue([
        streamEvent({
          type: "content_block_start",
          index: 0,
          content_block: { type: "text", text: "Partial response" },
        }),
      ] as ClaudeStreamEvent[]);

      await useSessionStore.getState().loadSessionHistory("s1");

      const messages = useSessionStore.getState().messageBuffers.s1;
      expect(messages).toHaveLength(1);
      expect(messages[0].isStreaming).toBe(false);
      expect(messages[0].blocks[0]).toEqual({ type: "text", text: "Partial response" });
      expect(useSessionStore.getState().streamingMessage.s1).toBeNull();
    });
  });
});
