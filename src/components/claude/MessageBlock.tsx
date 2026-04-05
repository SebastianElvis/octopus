import type { ClaudeMessage, ClaudeContentBlock } from "../../lib/types";
import { TextBlock } from "./TextBlock";
import { ToolUseBlock, getToolVerb, getToolAccent } from "./ToolUseBlock";
import { ToolUseGroup } from "./ToolUseGroup";
import type { ToolUseGroupItem } from "./ToolUseGroup";
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

/** A renderable item after grouping consecutive same-verb tool_use blocks */
type RenderedItem =
  | { kind: "text"; block: ClaudeContentBlock & { type: "text" }; index: number }
  | { kind: "thinking"; block: ClaudeContentBlock & { type: "thinking" }; index: number }
  | { kind: "tool_use"; block: ClaudeContentBlock & { type: "tool_use" }; index: number }
  | {
      kind: "tool_group";
      verb: string;
      icon: string;
      accent: string;
      items: { block: ClaudeContentBlock & { type: "tool_use" }; index: number }[];
    };

/** Group consecutive tool_use blocks that share the same verb into a single item */
function groupConsecutiveTools(blocks: ClaudeContentBlock[]): RenderedItem[] {
  const result: RenderedItem[] = [];
  let pendingGroup: {
    verb: string;
    icon: string;
    accent: string;
    items: { block: ClaudeContentBlock & { type: "tool_use" }; index: number }[];
  } | null = null;

  const flushGroup = () => {
    if (!pendingGroup) return;
    if (pendingGroup.items.length >= 2) {
      result.push({ kind: "tool_group", ...pendingGroup });
    } else {
      result.push({
        kind: "tool_use",
        block: pendingGroup.items[0].block,
        index: pendingGroup.items[0].index,
      });
    }
    pendingGroup = null;
  };

  for (let i = 0; i < blocks.length; i++) {
    const block = blocks[i];

    // tool_results are rendered inline by ToolUseBlock — skip them
    if (block.type === "tool_result") continue;

    if (block.type === "tool_use") {
      const { verb, icon } = getToolVerb(block.name);
      const accent = getToolAccent(block.name);

      if (pendingGroup) {
        if (pendingGroup.verb === verb) {
          pendingGroup.items.push({ block, index: i });
          continue;
        }
        flushGroup();
      }
      pendingGroup = { verb, icon, accent, items: [{ block, index: i }] };
    } else {
      flushGroup();
      if (block.type === "text") {
        result.push({ kind: "text", block, index: i });
      } else {
        result.push({ kind: "thinking", block, index: i });
      }
    }
  }

  flushGroup();
  return result;
}

export function MessageBlock({ message }: MessageBlockProps) {
  if (message.role === "system") {
    return (
      <div className="my-2 flex justify-center">
        <span className="rounded-full bg-hover px-3 py-1 text-xs text-on-surface-muted">
          {message.blocks.map((b) => (b.type === "text" ? b.text : "")).join("")}
        </span>
      </div>
    );
  }

  if (message.role === "user") {
    // Separate thinking blocks from other content — during session resume the
    // CLI may replay user events that contain thinking blocks. Render those as
    // ThinkingBlock components instead of inside the user bubble.
    const thinkingBlocks = message.blocks.filter(
      (b): b is ClaudeContentBlock & { type: "thinking" } => b.type === "thinking",
    );
    const otherBlocks = message.blocks.filter((b) => b.type !== "thinking");

    // Only render the user bubble if there is visible text.
    // Tool-result-only messages (sent by Claude Code as user messages wrapping
    // tool results) have no text and would render as empty blue bubbles.
    const visibleText = otherBlocks
      .filter((b): b is ClaudeContentBlock & { type: "text" } => b.type === "text")
      .map((b) => b.text)
      .join("")
      .trim();

    if (!visibleText && thinkingBlocks.length === 0) return null;

    return (
      <>
        {thinkingBlocks.map((block, i) => (
          <ThinkingBlock key={`thinking-${i}`} thinking={block.thinking} />
        ))}
        {visibleText && (
          <div className="my-2 flex justify-end">
            <div className="max-w-[80%] rounded-sm bg-brand px-3 py-2 text-sm text-white">
              {otherBlocks.map((block, i) => (
                <span key={i}>{block.type === "text" ? block.text : ""}</span>
              ))}
            </div>
          </div>
        )}
      </>
    );
  }

  // Assistant message — group consecutive same-verb tool_use blocks
  const grouped = groupConsecutiveTools(message.blocks);

  return (
    <div className="my-3">
      {grouped.map((item, i) => {
        switch (item.kind) {
          case "text":
            return (
              <TextBlock
                key={item.index}
                text={item.block.text}
                isStreaming={message.isStreaming && item.index === message.blocks.length - 1}
              />
            );
          case "tool_use":
            return (
              <ToolUseBlock
                key={item.block.id}
                name={item.block.name}
                input={item.block.input}
                toolResult={findToolResult(message.blocks, item.block.id)}
              />
            );
          case "tool_group": {
            const groupItems: ToolUseGroupItem[] = item.items.map((t) => ({
              name: t.block.name,
              input: t.block.input,
              toolResult: findToolResult(message.blocks, t.block.id),
            }));
            return (
              <ToolUseGroup
                key={`group-${i}`}
                verb={item.verb}
                icon={item.icon}
                accent={item.accent}
                items={groupItems}
              />
            );
          }
          case "thinking":
            return (
              <ThinkingBlock
                key={item.index}
                thinking={item.block.thinking}
                isStreaming={message.isStreaming && item.index === message.blocks.length - 1}
              />
            );
          default:
            return null;
        }
      })}
    </div>
  );
}
