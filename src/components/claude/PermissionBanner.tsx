import { useState, useMemo } from "react";
import { useHookStore } from "../../stores/hookStore";
import { isTauri } from "../../lib/env";
import { respondToHook } from "../../lib/tauri";

/** Map tool name to a human-readable description and icon */
function getToolInfo(toolName: string): { label: string; icon: string; accentClass: string } {
  switch (toolName) {
    case "Write":
      return {
        label: "create a file",
        icon: "M19.5 14.25v-2.625a3.375 3.375 0 0 0-3.375-3.375h-1.5A1.125 1.125 0 0 1 13.5 7.125v-1.5a3.375 3.375 0 0 0-3.375-3.375H8.25m3.75 9v6m3-3H9m1.5-12H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 0 0-9-9Z",
        accentClass: "border-amber-400 dark:border-amber-500",
      };
    case "Edit":
    case "NotebookEdit":
      return {
        label: "edit a file",
        icon: "m16.862 4.487 1.687-1.688a1.875 1.875 0 1 1 2.652 2.652L10.582 16.07a4.5 4.5 0 0 1-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 0 1 1.13-1.897l8.932-8.931Zm0 0L19.5 7.125",
        accentClass: "border-amber-400 dark:border-amber-500",
      };
    case "Bash":
    case "BashExec":
      return {
        label: "run a command",
        icon: "m6.75 7.5 3 2.25-3 2.25m4.5 0h3m-9 8.25h13.5A2.25 2.25 0 0 0 21 18V6a2.25 2.25 0 0 0-2.25-2.25H5.25A2.25 2.25 0 0 0 3 6v12a2.25 2.25 0 0 0 2.25 2.25Z",
        accentClass: "border-red-400 dark:border-red-500",
      };
    case "Read":
      return {
        label: "read a file",
        icon: "M2.036 12.322a1.012 1.012 0 0 1 0-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.963-7.178ZM12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z",
        accentClass: "border-blue-400 dark:border-blue-500",
      };
    default:
      return {
        label: `use ${toolName}`,
        icon: "M11.42 15.17 17.25 21A2.652 2.652 0 0 0 21 17.25l-5.877-5.877M11.42 15.17l2.496-3.03c.317-.384.74-.626 1.208-.766M11.42 15.17l-4.655 5.653a2.548 2.548 0 1 1-3.586-3.586l6.837-5.63m5.108-.233c.55-.164 1.163-.188 1.743-.14a4.5 4.5 0 0 0 4.486-6.336l-3.276 3.277a3.004 3.004 0 0 1-2.25-2.25l3.276-3.276a4.5 4.5 0 0 0-6.336 4.486c.091 1.076-.071 2.264-.904 2.95l-.102.085m-1.745 1.437L5.909 7.5H4.5L2.25 3.75l1.5-1.5L7.5 4.5v1.409l4.26 4.26m-1.745 1.437 1.745-1.437m6.615 8.206L15.75 15.75M4.867 19.125h.008v.008h-.008v-.008Z",
        accentClass: "border-gray-400 dark:border-gray-500",
      };
  }
}

/** Shorten a file path for display */
function shortenPath(fullPath: string): string {
  const segments = fullPath.split("/").filter(Boolean);
  if (segments.length <= 3) return fullPath;
  return ".../" + segments.slice(-3).join("/");
}

/** Format tool input into a readable one-liner or code block */
function formatInput(toolName: string, input: Record<string, unknown>): string | null {
  const filePath = typeof input.file_path === "string" ? input.file_path : null;
  const command = typeof input.command === "string" ? input.command : null;
  const content = typeof input.content === "string" ? input.content : null;

  if ((toolName === "Write" || toolName === "Read") && filePath) {
    return shortenPath(filePath);
  }
  if (toolName === "Edit" && filePath) {
    return shortenPath(filePath);
  }
  if ((toolName === "Bash" || toolName === "BashExec") && command) {
    return command.length > 200 ? command.slice(0, 200) + "..." : command;
  }
  if (content && filePath) {
    return shortenPath(filePath);
  }
  // Fallback: show key-value summary
  const entries = Object.entries(input);
  if (entries.length === 0) return null;
  return entries
    .slice(0, 3)
    .map(([k, v]) => {
      const val = typeof v === "string" ? v : JSON.stringify(v);
      const truncated = val.length > 80 ? val.slice(0, 80) + "..." : val;
      return `${k}: ${truncated}`;
    })
    .join("\n");
}

