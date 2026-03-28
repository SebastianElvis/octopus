import { useState } from "react";
import type { ClaudeContentBlock } from "../../lib/types";

interface ToolUseBlockProps {
  name: string;
  input: Record<string, unknown>;
  toolResult?: ClaudeContentBlock & { type: "tool_result" };
  isStreaming?: boolean;
}

/** Color accent by tool category */
function getToolAccent(name: string): string {
  const readTools = ["Read", "Glob", "Grep", "LS", "WebFetch", "WebSearch"];
  const writeTools = ["Write", "Edit", "NotebookEdit"];
  const dangerTools = ["Bash", "BashExec"];
  if (readTools.includes(name)) return "border-l-blue-400 dark:border-l-blue-500";
  if (writeTools.includes(name)) return "border-l-amber-400 dark:border-l-amber-500";
  if (dangerTools.includes(name)) return "border-l-red-400 dark:border-l-red-500";
  return "border-l-gray-400 dark:border-l-gray-500";
}

/** Extract a human-readable summary from tool input */
function getToolSummary(name: string, input: Record<string, unknown>): string | null {
  const filePath = typeof input.file_path === "string" ? input.file_path : null;
  const pattern = typeof input.pattern === "string" ? input.pattern : null;
  const command = typeof input.command === "string" ? input.command : null;

  if ((name === "Read" || name === "Write" || name === "Edit") && filePath) return filePath;
  if ((name === "Glob" || name === "Grep") && pattern) return pattern;
  if (name === "Bash" && command) {
    return command.length > 80 ? command.slice(0, 80) + "..." : command;
  }
  return null;
}

/** Format tool result content for display */
function formatToolResult(content: string | { type: string; text?: string }[]): string {
  if (typeof content === "string") return content;
  return content.map((c) => c.text ?? "").join("\n");
}

export function ToolUseBlock({ name, input, toolResult, isStreaming }: ToolUseBlockProps) {
  const [expanded, setExpanded] = useState(false);
  const [resultExpanded, setResultExpanded] = useState(false);

  const accent = getToolAccent(name);
  const summary = getToolSummary(name, input);
  const resultText = toolResult ? formatToolResult(toolResult.content) : null;
  const resultLines = resultText?.split("\n") ?? [];
  const isLongResult = resultLines.length > 15;

  return (
    <div
      className={`my-1.5 rounded-md border border-l-[3px] border-gray-200 bg-white dark:border-gray-800 dark:bg-gray-900/50 ${accent}`}
    >
      {/* Header */}
      <button
        onClick={() => setExpanded((v) => !v)}
        className="flex w-full cursor-pointer items-center gap-2 px-3 py-2 text-left"
      >
        <svg
          className={`h-3 w-3 shrink-0 text-gray-400 transition-transform ${expanded ? "rotate-90" : ""}`}
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={2}
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
        </svg>
        <span className="text-xs font-semibold text-gray-700 dark:text-gray-300">{name}</span>
        {summary && (
          <span className="min-w-0 flex-1 truncate font-mono text-xs text-gray-400 dark:text-gray-500">
            {summary}
          </span>
        )}
        {isStreaming && (
          <span className="inline-block h-1.5 w-1.5 animate-pulse rounded-full bg-blue-400" />
        )}
        {toolResult && (
          <span className="shrink-0 rounded bg-green-100 px-1.5 py-0.5 text-[10px] font-medium text-green-700 dark:bg-green-900/40 dark:text-green-400">
            done
          </span>
        )}
      </button>

      {/* Input details */}
      {expanded && (
        <div className="border-t border-gray-100 px-3 py-2 dark:border-gray-800">
          <pre className="max-h-60 overflow-auto whitespace-pre-wrap font-mono text-xs leading-relaxed text-gray-600 dark:text-gray-400">
            {JSON.stringify(input, null, 2)}
          </pre>
        </div>
      )}

      {/* Tool result */}
      {resultText && (
        <div className="border-t border-gray-100 dark:border-gray-800">
          <button
            onClick={() => setResultExpanded((v) => !v)}
            className="flex w-full cursor-pointer items-center gap-2 px-3 py-1.5 text-left text-xs text-gray-400 hover:text-gray-500 dark:text-gray-500 dark:hover:text-gray-400"
          >
            <svg
              className={`h-2.5 w-2.5 shrink-0 transition-transform ${resultExpanded ? "rotate-90" : ""}`}
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2}
            >
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
            </svg>
            <span>Output</span>
            {isLongResult && !resultExpanded && (
              <span className="text-gray-300 dark:text-gray-600">({resultLines.length} lines)</span>
            )}
          </button>
          {resultExpanded && (
            <div className="px-3 pb-2">
              <pre className="max-h-80 overflow-auto whitespace-pre-wrap font-mono text-xs leading-relaxed text-gray-500 dark:text-gray-400">
                {isLongResult && !expanded
                  ? resultLines.slice(0, 15).join("\n") +
                    `\n... (${resultLines.length - 15} more lines)`
                  : resultText}
              </pre>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
