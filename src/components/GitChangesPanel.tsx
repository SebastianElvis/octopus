import { useEffect, useState } from "react";
import { useGitStore } from "../stores/gitStore";
import { useSessionStore } from "../stores/sessionStore";
import { isTauri } from "../lib/env";
import { sendFollowup } from "../lib/tauri";
import type { ChangedFile } from "../lib/types";

interface GitChangesPanelProps {
  worktreePath: string | undefined;
  sessionId?: string;
  sessionStatus?: string;
}

const STATUS_BADGE: Record<string, { label: string; cls: string }> = {
  modified: { label: "M", cls: "text-yellow-600 dark:text-yellow-400" },
  added: { label: "A", cls: "text-green-600 dark:text-green-400" },
  deleted: { label: "D", cls: "text-red-600 dark:text-red-400" },
  renamed: { label: "R", cls: "text-blue-600 dark:text-blue-400" },
  untracked: { label: "U", cls: "text-on-surface-muted" },
  copied: { label: "C", cls: "text-purple-600 dark:text-purple-400" },
};

/**
 * Determine the workflow phase based on git state.
 * - "stage": there are unstaged changes to stage
 * - "commit": there are staged files ready to commit
 * - "push": there are unpushed commits
 * - "pr": everything is pushed, ready to open a PR
 * - "clean": nothing to do
 */
type WorkflowPhase = "stage" | "commit" | "push" | "pr" | "clean";

