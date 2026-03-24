import { useEffect, useState } from "react";
import { useGitStore } from "../stores/gitStore";
import type { ChangedFile } from "../lib/types";

interface GitChangesPanelProps {
  worktreePath: string | undefined;
  sessionName?: string;
  sessionStatus?: string;
  repoId?: string;
  branch?: string;
  onCommitted?: () => void;
}

const STATUS_BADGE: Record<string, { label: string; cls: string }> = {
  modified: { label: "M", cls: "bg-yellow-500/20 text-yellow-600 dark:text-yellow-400" },
  added: { label: "A", cls: "bg-green-500/20 text-green-600 dark:text-green-400" },
  deleted: { label: "D", cls: "bg-red-500/20 text-red-600 dark:text-red-400" },
  renamed: { label: "R", cls: "bg-blue-500/20 text-blue-600 dark:text-blue-400" },
  untracked: { label: "U", cls: "bg-gray-500/20 text-gray-500 dark:text-gray-400" },
  copied: { label: "C", cls: "bg-purple-500/20 text-purple-600 dark:text-purple-400" },
};

export function GitChangesPanel({
  worktreePath,
  sessionName,
  sessionStatus,
  onCommitted,
}: GitChangesPanelProps) {
  const {
    changedFiles,
    loading,
    commitMessage,
    pushing,
    committing,
    error,
    selectedFile,
    setWorktreePath,
    refreshChanges,
    stageFiles,
    unstageFiles,
    discardFiles,
    selectFile,
    setCommitMessage,
    commitAndPush,
    commit,
    push,
  } = useGitStore();

  const [discardConfirmPath, setDiscardConfirmPath] = useState<string | null>(null);
  const [discardAllConfirm, setDiscardAllConfirm] = useState(false);

  useEffect(() => {
    setWorktreePath(worktreePath ?? null);
  }, [worktreePath, setWorktreePath]);

  // Pre-populate commit message
  useEffect(() => {
    if (sessionName && !commitMessage) {
      setCommitMessage(sessionName);
    }
  }, [sessionName]); // eslint-disable-line react-hooks/exhaustive-deps

  const isSessionDone = ["done", "completed", "failed", "idle"].includes(sessionStatus ?? "");

  if (!worktreePath) {
    return (
      <div className="flex h-full items-center justify-center">
        <p className="text-xs text-gray-400 dark:text-gray-500">No worktree</p>
      </div>
    );
  }

  // If the session is done and the worktree may have been cleaned up, show a clear message
  if (isSessionDone && error?.includes("No such file or directory")) {
    return (
      <div className="flex h-full items-center justify-center px-4">
        <p className="text-center text-xs text-gray-400 dark:text-gray-500">
          Session completed. Worktree has been cleaned up.
        </p>
      </div>
    );
  }

  const staged = changedFiles.filter((f) => f.staged);
  const unstaged = changedFiles.filter((f) => !f.staged);

  async function handleCommitAndPush() {
    await commitAndPush();
    onCommitted?.();
  }

  async function handleCommit() {
    await commit();
    onCommitted?.();
  }

  async function handlePush() {
    await push();
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
      <div className="flex shrink-0 items-center justify-between border-b border-gray-200 px-3 py-2 dark:border-gray-800">
        <h3 className="text-xs font-medium text-gray-700 dark:text-gray-300">Changes</h3>
        <button
          onClick={() => {
            void refreshChanges();
          }}
          className="rounded p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-600 dark:text-gray-500 dark:hover:bg-gray-800 dark:hover:text-gray-300"
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
          <span className="text-xs text-gray-400 dark:text-gray-500">Loading...</span>
        </div>
      )}

      {/* File lists */}
      <div className="flex-1 overflow-y-auto">
        {/* Staged */}
        {staged.length > 0 && (
          <FileSection
            title="Staged"
            files={staged}
            selectedFile={selectedFile}
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
            selectedFile={selectedFile}
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
            <span className="text-xs text-gray-400 dark:text-gray-500">No changes</span>
          </div>
        )}
      </div>

      {/* Commit area */}
      <div className="shrink-0 border-t border-gray-200 p-2 dark:border-gray-800">
        {error && <p className="mb-1 text-xs text-red-600 dark:text-red-400">{error}</p>}
        <textarea
          value={commitMessage}
          onChange={(e) => setCommitMessage(e.target.value)}
          placeholder="Commit message..."
          rows={2}
          className="mb-2 w-full resize-none rounded border border-gray-300 bg-white px-2 py-1.5 text-xs text-gray-900 placeholder-gray-400 focus:border-blue-600 focus:outline-none dark:border-gray-700 dark:bg-gray-800 dark:text-gray-100 dark:placeholder-gray-500"
        />
        <div className="flex gap-1.5">
          <button
            onClick={() => {
              void handleCommit();
            }}
            disabled={committing || pushing || !commitMessage.trim() || staged.length === 0}
            className="flex-1 rounded bg-blue-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-blue-500 disabled:opacity-40"
          >
            {committing ? "Committing..." : "Commit"}
          </button>
          <button
            onClick={() => {
              void handlePush();
            }}
            disabled={pushing || committing}
            className="rounded border border-blue-600 px-3 py-1.5 text-xs font-medium text-blue-600 hover:bg-blue-50 disabled:opacity-40 dark:border-blue-500 dark:text-blue-400 dark:hover:bg-blue-950/30"
          >
            {pushing ? "Pushing..." : "Push"}
          </button>
          <button
            onClick={() => {
              void handleCommitAndPush();
            }}
            disabled={pushing || committing || !commitMessage.trim() || staged.length === 0}
            className="rounded border border-gray-300 px-3 py-1.5 text-xs font-medium text-gray-600 hover:bg-gray-50 disabled:opacity-40 dark:border-gray-700 dark:text-gray-400 dark:hover:bg-gray-800"
          >
            {pushing ? "..." : "Commit & Push"}
          </button>
        </div>
      </div>
    </div>
  );
}

