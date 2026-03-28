import { useState } from "react";
import type { ClaudeContentBlock } from "../../lib/types";

interface ToolUseBlockProps {
  name: string;
  input: Record<string, unknown>;
  toolResult?: ClaudeContentBlock & { type: "tool_result" };
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

/** Map tool name to an action verb + SVG icon for scannability */
function getToolVerb(name: string): { verb: string; icon: string } {
  switch (name) {
    case "Read":
      return {
        verb: "Read",
        icon: "M2.036 12.322a1.012 1.012 0 0 1 0-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.963-7.178ZM12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z",
      }; // eye
    case "Write":
      return {
        verb: "Created",
        icon: "M19.5 14.25v-2.625a3.375 3.375 0 0 0-3.375-3.375h-1.5A1.125 1.125 0 0 1 13.5 7.125v-1.5a3.375 3.375 0 0 0-3.375-3.375H8.25m3.75 9v6m3-3H9m1.5-12H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 0 0-9-9Z",
      }; // document-plus
    case "Edit":
    case "NotebookEdit":
      return {
        verb: "Edited",
        icon: "m16.862 4.487 1.687-1.688a1.875 1.875 0 1 1 2.652 2.652L10.582 16.07a4.5 4.5 0 0 1-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 0 1 1.13-1.897l8.932-8.931Zm0 0L19.5 7.125",
      }; // pencil
    case "Bash":
    case "BashExec":
      return {
        verb: "Ran",
        icon: "m6.75 7.5 3 2.25-3 2.25m4.5 0h3m-9 8.25h13.5A2.25 2.25 0 0 0 21 18V6a2.25 2.25 0 0 0-2.25-2.25H5.25A2.25 2.25 0 0 0 3 6v12a2.25 2.25 0 0 0 2.25 2.25Z",
      }; // command-line
    case "Glob":
    case "Grep":
      return {
        verb: "Searched",
        icon: "m21 21-5.197-5.197m0 0A7.5 7.5 0 1 0 5.196 5.196a7.5 7.5 0 0 0 10.607 10.607Z",
      }; // magnifying-glass
    case "WebFetch":
    case "WebSearch":
      return {
        verb: "Fetched",
        icon: "M12 21a9.004 9.004 0 0 0 8.716-6.747M12 21a9.004 9.004 0 0 1-8.716-6.747M12 21c2.485 0 4.5-4.03 4.5-9S14.485 3 12 3m0 18c-2.485 0-4.5-4.03-4.5-9S9.515 3 12 3m0 0a8.997 8.997 0 0 1 7.843 4.582M12 3a8.997 8.997 0 0 0-7.843 4.582m15.686 0A11.953 11.953 0 0 1 12 10.5c-2.998 0-5.74-1.1-7.843-2.918m15.686 0A8.959 8.959 0 0 1 21 12c0 .778-.099 1.533-.284 2.253m0 0A17.919 17.919 0 0 1 12 16.5c-3.162 0-6.133-.815-8.716-2.247m0 0A9.015 9.015 0 0 1 3 12c0-1.605.42-3.113 1.157-4.418",
      }; // globe
    case "LS":
      return {
        verb: "Listed",
        icon: "M3.75 12h16.5m-16.5 3.75h16.5M3.75 19.5h16.5M5.625 4.5h12.75a1.875 1.875 0 0 1 0 3.75H5.625a1.875 1.875 0 0 1 0-3.75Z",
      }; // list
    default:
      return {
        verb: name,
        icon: "M11.42 15.17 17.25 21A2.652 2.652 0 0 0 21 17.25l-5.877-5.877M11.42 15.17l2.496-3.03c.317-.384.74-.626 1.208-.766M11.42 15.17l-4.655 5.653a2.548 2.548 0 1 1-3.586-3.586l6.837-5.63m5.108-.233c.55-.164 1.163-.188 1.743-.14a4.5 4.5 0 0 0 4.486-6.336l-3.276 3.277a3.004 3.004 0 0 1-2.25-2.25l3.276-3.276a4.5 4.5 0 0 0-6.336 4.486c.091 1.076-.071 2.264-.904 2.95l-.102.085m-1.745 1.437L5.909 7.5H4.5L2.25 3.75l1.5-1.5L7.5 4.5v1.409l4.26 4.26m-1.745 1.437 1.745-1.437m6.615 8.206L15.75 15.75M4.867 19.125h.008v.008h-.008v-.008Z",
      }; // wrench
  }
}

/** Shorten an absolute file path for display: show last 2 segments */
function shortenPath(fullPath: string): { short: string; full: string } {
  const segments = fullPath.split("/").filter(Boolean);
  if (segments.length <= 2) {
    const short = segments.join("/");
    return { short, full: fullPath };
  }
  const short = segments.slice(-2).join("/");
  return { short, full: fullPath };
}

/** Extract a human-readable summary from tool input */
function getToolSummary(
  name: string,
  input: Record<string, unknown>,
): { display: string; tooltip?: string } | null {
  const filePath = typeof input.file_path === "string" ? input.file_path : null;
  const pattern = typeof input.pattern === "string" ? input.pattern : null;
  const command = typeof input.command === "string" ? input.command : null;

  if ((name === "Read" || name === "Write" || name === "Edit") && filePath) {
    const { short, full } = shortenPath(filePath);
    return { display: short, tooltip: full !== short ? full : undefined };
  }
  if ((name === "Glob" || name === "Grep") && pattern) {
    const path = typeof input.path === "string" ? input.path : null;
    const display = path ? `${pattern} in ${shortenPath(path).short}` : pattern;
    return { display };
  }
  if (name === "Bash" && command) {
    const display = command.length > 120 ? command.slice(0, 120) + "..." : command;
    return { display };
  }
  return null;
}

/** Format tool result content for display */
function formatToolResult(content: string | { type: string; text?: string }[]): string {
  if (typeof content === "string") return content;
  return content.map((c) => c.text ?? "").join("\n");
}

export function ToolUseBlock({ name, input, toolResult }: ToolUseBlockProps) {
  const [expanded, setExpanded] = useState(false);
  const [resultExpanded, setResultExpanded] = useState(false);

  const accent = getToolAccent(name);
  const { verb, icon } = getToolVerb(name);
  const summary = getToolSummary(name, input);
  const resultText = toolResult ? formatToolResult(toolResult.content) : null;
  const resultLines = resultText?.split("\n") ?? [];
  const isLongResult = resultLines.length > 15;

  // For Bash, show command prominently in a code-style inline
  const isBash = name === "Bash" || name === "BashExec";

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
        <svg
          className="h-3.5 w-3.5 shrink-0 text-gray-500 dark:text-gray-400"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={1.5}
        >
          <path strokeLinecap="round" strokeLinejoin="round" d={icon} />
        </svg>
        <span className="shrink-0 text-xs font-semibold text-gray-700 dark:text-gray-300">
          {verb}
        </span>
        {summary && (
          <span
            className={`min-w-0 flex-1 truncate text-xs ${
              isBash
                ? "rounded bg-gray-100 px-1.5 py-0.5 font-mono text-gray-600 dark:bg-gray-800 dark:text-gray-400"
                : "font-mono text-gray-500 dark:text-gray-400"
            }`}
            title={summary.tooltip}
          >
            {summary.display}
          </span>
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
