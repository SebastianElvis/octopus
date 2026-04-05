import type { ClaudeContentBlock } from "./types";
import { useSessionStore } from "../stores/sessionStore";

/** Show last 2 path segments for compact display */
function shortPath(p: string): string {
  const segs = p.split("/").filter(Boolean);
  return segs.length <= 2 ? segs.join("/") : segs.slice(-2).join("/");
}

/** Derive a human-readable activity label from a content block */
function activityFromBlock(block: ClaudeContentBlock): string | null {
  switch (block.type) {
    case "thinking":
      return "Thinking";
    case "text":
      return "Writing";
    case "tool_use": {
      const { name, input } = block;
      const filePath = typeof input.file_path === "string" ? shortPath(input.file_path) : null;
      const pattern = typeof input.pattern === "string" ? input.pattern : null;
      const command = typeof input.command === "string" ? input.command : null;

      switch (name) {
        case "Read":
          return filePath ? `Reading ${filePath}` : "Reading files";
        case "Write":
          return filePath ? `Writing ${filePath}` : "Creating file";
        case "Edit":
        case "NotebookEdit":
          return filePath ? `Editing ${filePath}` : "Editing code";
        case "Glob":
          return pattern ? `Finding ${pattern}` : "Finding files";
        case "Grep":
          return pattern ? `Searching ${pattern}` : "Searching code";
        case "Bash":
        case "BashExec": {
          if (command) {
            const firstLine = command.split("\n")[0];
            const short = firstLine.length > 30 ? firstLine.slice(0, 30) + "\u2026" : firstLine;
            return `$ ${short}`;
          }
          return "Running command";
        }
        case "Agent":
          return "Sub-agent working";
        case "WebFetch":
        case "WebSearch":
          return "Fetching web";
        case "TodoWrite":
        case "TodoRead":
        case "TaskCreate":
        case "TaskUpdate":
          return "Managing tasks";
        default:
          return name;
      }
    }
    default:
      return null;
  }
}

/**
 * Subscribe to the current activity of a session.
 * Returns a human-readable string describing what Claude is doing, or null.
 */
export function useSessionActivity(sessionId: string): string | null {
  return useSessionStore((s) => {
    // Check actively streaming content first
    const streaming = s.streamingMessage[sessionId];
    if (streaming && streaming.blocks.length > 0) {
      return activityFromBlock(streaming.blocks[streaming.blocks.length - 1]);
    }

    // Check last finalized message for tool execution in progress
    const messages = s.messageBuffers[sessionId] ?? [];
    if (messages.length > 0) {
      const lastMsg = messages[messages.length - 1];
      if (lastMsg.role === "assistant") {
        for (let i = lastMsg.blocks.length - 1; i >= 0; i--) {
          const block = lastMsg.blocks[i];
          if (block.type === "tool_use") {
            return activityFromBlock(block);
          }
        }
      }
    }

    return null;
  });
}