interface PermissionBannerProps {
  sessionId: string;
}

export function PermissionBanner({ sessionId }: PermissionBannerProps) {
  const allPending = useHookStore((s) => s.pendingPermissions);
  const removePermissionRequest = useHookStore((s) => s.removePermissionRequest);
  const pendingPermissions = useMemo(
    () => allPending.filter((p) => p.sessionId === sessionId),
    [allPending, sessionId],
  );
  const [responding, setResponding] = useState<string | null>(null);

  if (pendingPermissions.length === 0) return null;

  const current = pendingPermissions[0];
  const { label, icon, accentClass } = getToolInfo(current.toolName);
  const inputDisplay = current.toolInput ? formatInput(current.toolName, current.toolInput) : null;
  const isBashLike = current.toolName === "Bash" || current.toolName === "BashExec";
  const isResponding = responding === current.requestId;

  async function handleDecision(decision: "allow" | "deny") {
    setResponding(current.requestId);
    try {
      if (isTauri()) {
        await respondToHook(current.requestId, decision);
      }
      removePermissionRequest(current.requestId);
    } catch (err: unknown) {
      console.error("[PermissionBanner] error:", err);
    } finally {
      setResponding(null);
    }
  }

  return (
    <div className={`mx-3 mb-2 rounded-lg border-l-[3px] bg-amber-50/50 p-3 dark:bg-amber-950/20 ${accentClass}`}>
      {/* What Claude wants to do */}
      <div className="mb-2 flex items-center gap-2">
        <svg
          className="h-4 w-4 shrink-0 text-amber-500 dark:text-amber-400"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={1.5}
        >
          <path strokeLinecap="round" strokeLinejoin="round" d={icon} />
        </svg>
        <span className="text-sm text-gray-700 dark:text-gray-300">
          Claude wants to{" "}
          <span className="font-medium">{label}</span>
        </span>
        {pendingPermissions.length > 1 && (
          <span className="ml-auto rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-medium text-amber-700 dark:bg-amber-900/40 dark:text-amber-400">
            +{pendingPermissions.length - 1} more
          </span>
        )}
      </div>

      {/* Tool input details */}
      {inputDisplay && (
        <div className="mb-3">
          <pre
            className={`overflow-hidden text-ellipsis whitespace-nowrap rounded px-2.5 py-1.5 text-xs ${
              isBashLike
                ? "bg-gray-900 text-green-400 dark:bg-gray-950"
                : "bg-white text-gray-600 dark:bg-gray-900 dark:text-gray-400"
            }`}
            title={inputDisplay}
          >
            {isBashLike && <span className="mr-1 select-none text-gray-500">$</span>}
            {inputDisplay}
          </pre>
        </div>
      )}

      {/* Action buttons */}
      <div className="flex items-center gap-2">
        <button
          onClick={() => {
            void handleDecision("allow");
          }}
          disabled={isResponding}
          className="flex cursor-pointer items-center gap-1.5 rounded-md bg-green-600 px-3 py-1.5 text-xs font-medium text-white shadow-sm hover:bg-green-500 active:bg-green-700 disabled:cursor-not-allowed disabled:opacity-50"
        >
          <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="m4.5 12.75 6 6 9-13.5" />
          </svg>
          Allow
        </button>
        <button
          onClick={() => {
            void handleDecision("deny");
          }}
          disabled={isResponding}
          className="flex cursor-pointer items-center gap-1.5 rounded-md border border-gray-300 bg-white px-3 py-1.5 text-xs font-medium text-gray-600 shadow-sm hover:bg-gray-50 active:bg-gray-100 disabled:cursor-not-allowed disabled:opacity-50 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-400 dark:hover:bg-gray-700"
        >
          <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" />
          </svg>
          Deny
        </button>
      </div>
    </div>
  );
}