function FileSection({
  title,
  files,
  selectedFile,
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
  selectedFile: string | null;
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
      <div className="flex items-center justify-between px-3 py-1.5">
        <span className="text-xs font-medium text-gray-500 dark:text-gray-500">
          {title} ({files.length})
        </span>
        <div className="flex items-center gap-2">
          {onDiscardAll && (
            <button
              onClick={onDiscardAll}
              className={`text-xs ${
                discardAllConfirm
                  ? "font-medium text-red-600 dark:text-red-400"
                  : "text-gray-400 hover:text-red-600 dark:text-gray-500 dark:hover:text-red-400"
              }`}
            >
              {discardAllConfirm ? "Confirm discard all?" : "Discard all"}
            </button>
          )}
          <button
            onClick={onBulkAction}
            className="text-xs text-gray-400 hover:text-gray-600 dark:text-gray-500 dark:hover:text-gray-400"
          >
            {bulkLabel}
          </button>
        </div>
      </div>
      {files.map((f) => {
        const badge = STATUS_BADGE[f.status] ?? STATUS_BADGE.modified;
        const isSelected = f.path === selectedFile;
        const fileName = f.path.split("/").pop() ?? f.path;
        const dirPath = f.path.includes("/") ? f.path.slice(0, f.path.lastIndexOf("/")) : "";
        const isConfirmingDiscard = discardConfirmPath === f.path;

        return (
          <div
            key={`${f.path}-${f.staged}`}
            className={`group flex items-center gap-1.5 px-3 py-0.5 text-xs ${
              isSelected
                ? "bg-blue-50 dark:bg-blue-950/30"
                : "hover:bg-gray-50 dark:hover:bg-gray-800/30"
            }`}
          >
            <button
              onClick={() => onSelect(f)}
              className="flex flex-1 items-center gap-1.5 truncate text-left"
            >
              <span
                className={`shrink-0 rounded px-1 py-0.5 text-xs font-mono leading-none ${badge.cls}`}
              >
                {badge.label}
              </span>
              <span className="truncate text-gray-700 dark:text-gray-300">{fileName}</span>
              {dirPath && (
                <span className="truncate text-gray-400 dark:text-gray-500">{dirPath}</span>
              )}
            </button>
            <div className="flex shrink-0 gap-0.5 opacity-0 group-hover:opacity-100">
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  onAction(f);
                }}
                className="rounded px-1 py-0.5 text-xs font-bold text-gray-400 hover:bg-gray-200 hover:text-gray-700 dark:text-gray-500 dark:hover:bg-gray-700 dark:hover:text-gray-300"
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
                      : "text-gray-400 hover:bg-red-100 hover:text-red-600 dark:text-gray-500 dark:hover:bg-red-950/40 dark:hover:text-red-400"
                  }`}
                  title={isConfirmingDiscard ? "Click again to confirm" : secondActionTitle}
                >
                  {isConfirmingDiscard ? "Confirm?" : secondActionLabel}
                </button>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
