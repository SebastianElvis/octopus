import type { ClaudeMessage, ClaudeContentBlock } from "../../lib/types";
import { TextBlock } from "./TextBlock";
import { ToolUseBlock } from "./ToolUseBlock";
import { ThinkingBlock } from "./ThinkingBlock";

interface MessageBlockProps {
  message: ClaudeMessage;
}

/** Find the tool_result for a given tool_use in the same message */
function findToolResult(
  blocks: ClaudeContentBlock[],
  toolUseId: string,
): (ClaudeContentBlock & { type: "tool_result" }) | undefined {
  return blocks.find(
    (b): b is ClaudeContentBlock & { type: "tool_result" } =>
      b.type === "tool_result" && b.tool_use_id === toolUseId,
  );
}

export function MessageBlock({ message }: MessageBlockProps) {
  if (message.role === "system") {
    return (
      <div className="my-2 flex justify-center">
        <span className="rounded-full bg-gray-100 px-3 py-1 text-xs text-gray-500 dark:bg-gray-800 dark:text-gray-400">
          {message.blocks.map((b) => (b.type === "text" ? b.text : "")).join("")}
        </span>
      </div>
    );
  }

  if (message.role === "user") {
    return (
      <div className="my-2 flex justify-end">
        <div className="max-w-[80%] rounded-lg bg-blue-600 px-3 py-2 text-sm text-white">
          {message.blocks.map((block, i) => (
            <span key={i}>{block.type === "text" ? block.text : ""}</span>
          ))}
        </div>
      </div>
    );
  }

  // Assistant message
  return (
    <div className="my-3">
      {message.blocks.map((block, i) => {
        switch (block.type) {
          case "text":
            return (
              <TextBlock
                key={i}
                text={block.text}
                isStreaming={message.isStreaming && i === message.blocks.length - 1}
              />
            );
          case "tool_use":
            return (
              <ToolUseBlock
                key={block.id}
                name={block.name}
                input={block.input}
                toolResult={findToolResult(message.blocks, block.id)}
                isStreaming={message.isStreaming && i === message.blocks.length - 1}
              />
            );
          case "tool_result":
            // Rendered inline by ToolUseBlock, skip standalone rendering
            return null;
          case "thinking":
            return (
              <ThinkingBlock
                key={i}
                thinking={block.thinking}
                isStreaming={message.isStreaming && i === message.blocks.length - 1}
              />
            );
          default:
            return null;
        }
      })}
    </div>
  );
}
