import { useState } from "react";
import type { ClaudeContentBlock } from "../../lib/types";
import { AnimatedCollapse } from "./AnimatedCollapse";
import { getToolSummary, formatToolResult } from "./ToolUseBlock";

export interface ToolUseGroupItem {
  name: string;
  input: Record<string, unknown>;
  toolResult?: ClaudeContentBlock & { type: "tool_result" };
}

interface ToolUseGroupProps {
  verb: string;
  icon: string;
  accent: string;
  items: ToolUseGroupItem[];
}

function GroupItemRow({ item, isLast }: { item: ToolUseGroupItem; isLast: boolean }) {
  const [expanded, setExpanded] = useState(false);
  const summary = getToolSummary(item.name, item.input);
  const resultText = item.toolResult ? formatToolResult(item.toolResult.content) : null;
  const resultLines = resultText?.split("\n") ?? [];
  const isBash = item.name === "Bash" || item.name === "BashExec";

  return (
    <div className={!isLast ? "border-b border-outline-muted" : ""}>
      <button
        onClick={() => setExpanded((v) => !v)}
        className="flex w-full cursor-pointer items-center gap-2 px-3 py-1.5 text-left"
      >
        <svg
          className={`h-2.5 w-2.5 shrink-0 text-on-surface-faint transition-transform duration-200 ${expanded ? "rotate-90" : ""}`}
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={2}
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
        </svg>
        <span
          className={`min-w-0 flex-1 truncate text-xs ${
            isBash
              ? "rounded bg-hover px-1.5 py-0.5 font-mono text-on-surface-muted"
              : "font-mono text-on-surface-muted"
          }`}
          title={summary?.tooltip}
        >
          {summary?.display ?? item.name}
        </span>
      </button>

      <AnimatedCollapse expanded={expanded}>
        <div className="px-3 pb-2">
          <pre className="max-h-60 overflow-auto whitespace-pre-wrap font-mono text-xs leading-relaxed text-on-surface-muted">
            {JSON.stringify(item.input, null, 2)}
          </pre>
          {resultText && (
            <div className="mt-2">
              <div className="mb-1 text-xs text-on-surface-faint">
                Output
                {resultLines.length > 15 && ` (${resultLines.length} lines)`}
              </div>
              <pre className="max-h-80 overflow-auto whitespace-pre-wrap font-mono text-xs leading-relaxed text-on-surface-muted">
                {resultLines.length > 15
                  ? resultLines.slice(0, 15).join("\n") +
                    `\n... (${resultLines.length - 15} more lines)`
                  : resultText}
              </pre>
            </div>
          )}
        </div>
      </AnimatedCollapse>
    </div>
  );
}

export function ToolUseGroup({ verb, icon, accent, items }: ToolUseGroupProps) {
  const allDone = items.every((item) => item.toolResult);

  return (
    <div className={`my-1.5 rounded-sm border border-l-[3px] border-outline bg-surface ${accent}`}>
      {/* Group header */}
      <div className="flex items-center gap-2 px-3 py-2">
        <svg
          className="h-3.5 w-3.5 shrink-0 text-on-surface-muted"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={1.5}
        >
          <path strokeLinecap="round" strokeLinejoin="round" d={icon} />
        </svg>
        <span className="shrink-0 text-xs font-semibold text-on-surface">{verb}</span>
        <span className="rounded bg-hover px-1.5 py-0.5 text-[10px] font-medium text-on-surface-muted">
          ×{items.length}
        </span>
        {allDone && (
          <span className="ml-auto shrink-0 rounded bg-status-done-muted px-1.5 py-0.5 text-[10px] font-medium text-status-done">
            done
          </span>
        )}
      </div>

      {/* Compact item list — each row individually expandable for details */}
      <div className="border-t border-outline-muted">
        {items.map((item, i) => (
          <GroupItemRow key={i} item={item} isLast={i === items.length - 1} />
        ))}
      </div>
    </div>
  );
}
