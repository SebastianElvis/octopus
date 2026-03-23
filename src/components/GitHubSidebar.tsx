import { useState, useEffect } from "react";
import type { GitHubIssue, GitHubPR } from "../lib/types";
import { fetchIssues, fetchPRs, createPR } from "../lib/tauri";
import { formatError } from "../lib/errors";

const CI_STATUS_PILL: Record<string, string> = {
  success: "bg-green-500/20 text-green-600 ring-1 ring-green-500/30 dark:text-green-400",
  failure: "bg-red-500/20 text-red-600 ring-1 ring-red-500/30 dark:text-red-400",
  pending: "bg-yellow-500/20 text-yellow-600 ring-1 ring-yellow-500/30 dark:text-yellow-400",
  unknown: "bg-gray-500/20 text-gray-500 ring-1 ring-gray-500/30 dark:text-gray-400",
};

interface GitHubSidebarProps {
  repoId?: string;
  linkedIssueNumber?: number;
  linkedPRNumber?: number;
  branch?: string;
  sessionName?: string;
  hasCommittedChanges?: boolean;
}

export function GitHubSidebar({
  repoId,
  linkedIssueNumber,
  linkedPRNumber,
  branch,
  sessionName,
  hasCommittedChanges,
}: GitHubSidebarProps) {
  const [issue, setIssue] = useState<GitHubIssue | null>(null);
  const [loadingIssue, setLoadingIssue] = useState(false);
  const [issueError, setIssueError] = useState<string | null>(null);

  const [pr, setPr] = useState<GitHubPR | null>(null);
  const [loadingPR, setLoadingPR] = useState(false);
  const [prError, setPrError] = useState<string | null>(null);

  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);

  useEffect(() => {
    if (!repoId || !linkedIssueNumber) return;

    setLoadingIssue(true);
    setIssueError(null);

    fetchIssues(repoId)
      .then((issues) => {
        const found = issues.find((i) => i.number === linkedIssueNumber);
        setIssue(found ?? null);
      })
      .catch((err: unknown) => {
        setIssueError(formatError(err));
      })
      .finally(() => {
        setLoadingIssue(false);
      });
  }, [repoId, linkedIssueNumber]);

  useEffect(() => {
    if (!repoId || !linkedPRNumber) return;

    setLoadingPR(true);
    setPrError(null);

    fetchPRs(repoId)
      .then((prs) => {
        const found = prs.find((p) => p.number === linkedPRNumber);
        setPr(found ?? null);
      })
      .catch((err: unknown) => {
        setPrError(formatError(err));
      })
      .finally(() => {
        setLoadingPR(false);
      });
  }, [repoId, linkedPRNumber]);

  async function handleOpenPR() {
    if (!repoId || !branch) return;
    setCreating(true);
    setCreateError(null);
    try {
      const newPr = await createPR({
        repoId,
        headBranch: branch,
        title: sessionName ?? branch,
        body: issue ? `Closes #${issue.number}` : undefined,
      });
      setPr(newPr);
    } catch (err: unknown) {
      setCreateError(formatError(err));
    } finally {
      setCreating(false);
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <h3 className="text-sm font-medium uppercase tracking-wide text-gray-500 dark:text-gray-400">
        GitHub
      </h3>

      {/* Issue card */}
      {linkedIssueNumber && (
        <>
          {loadingIssue && (
            <div className="rounded-lg border border-gray-200 bg-gray-50 p-3 dark:border-gray-800 dark:bg-gray-900">
              <div className="flex items-center gap-2">
                <span className="inline-block h-3 w-3 animate-spin rounded-full border-2 border-gray-300 border-t-gray-600 dark:border-gray-600 dark:border-t-gray-300" />
                <p className="text-xs text-gray-500">Loading issue #{linkedIssueNumber}…</p>
              </div>
            </div>
          )}
          {issueError && !loadingIssue && (
            <div className="rounded-lg border border-red-200 bg-red-50 p-3 dark:border-red-800/40 dark:bg-red-950/20">
              <p className="text-xs text-red-600 dark:text-red-400">
                Failed to load issue: {issueError}
              </p>
            </div>
          )}
          {issue && !loadingIssue && (
            <div className="rounded-lg border border-gray-200 bg-gray-50 p-3 dark:border-gray-800 dark:bg-gray-900">
              <div className="mb-1 flex items-start justify-between gap-2">
                <span className="text-xs text-gray-500">Issue #{issue.number}</span>
                <span
                  className={`shrink-0 rounded-full px-2 py-0.5 text-xs ${
                    issue.state === "open"
                      ? "bg-green-500/20 text-green-600 dark:text-green-400"
                      : "bg-gray-500/20 text-gray-500 dark:text-gray-400"
                  }`}
                >
                  {issue.state}
                </span>
              </div>
              <p className="text-sm font-medium text-gray-900 dark:text-gray-100">{issue.title}</p>
              {issue.labels.length > 0 && (
                <div className="mt-2 flex flex-wrap gap-1">
                  {issue.labels.map((label) => (
                    <span
                      key={label}
                      className="rounded-full bg-blue-500/20 px-2 py-0.5 text-xs text-blue-600 ring-1 ring-blue-500/30 dark:text-blue-400"
                    >
                      {label}
                    </span>
                  ))}
                </div>
              )}
              <a
                href={issue.url}
                target="_blank"
                rel="noreferrer"
                className="mt-2 block text-xs text-blue-600 hover:underline dark:text-blue-500"
              >
                View on GitHub →
              </a>
            </div>
          )}
        </>
      )}

      {/* PR card */}
      {linkedPRNumber && (
        <>
          {loadingPR && (
            <div className="rounded-lg border border-gray-200 bg-gray-50 p-3 dark:border-gray-800 dark:bg-gray-900">
              <div className="flex items-center gap-2">
                <span className="inline-block h-3 w-3 animate-spin rounded-full border-2 border-gray-300 border-t-gray-600 dark:border-gray-600 dark:border-t-gray-300" />
                <p className="text-xs text-gray-500">Loading PR #{linkedPRNumber}…</p>
              </div>
            </div>
          )}
          {prError && !loadingPR && (
            <div className="rounded-lg border border-red-200 bg-red-50 p-3 dark:border-red-800/40 dark:bg-red-950/20">
              <p className="text-xs text-red-600 dark:text-red-400">Failed to load PR: {prError}</p>
            </div>
          )}
          {pr && !loadingPR && (
            <div className="rounded-lg border border-gray-200 bg-gray-50 p-3 dark:border-gray-800 dark:bg-gray-900">
              <div className="mb-1 flex items-start justify-between gap-2">
                <span className="text-xs text-gray-500">PR #{pr.number}</span>
                <span
                  className={`shrink-0 rounded-full px-2 py-0.5 text-xs ${
                    pr.state === "open"
                      ? "bg-green-500/20 text-green-600 dark:text-green-400"
                      : pr.state === "merged"
                        ? "bg-purple-500/20 text-purple-600 dark:text-purple-400"
                        : "bg-gray-500/20 text-gray-500 dark:text-gray-400"
                  }`}
                >
                  {pr.state}
                </span>
              </div>
              <p className="text-sm font-medium text-gray-900 dark:text-gray-100">{pr.title}</p>
              <div className="mt-2 flex items-center gap-2">
                <span
                  className={`rounded-full px-2 py-0.5 text-xs font-medium ${CI_STATUS_PILL[pr.ciStatus]}`}
                >
                  CI: {pr.ciStatus}
                </span>
              </div>
              <a
                href={pr.url}
                target="_blank"
                rel="noreferrer"
                className="mt-2 block text-xs text-blue-600 hover:underline dark:text-blue-500"
              >
                View PR →
              </a>
            </div>
          )}
        </>
      )}

      {/* Open PR button */}
      {!pr && hasCommittedChanges && repoId && branch && (
        <div>
          {createError && (
            <p className="mb-1 text-xs text-red-600 dark:text-red-400">{createError}</p>
          )}
          <button
            onClick={() => {
              void handleOpenPR();
            }}
            disabled={creating}
            className="w-full rounded-md bg-blue-600 px-3 py-2 text-sm font-medium text-white hover:bg-blue-500 disabled:opacity-40"
          >
            {creating ? "Creating PR…" : "Open PR"}
          </button>
        </div>
      )}

      {!linkedIssueNumber && !linkedPRNumber && !hasCommittedChanges && (
        <p className="text-xs text-gray-400 dark:text-gray-600">No GitHub context linked.</p>
      )}
    </div>
  );
}
