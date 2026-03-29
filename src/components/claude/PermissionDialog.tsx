import { useState } from "react";
import { useHookStore } from "../../stores/hookStore";
import { useUIStore } from "../../stores/uiStore";
import { isTauri } from "../../lib/env";
import { respondToHook } from "../../lib/tauri";

/**
 * Global permission dialog — only shows for sessions NOT currently selected.
 * When the user is viewing a session, its permissions appear inline via PermissionBanner.
 */
export function PermissionDialog() {
  const pendingPermissions = useHookStore((s) => s.pendingPermissions);
  const removePermissionRequest = useHookStore((s) => s.removePermissionRequest);
  const selectedSessionId = useUIStore((s) => s.activeSessionId);
  const [responding, setResponding] = useState<string | null>(null);

  // Filter out permissions for the currently viewed session (handled inline)
  const unviewedPermissions = pendingPermissions.filter(
    (p) => p.sessionId !== selectedSessionId,
  );

  if (unviewedPermissions.length === 0) return null;

  const current = unviewedPermissions[0];

  async function handleDecision(decision: "allow" | "deny") {
    setResponding(current.requestId);
    try {
      if (isTauri()) {
        await respondToHook(current.requestId, decision);
      }
      removePermissionRequest(current.requestId);
    } catch (err: unknown) {
      console.error("[PermissionDialog] error:", err);
    } finally {
      setResponding(null);
    }
  }

  const isResponding = responding === current.requestId;

  // Format tool input for display
  const inputSummary = current.toolInput
    ? Object.entries(current.toolInput)
        .map(([k, v]) => {
          const val = typeof v === "string" ? v : JSON.stringify(v);
          const truncated = val.length > 120 ? val.slice(0, 120) + "..." : val;
          return `${k}: ${truncated}`;
        })
        .join("\n")
    : null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="mx-4 w-full max-w-lg rounded-sm border border-outline bg-surface shadow-xl">
        {/* Header */}
        <div className="flex items-center gap-2 border-b border-outline px-4 py-3">
          <svg
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 20 20"
            fill="currentColor"
            className="h-5 w-5 text-amber-500"
          >
            <path
              fillRule="evenodd"
              d="M8.485 2.495c.673-1.167 2.357-1.167 3.03 0l6.28 10.875c.673 1.167-.17 2.625-1.516 2.625H3.72c-1.347 0-2.189-1.458-1.515-2.625L8.485 2.495ZM10 6a.75.75 0 0 1 .75.75v3.5a.75.75 0 0 1-1.5 0v-3.5A.75.75 0 0 1 10 6Zm0 9a1 1 0 1 0 0-2 1 1 0 0 0 0 2Z"
              clipRule="evenodd"
            />
          </svg>
          <h3 className="text-sm font-semibold text-on-surface">
            Permission Request
          </h3>
          {unviewedPermissions.length > 1 && (
            <span className="ml-auto text-xs text-on-surface-faint">
              +{unviewedPermissions.length - 1} more
            </span>
          )}
        </div>

        {/* Body */}
        <div className="px-4 py-3">
          <p className="text-sm text-on-surface">
            Claude wants to use{" "}
            <code className="rounded bg-hover px-1.5 py-0.5 text-xs font-medium text-brand">
              {current.toolName}
            </code>
          </p>

          {inputSummary && (
            <pre className="mt-2 max-h-40 overflow-auto rounded bg-surface-sunken p-2.5 text-xs text-on-surface-muted">
              {inputSummary}
            </pre>
          )}
        </div>

        {/* Actions */}
        <div className="flex items-center justify-end gap-2 border-t border-outline px-4 py-3">
          <button
            onClick={() => {
              void handleDecision("deny");
            }}
            disabled={isResponding}
            className="cursor-pointer rounded border border-outline-strong px-3 py-1.5 text-xs font-medium text-on-surface-muted hover:bg-hover active:bg-active disabled:cursor-not-allowed disabled:opacity-50"
          >
            Deny
          </button>
          <button
            onClick={() => {
              void handleDecision("allow");
            }}
            disabled={isResponding}
            className="cursor-pointer rounded bg-green-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-green-500 active:bg-green-700 disabled:cursor-not-allowed disabled:opacity-50"
          >
            Allow
          </button>
        </div>
      </div>
    </div>
  );
}