export function GitChangesPanel({ worktreePath, sessionId, sessionStatus }: GitChangesPanelProps) {
  const {
    changedFiles,
    loading,
    commitMessage,
    pushing,
    committing,
    error,
    successMessage,
    successUrl,
    syncStatus,
    setWorktreePath,
    refreshChanges,
    stageFiles,
    unstageFiles,
    discardFiles,
    selectFile,
    setCommitMessage,
    commit,
    push,
  } = useGitStore();

  const addOptimisticUserMessage = useSessionStore((s) => s.addOptimisticUserMessage);

  const [discardConfirmPath, setDiscardConfirmPath] = useState<string | null>(null);
  const [discardAllConfirm, setDiscardAllConfirm] = useState(false);
  const [creatingPr, setCreatingPr] = useState(false);

  useEffect(() => {
    setWorktreePath(worktreePath ?? null);
  }, [worktreePath, setWorktreePath]);

  // Auto-poll for changes every 3s while the panel is mounted and has a worktree
  useEffect(() => {
    if (!worktreePath) return;
    const interval = setInterval(() => {
      void refreshChanges();
    }, 3000);
    return () => clearInterval(interval);
  }, [worktreePath, refreshChanges]);

  const isSessionDone = sessionStatus === "done" || sessionStatus === "attention";

  if (!worktreePath) {
    return (
      <div className="flex h-full items-center justify-center">
        <p className="text-xs text-on-surface-faint">No worktree</p>
      </div>
    );
  }

  // If the session is done and the worktree may have been cleaned up, show a clear message
  if (isSessionDone && error?.includes("No such file or directory")) {
    return (
      <div className="flex h-full items-center justify-center px-4">
        <p className="text-center text-xs text-on-surface-faint">
          Session completed. Worktree has been cleaned up.
        </p>
      </div>
    );
  }

  const staged = changedFiles.filter((f) => f.staged);
  const unstaged = changedFiles.filter((f) => !f.staged);

  // Determine workflow phase
  const ahead = syncStatus?.ahead ?? 0;
  const hasUpstream = syncStatus?.hasUpstream ?? true;
  const phase: WorkflowPhase =
    staged.length > 0 || (unstaged.length > 0 && commitMessage.trim())
      ? "commit"
      : unstaged.length > 0
        ? "stage"
        : ahead > 0 || !hasUpstream
          ? "push"
          : changedFiles.length === 0 && !loading
            ? successMessage
              ? "pr"
              : "clean"
            : "clean";

  async function handleCommit() {
    await commit();
  }

  async function handlePush() {
    await push();
  }

  const createPrPrompt =
    "Create a pull request for the changes on this branch. Commit any uncommitted changes first, then push and create the PR.";

  async function handleCreatePr() {
    if (!sessionId || creatingPr) return;
    setCreatingPr(true);
    addOptimisticUserMessage(sessionId, createPrPrompt);
    try {
      if (isTauri()) {
        await sendFollowup(sessionId, createPrPrompt);
      }
    } catch (err: unknown) {
      console.error("[GitChangesPanel] create PR error:", err);
    } finally {
      setCreatingPr(false);
    }
  }

  function handleStageAll() {
    const paths = unstaged.map((f) => f.path);
    if (paths.length > 0) void stageFiles(paths);
  }

  function handleUnstageAll() {
    const paths = staged.map((f) => f.path);
    if (paths.length > 0) void unstageFiles(paths);
  }

  function handleDiscard(path: string) {
    if (discardConfirmPath === path) {
      void discardFiles([path]);
      setDiscardConfirmPath(null);
    } else {
      setDiscardConfirmPath(path);
    }
  }

  function handleDiscardAll() {
    if (discardAllConfirm) {
      const paths = unstaged.map((f) => f.path);
      if (paths.length > 0) void discardFiles(paths);
      setDiscardAllConfirm(false);
    } else {
      setDiscardAllConfirm(true);
    }
  }

  return (
    <div className="flex h-full flex-col">
      {/* Header */}
      <div className="flex shrink-0 items-center justify-between border-b border-outline px-3 py-2">
        <div className="flex items-center gap-2">
          <h3 className="text-xs font-semibold text-on-surface">Changes</h3>
          {changedFiles.length > 0 && <DiffSummary files={changedFiles} />}
        </div>
        <button
          onClick={() => {
            void refreshChanges();
          }}
          className="cursor-pointer rounded p-1 text-on-surface-faint hover:bg-hover hover:text-on-surface-muted active:bg-active focus:outline-none focus:ring-2 focus:ring-brand focus:ring-offset-1"
          title="Refresh"
        >
          <svg
            className="h-3.5 w-3.5"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={2}
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
            />
          </svg>
        </button>
      </div>

      {loading && changedFiles.length === 0 && (
        <div className="flex h-20 items-center justify-center">
          <span className="text-xs text-on-surface-faint">Loading...</span>
        </div>
      )}

      {/* File lists */}
      <div className="flex-1 overflow-y-auto">
        {/* Staged */}
        {staged.length > 0 && (
          <FileSection
            title="Staged"
            files={staged}
            onSelect={(f) => {
              void selectFile(f.path, true);
            }}
            actionLabel="−"
            actionTitle="Unstage"
            onAction={(f) => {
              void unstageFiles([f.path]);
            }}
            onBulkAction={handleUnstageAll}
            bulkLabel="Unstage all"
          />
        )}

        {/* Unstaged */}
        {unstaged.length > 0 && (
          <FileSection
            title="Changes"
            files={unstaged}
            onSelect={(f) => {
              void selectFile(f.path, false);
            }}
            actionLabel="+"
            actionTitle="Stage"
            onAction={(f) => {
              void stageFiles([f.path]);
            }}
            secondActionLabel="Discard"
            secondActionTitle="Discard changes"
            onSecondAction={(f) => handleDiscard(f.path)}
            discardConfirmPath={discardConfirmPath}
            onBulkAction={handleStageAll}
            bulkLabel="Stage all"
            onDiscardAll={handleDiscardAll}
            discardAllConfirm={discardAllConfirm}
          />
        )}

        {!loading && changedFiles.length === 0 && (
          <div className="flex h-20 items-center justify-center">
            <span className="text-xs text-on-surface-faint">No changes</span>
          </div>
        )}
      </div>

      {/* ── Action area ── */}
      <div className="shrink-0 border-t border-outline">
        {/* Sync status strip */}
        {syncStatus && (ahead > 0 || syncStatus.behind > 0 || !hasUpstream) && (
          <div className="flex items-center gap-2 border-b border-outline-muted px-3 py-1.5">
            {!hasUpstream && (
              <span className="text-xs text-on-surface-faint">No upstream branch</span>
            )}
            {hasUpstream && ahead > 0 && (
              <span className="text-xs text-on-surface-muted">
                <span className="font-medium text-brand">{ahead}</span> unpushed
              </span>
            )}
            {hasUpstream && syncStatus.behind > 0 && (
              <span className="text-xs text-on-surface-muted">
                <span className="font-medium text-accent">{syncStatus.behind}</span> behind
              </span>
            )}
          </div>
        )}

        {/* Success banner */}
        {successMessage && (
          <div className="flex items-center gap-2 border-b border-status-done/20 bg-status-done-muted px-3 py-2">
            <svg
              className="h-3.5 w-3.5 shrink-0 text-status-done"
              viewBox="0 0 16 16"
              fill="currentColor"
            >
              <path d="M8 16A8 8 0 1 0 8 0a8 8 0 0 0 0 16Zm3.78-9.72a.75.75 0 0 0-1.06-1.06L6.75 9.19 5.28 7.72a.75.75 0 0 0-1.06 1.06l2 2a.75.75 0 0 0 1.06 0l4.5-4.5Z" />
            </svg>
            <span className="flex-1 text-xs font-medium text-status-done">{successMessage}</span>
            {successUrl && (
              <a
                href={successUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="text-xs text-status-done hover:underline"
              >
                View
              </a>
            )}
          </div>
        )}

        {/* Error banner */}
        {error && (
          <div className="flex items-center gap-2 border-b border-danger/20 bg-danger-muted px-3 py-2">
            <svg
              className="h-3.5 w-3.5 shrink-0 text-danger"
              viewBox="0 0 16 16"
              fill="currentColor"
            >
              <path d="M2.343 13.657A8 8 0 1 1 13.658 2.343 8 8 0 0 1 2.343 13.657ZM6.03 4.97a.751.751 0 0 0-1.042.018.751.751 0 0 0-.018 1.042L6.94 8 4.97 9.97a.749.749 0 0 0 .326 1.275.749.749 0 0 0 .734-.215L8 9.06l1.97 1.97a.749.749 0 0 0 1.275-.326.749.749 0 0 0-.215-.734L9.06 8l1.97-1.97a.749.749 0 0 0-.326-1.275.749.749 0 0 0-.734.215L8 6.94Z" />
            </svg>
            <span className="flex-1 text-xs text-danger">{error}</span>
          </div>
        )}

        {/* Commit message — only when there are staged or unstaged files */}
        {changedFiles.length > 0 && (
          <div className="px-3 pt-3 pb-2">
            <textarea
              value={commitMessage}
              onChange={(e) => setCommitMessage(e.target.value)}
              placeholder="Commit message..."
              rows={2}
              className="w-full resize-none rounded border border-outline bg-surface-raised px-2 py-1.5 text-xs text-on-surface placeholder-on-surface-faint focus:border-brand focus:outline-none"
            />
          </div>
        )}

        {/* Workflow step indicator + actions */}
        <div className="px-3 pb-3">
          {/* Step dots */}
          <div className="mb-2 flex items-center justify-center gap-1.5">
            <StepDot
              active={phase === "stage" || phase === "commit"}
              done={phase === "push" || phase === "pr"}
              label="Commit"
            />
            <div className="h-px w-3 bg-outline-muted" />
            <StepDot active={phase === "push"} done={phase === "pr"} label="Push" />
            <div className="h-px w-3 bg-outline-muted" />
            <StepDot active={phase === "pr"} done={false} label="PR" />
          </div>

          {/* Primary action — contextual */}
          {phase === "stage" && (
            <button
              onClick={handleStageAll}
              className="w-full cursor-pointer rounded bg-surface-raised px-3 py-2 text-xs font-medium text-on-surface hover:bg-hover active:bg-active focus:outline-none focus:ring-2 focus:ring-brand focus:ring-offset-1"
            >
              Stage all {unstaged.length} file{unstaged.length !== 1 ? "s" : ""}
            </button>
          )}

          {phase === "commit" && (
            <button
              onClick={() => {
                void handleCommit();
              }}
              disabled={committing || pushing || !commitMessage.trim() || staged.length === 0}
              className="w-full cursor-pointer rounded bg-brand px-3 py-2 text-xs font-medium text-white hover:bg-brand/90 active:bg-brand focus:outline-none focus:ring-2 focus:ring-brand focus:ring-offset-1 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {committing
                ? "Committing..."
                : staged.length > 0
                  ? `Commit ${staged.length} file${staged.length !== 1 ? "s" : ""}`
                  : "Stage files to commit"}
            </button>
          )}

          {phase === "push" && (
            <button
              onClick={() => {
                void handlePush();
              }}
              disabled={pushing || committing}
              className="w-full cursor-pointer rounded bg-brand px-3 py-2 text-xs font-medium text-white hover:bg-brand/90 active:bg-brand focus:outline-none focus:ring-2 focus:ring-brand focus:ring-offset-1 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {pushing
                ? "Pushing..."
                : !hasUpstream
                  ? "Publish branch"
                  : `Push ${ahead} commit${ahead !== 1 ? "s" : ""}`}
            </button>
          )}

          {phase === "pr" && (
            <button
              onClick={() => {
                void handleCreatePr();
              }}
              disabled={creatingPr || !sessionId}
              className="w-full cursor-pointer rounded bg-status-done px-3 py-2 text-xs font-medium text-white hover:opacity-90 active:opacity-100 focus:outline-none focus:ring-2 focus:ring-status-done focus:ring-offset-1 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {creatingPr ? "Creating..." : "Create pull request"}
            </button>
          )}

          {phase === "clean" && !successMessage && (
            <p className="py-1 text-center text-xs text-on-surface-faint">Up to date</p>
          )}

          {/* Secondary actions — always accessible */}
          {phase !== "clean" && (
            <div className="mt-2 flex justify-center gap-3">
              {phase !== "commit" && phase !== "stage" && changedFiles.length > 0 && (
                <button
                  onClick={() => {
                    void handleCommit();
                  }}
                  disabled={committing || !commitMessage.trim() || staged.length === 0}
                  className="cursor-pointer text-xs text-on-surface-faint hover:text-on-surface-muted disabled:opacity-40"
                >
                  Commit
                </button>
              )}
              {phase !== "push" && (ahead > 0 || !hasUpstream) && (
                <button
                  onClick={() => {
                    void handlePush();
                  }}
                  disabled={pushing}
                  className="cursor-pointer text-xs text-on-surface-faint hover:text-on-surface-muted disabled:opacity-40"
                >
                  Push
                </button>
              )}
              {phase !== "pr" && sessionId && (
                <button
                  onClick={() => {
                    void handleCreatePr();
                  }}
                  disabled={creatingPr}
                  className="cursor-pointer text-xs text-on-surface-faint hover:text-on-surface-muted disabled:opacity-40"
                >
                  Create PR
                </button>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function FileSection({
  title,
  files,
  onSelect,
  actionLabel,
  actionTitle,
  onAction,
  secondActionLabel,
  secondActionTitle,
  onSecondAction,
  discardConfirmPath,
  onBulkAction,
  bulkLabel,
  onDiscardAll,
  discardAllConfirm,
}: {
  title: string;
  files: ChangedFile[];
  onSelect: (f: ChangedFile) => void;
  actionLabel: string;
  actionTitle: string;
  onAction: (f: ChangedFile) => void;
  secondActionLabel?: string;
  secondActionTitle?: string;
  onSecondAction?: (f: ChangedFile) => void;
  discardConfirmPath?: string | null;
  onBulkAction: () => void;
  bulkLabel: string;
  onDiscardAll?: () => void;
  discardAllConfirm?: boolean;
}) {
  return (
    <div>
      <div className="flex items-center justify-between px-3 py-2">
        <span className="text-xs font-semibold uppercase tracking-wide text-on-surface-muted">
          {title} ({files.length})
        </span>
        <div className="flex items-center gap-2">
          {onDiscardAll && (
            <button
              onClick={onDiscardAll}
              className={`cursor-pointer text-xs ${
                discardAllConfirm
                  ? "font-medium text-red-600 dark:text-red-400"
                  : "text-on-surface-faint hover:text-red-600 dark:hover:text-red-400"
              }`}
            >
              {discardAllConfirm ? "Confirm discard all?" : "Discard all"}
            </button>
          )}
          <button
            onClick={onBulkAction}
            className="cursor-pointer text-xs text-on-surface-faint hover:text-on-surface-muted focus:outline-none focus:ring-2 focus:ring-brand focus:ring-offset-1"
          >
            {bulkLabel}
          </button>
        </div>
      </div>
      {files.map((f) => {
        const badge = STATUS_BADGE[f.status] ?? STATUS_BADGE.modified;
        const dirPath = f.path.includes("/") ? f.path.slice(0, f.path.lastIndexOf("/") + 1) : "";
        const fileName = f.path.split("/").pop() ?? f.path;
        const isConfirmingDiscard = discardConfirmPath === f.path;

        return (
          <div
            key={`${f.path}-${f.staged}`}
            className="group flex cursor-pointer items-center gap-2 border-b border-outline-muted px-3 py-1.5 hover:bg-hover"
            onClick={() => onSelect(f)}
          >
            {/* File path: dir in muted, filename in bold */}
            <div className="flex-1 truncate text-xs">
              {dirPath && <span className="text-on-surface-faint">{dirPath}</span>}
              <span className="font-medium text-on-surface">{fileName}</span>
            </div>

            {/* Right side: stats + badge + actions */}
            <div className="flex shrink-0 items-center gap-1.5">
              {/* Diff stats */}
              {f.insertions != null && f.insertions > 0 && (
                <span className="text-xs font-medium text-green-600 dark:text-green-500">
                  +{f.insertions}
                </span>
              )}
              {f.deletions != null && f.deletions > 0 && (
                <span className="text-xs font-medium text-red-600 dark:text-red-500">
                  -{f.deletions}
                </span>
              )}

              {/* Status badge */}
              <span className={`font-mono text-xs font-medium ${badge.cls}`}>{badge.label}</span>

              {/* Action buttons - visible on hover */}
              <div className="flex gap-0.5 opacity-0 group-hover:opacity-100">
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    onAction(f);
                  }}
                  className="rounded px-1 py-0.5 text-xs font-bold text-on-surface-faint hover:bg-active hover:text-on-surface"
                  title={actionTitle}
                >
                  {actionLabel}
                </button>
                {secondActionLabel && onSecondAction && (
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      onSecondAction(f);
                    }}
                    className={`rounded px-1 py-0.5 text-xs ${
                      isConfirmingDiscard
                        ? "font-medium text-red-600 dark:text-red-400"
                        : "text-on-surface-faint hover:bg-red-100 hover:text-red-600 dark:hover:bg-red-950/40 dark:hover:text-red-400"
                    }`}
                    title={isConfirmingDiscard ? "Click again to confirm" : secondActionTitle}
                  >
                    {isConfirmingDiscard ? "Confirm?" : secondActionLabel}
                  </button>
                )}
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

function DiffSummary({ files }: { files: ChangedFile[] }) {
  const totalIns = files.reduce((sum, f) => sum + (f.insertions ?? 0), 0);
  const totalDel = files.reduce((sum, f) => sum + (f.deletions ?? 0), 0);
  if (totalIns === 0 && totalDel === 0) return null;
  return (
    <span className="text-[11px] text-on-surface-faint">
      {files.length} file{files.length !== 1 ? "s" : ""}
      {totalIns > 0 && <span className="ml-1 text-green-600 dark:text-green-500">+{totalIns}</span>}
      {totalDel > 0 && <span className="ml-0.5 text-red-600 dark:text-red-500">-{totalDel}</span>}
    </span>
  );
}

function StepDot({ active, done, label }: { active: boolean; done: boolean; label: string }) {
  return (
    <div className="flex flex-col items-center gap-0.5">
      <div
        className={`h-1.5 w-1.5 rounded-full transition-colors ${
          active ? "bg-brand" : done ? "bg-status-done" : "bg-outline"
        }`}
      />
      <span
        className={`text-[9px] leading-none ${
          active ? "font-medium text-brand" : done ? "text-status-done" : "text-on-surface-faint"
        }`}
      >
        {label}
      </span>
    </div>
  );
}
