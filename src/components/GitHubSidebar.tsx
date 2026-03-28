import { useState, useEffect, useRef, useCallback } from "react";
import type { GitHubIssue, GitHubPR, CheckRun } from "../lib/types";
import {
  fetchIssues,
  fetchPRs,
  createPR,
  fetchCheckRuns,
  mergePR,
  closeIssue,
  deleteRemoteBranch,
} from "../lib/tauri";
import { formatError } from "../lib/errors";
import { isTauri } from "../lib/env";

async function openExternal(url: string) {
  if (isTauri()) {
    const { open } = await import("@tauri-apps/plugin-shell");
    await open(url);
  } else {
    window.open(url, "_blank");
  }
}

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

  // CI checks
  const [checkRuns, setCheckRuns] = useState<CheckRun[]>([]);
  const [loadingChecks, setLoadingChecks] = useState(false);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Merge
  const [mergeMethod, setMergeMethod] = useState<"merge" | "squash" | "rebase">("squash");
  const [merging, setMerging] = useState(false);
  const [mergeError, setMergeError] = useState<string | null>(null);
  const [merged, setMerged] = useState(false);

  // Close issue
  const [closingIssue, setClosingIssue] = useState(false);
  const [issueClosed, setIssueClosed] = useState(false);

  useEffect(() => {
    if (!repoId || !linkedIssueNumber) return;
    setLoadingIssue(true);
    setIssueError(null);
    fetchIssues(repoId)
      .then((issues) => {
        const found = issues.find((i) => i.number === linkedIssueNumber);
        setIssue(found ?? null);
      })
      .catch((err: unknown) => setIssueError(formatError(err)))
      .finally(() => setLoadingIssue(false));
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
      .catch((err: unknown) => setPrError(formatError(err)))
      .finally(() => setLoadingPR(false));
  }, [repoId, linkedPRNumber]);

  // Poll CI checks when PR exists
  const fetchChecks = useCallback(async () => {
    if (!repoId || !pr?.headRef) return;
    setLoadingChecks(true);
    try {
      const runs = await fetchCheckRuns(repoId, pr.headRef);
      setCheckRuns(runs);
    } catch {
      // silently ignore check fetch failures
    } finally {
      setLoadingChecks(false);
    }
  }, [repoId, pr?.headRef]);

  useEffect(() => {
    if (!pr) return;
    void fetchChecks();
  }, [pr, fetchChecks]);

  // Poll every 30s if checks are pending
  useEffect(() => {
    if (pollRef.current) {
      clearInterval(pollRef.current);
      pollRef.current = null;
    }
    if (!pr || checkRuns.length === 0) return;
    const allCompleted = checkRuns.every((c) => c.status === "completed");
    if (allCompleted) return;

    pollRef.current = setInterval(() => {
      void fetchChecks();
    }, 30000);

    return () => {
      if (pollRef.current) {
        clearInterval(pollRef.current);
        pollRef.current = null;
      }
    };
  }, [pr, checkRuns, fetchChecks]);

  const allChecksPass = checkRuns.length > 0 && checkRuns.every((c) => c.conclusion === "success");
  const anyChecksFailing =
    checkRuns.length > 0 && checkRuns.some((c) => c.conclusion === "failure");
  const checksPending = checkRuns.length > 0 && checkRuns.some((c) => c.status !== "completed");

  async function handleMerge() {
    if (!repoId || !pr) return;
    setMerging(true);
    setMergeError(null);
    try {
      await mergePR({
        repoId,
        prNumber: pr.number,
        mergeMethod,
      });
      setMerged(true);

      // Post-merge cleanup (best-effort — each step independent)
      // 1. Delete remote branch
      if (branch) {
        try {
          await deleteRemoteBranch(repoId, branch);
        } catch {
          // Branch deletion is non-critical
        }
      }

      // 2. Auto-close linked issue if present
      if (issue?.state === "open" && linkedIssueNumber) {
        await handleCloseIssue();
      }
    } catch (err: unknown) {
      setMergeError(formatError(err));
    } finally {
      setMerging(false);
    }
  }

  async function handleCloseIssue() {
    if (!repoId || !linkedIssueNumber) return;
    setClosingIssue(true);
    try {
      await closeIssue(repoId, linkedIssueNumber);
      setIssueClosed(true);
    } catch (err: unknown) {
      console.warn("Failed to close issue:", err);
    } finally {
      setClosingIssue(false);
    }
  }

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
    <div className="flex flex-col gap-3">
      {/* Linked Issue */}
      {linkedIssueNumber && (
        <DetailSection
          loading={loadingIssue}
          error={issueError}
          loadingLabel={`Loading issue #${linkedIssueNumber}…`}
        >
          {issue && (
            <>
              <div className="flex items-center gap-2">
                <IssueIcon state={issueClosed ? "closed" : issue.state} />
                <span className="text-xs font-medium text-gray-500 dark:text-gray-400">
                  Issue #{issue.number}
                </span>
                <StateBadge state={issueClosed ? "closed" : issue.state} />
              </div>
              {issueClosed && (
                <p className="mt-1 text-xs font-medium text-green-600 dark:text-green-400">
                  Issue #{issue.number} closed
                </p>
              )}
              <p className="mt-1 text-sm font-medium text-gray-900 dark:text-gray-100">
                {issue.title}
              </p>
              {issue.body && (
                <p className="mt-1 line-clamp-3 text-xs text-gray-500 dark:text-gray-400">
                  {issue.body}
                </p>
              )}
              {issue.labels.length > 0 && (
                <div className="mt-2 flex flex-wrap gap-1">
                  {issue.labels.map((label) => (
                    <LabelBadge key={label.name} name={label.name} color={label.color} />
                  ))}
                </div>
              )}
              <div className="mt-2 flex items-center gap-3 text-xs text-gray-400 dark:text-gray-500">
                <span>by {issue.user}</span>
                {issue.comments > 0 && <span>{issue.comments} comments</span>}
              </div>
              <span
                role="link"
                className="mt-1.5 inline-block cursor-pointer text-xs text-blue-600 hover:underline dark:text-blue-500"
                onClick={() => {
                  void openExternal(issue.htmlUrl);
                }}
              >
                View on GitHub →
              </span>
            </>
          )}
        </DetailSection>
      )}

      {/* Linked PR */}
      {linkedPRNumber && (
        <DetailSection
          loading={loadingPR}
          error={prError}
          loadingLabel={`Loading PR #${linkedPRNumber}…`}
        >
          {pr && (
            <>
              <div className="flex items-center gap-2">
                <PRIcon state={merged ? "merged" : pr.state} />
                <span className="text-xs font-medium text-gray-500 dark:text-gray-400">
                  PR #{pr.number}
                </span>
                <StateBadge state={merged ? "merged" : pr.state} />
              </div>
              <p className="mt-1 text-sm font-medium text-gray-900 dark:text-gray-100">
                {pr.title}
              </p>
              {pr.body && (
                <p className="mt-1 line-clamp-3 text-xs text-gray-500 dark:text-gray-400">
                  {pr.body}
                </p>
              )}
              <div className="mt-2 flex items-center gap-1.5 text-xs">
                <code className="rounded bg-blue-50 px-1 py-0.5 font-mono text-blue-700 dark:bg-blue-950/40 dark:text-blue-400">
                  {pr.headRef}
                </code>
                <span className="text-gray-400">→</span>
                <code className="rounded bg-gray-100 px-1 py-0.5 font-mono text-gray-600 dark:bg-gray-800 dark:text-gray-400">
                  {pr.baseRef}
                </code>
              </div>
              <div className="mt-1.5 flex items-center gap-3 text-xs text-gray-400 dark:text-gray-500">
                <span>by {pr.user}</span>
                {pr.comments > 0 && <span>{pr.comments} comments</span>}
              </div>
              <span
                role="link"
                className="mt-1.5 inline-block cursor-pointer text-xs text-blue-600 hover:underline dark:text-blue-500"
                onClick={() => {
                  void openExternal(pr.htmlUrl);
                }}
              >
                View on GitHub →
              </span>

              {/* CI Status Pills */}
              {(checkRuns.length > 0 || loadingChecks) && (
                <div className="mt-3 border-t border-gray-200 pt-2 dark:border-gray-800">
                  <h4 className="mb-1.5 text-xs font-medium text-gray-500 dark:text-gray-400">
                    CI Checks
                  </h4>
                  {loadingChecks && checkRuns.length === 0 && (
                    <span className="text-xs text-gray-400 dark:text-gray-500">Loading...</span>
                  )}
                  <div className="flex flex-wrap gap-1">
                    {checkRuns.map((check) => (
                      <CheckRunPill key={check.id} check={check} />
                    ))}
                  </div>
                  {anyChecksFailing && (
                    <p className="mt-1.5 text-xs text-red-600 dark:text-red-400">
                      Failing:{" "}
                      {checkRuns
                        .filter((c) => c.conclusion === "failure")
                        .map((c) => c.name)
                        .join(", ")}
                    </p>
                  )}
                </div>
              )}

              {/* Merge PR section */}
              {pr.state === "open" && !merged && (
                <div className="mt-3 border-t border-gray-200 pt-2 dark:border-gray-800">
                  {mergeError && (
                    <p className="mb-1 text-xs text-red-600 dark:text-red-400">{mergeError}</p>
                  )}
                  <div className="flex items-center gap-2">
                    <select
                      value={mergeMethod}
                      onChange={(e) =>
                        setMergeMethod(e.target.value as "merge" | "squash" | "rebase")
                      }
                      className="rounded border border-gray-300 bg-white px-2 py-1 text-xs text-gray-700 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-300"
                    >
                      <option value="squash">Squash</option>
                      <option value="merge">Merge</option>
                      <option value="rebase">Rebase</option>
                    </select>
                    <button
                      onClick={() => {
                        void handleMerge();
                      }}
                      disabled={
                        merging || (checkRuns.length > 0 && !allChecksPass)
                      }
                      className="flex-1 cursor-pointer rounded bg-green-600 px-3 py-1 text-xs font-medium text-white hover:bg-green-500 active:bg-green-700 focus:outline-none focus:ring-2 focus:ring-green-500 focus:ring-offset-1 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      {merging ? "Merging..." : "Merge PR"}
                    </button>
                  </div>
                  {checkRuns.length > 0 && !allChecksPass && (
                    <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                      {checksPending
                        ? "Waiting for checks to complete…"
                        : "Merge disabled until required checks pass"}
                    </p>
                  )}
                </div>
              )}

              {/* Merged success state */}
              {merged && (
                <div className="mt-3 rounded-md border border-green-200 bg-green-50 p-2 dark:border-green-800/60 dark:bg-green-950/20">
                  <p className="text-xs font-medium text-green-700 dark:text-green-400">
                    PR #{pr.number} merged successfully
                  </p>
                  {linkedIssueNumber && issueClosed && (
                    <p className="mt-0.5 text-xs text-green-600 dark:text-green-500">
                      Issue #{linkedIssueNumber} closed
                    </p>
                  )}
                  {linkedIssueNumber && !issueClosed && !closingIssue && (
                    <button
                      onClick={() => {
                        void handleCloseIssue();
                      }}
                      className="mt-1 cursor-pointer text-xs text-blue-600 hover:underline focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-1 dark:text-blue-500"
                    >
                      Close Issue #{linkedIssueNumber}
                    </button>
                  )}
                  {closingIssue && (
                    <span className="mt-1 text-xs text-gray-500">Closing issue...</span>
                  )}
                </div>
              )}
            </>
          )}
        </DetailSection>
      )}

      {/* Separator */}
      {(linkedIssueNumber ?? linkedPRNumber) && hasCommittedChanges && !pr && (
        <div className="border-t border-gray-200 dark:border-gray-800" />
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
            className="w-full cursor-pointer rounded-md bg-blue-600 px-3 py-2 text-sm font-medium text-white hover:bg-blue-500 active:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-1 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {creating ? "Creating PR…" : "Open PR"}
          </button>
        </div>
      )}

      {!linkedIssueNumber && !linkedPRNumber && !hasCommittedChanges && (
        <p className="text-xs text-gray-400 dark:text-gray-500">No GitHub context linked.</p>
      )}
    </div>
  );
}

function CheckRunPill({ check }: { check: CheckRun }) {
  const colorCls =
    check.conclusion === "success"
      ? "bg-green-500/20 text-green-700 dark:text-green-400"
      : check.conclusion === "failure"
        ? "bg-red-500/20 text-red-700 dark:text-red-400"
        : check.status === "in_progress"
          ? "bg-yellow-500/20 text-yellow-700 dark:text-yellow-400"
          : "bg-gray-500/20 text-gray-600 dark:text-gray-400";

  return (
    <span className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${colorCls}`}>
      {check.name}
    </span>
  );
}

function DetailSection({
  loading,
  error,
  loadingLabel,
  children,
}: {
  loading: boolean;
  error: string | null;
  loadingLabel: string;
  children: React.ReactNode;
}) {
  if (loading) {
    return (
      <div className="flex items-center gap-2 py-1">
        <span className="inline-block h-3 w-3 animate-spin rounded-full border-2 border-gray-300 border-t-gray-600 dark:border-gray-600 dark:border-t-gray-300" />
        <p className="text-xs text-gray-500">{loadingLabel}</p>
      </div>
    );
  }
  if (error) {
    return <p className="text-xs text-red-600 dark:text-red-400">{error}</p>;
  }
  return <>{children}</>;
}

function IssueIcon({ state }: { state: string }) {
  return (
    <svg
      className={`h-4 w-4 shrink-0 ${state === "open" ? "text-green-600 dark:text-green-500" : "text-purple-600 dark:text-purple-400"}`}
      viewBox="0 0 16 16"
      fill="currentColor"
    >
      <path d="M8 9.5a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3Z" />
      <path d="M8 0a8 8 0 1 1 0 16A8 8 0 0 1 8 0ZM1.5 8a6.5 6.5 0 1 0 13 0 6.5 6.5 0 0 0-13 0Z" />
    </svg>
  );
}

function PRIcon({ state }: { state: string }) {
  const color =
    state === "merged"
      ? "text-purple-600 dark:text-purple-400"
      : state === "open"
        ? "text-green-600 dark:text-green-500"
        : "text-red-600 dark:text-red-400";
  return (
    <svg className={`h-4 w-4 shrink-0 ${color}`} viewBox="0 0 16 16" fill="currentColor">
      <path d="M1.5 3.25a2.25 2.25 0 1 1 3 2.122v5.256a2.251 2.251 0 1 1-1.5 0V5.372A2.25 2.25 0 0 1 1.5 3.25Zm5.677-.177L9.573.677A.25.25 0 0 1 10 .854V2.5h1A2.5 2.5 0 0 1 13.5 5v5.628a2.251 2.251 0 1 1-1.5 0V5a1 1 0 0 0-1-1h-1v1.646a.25.25 0 0 1-.427.177L7.177 3.427a.25.25 0 0 1 0-.354ZM3.75 2.5a.75.75 0 1 0 0 1.5.75.75 0 0 0 0-1.5Zm0 9.5a.75.75 0 1 0 0 1.5.75.75 0 0 0 0-1.5Zm8.25.75a.75.75 0 1 0 1.5 0 .75.75 0 0 0-1.5 0Z" />
    </svg>
  );
}

function StateBadge({ state }: { state: string }) {
  const cls =
    state === "open"
      ? "bg-green-500/15 text-green-700 dark:text-green-400"
      : state === "merged"
        ? "bg-purple-500/15 text-purple-700 dark:text-purple-400"
        : "bg-gray-500/15 text-gray-600 dark:text-gray-400";
  return <span className={`rounded-full px-1.5 py-0.5 text-xs font-medium ${cls}`}>{state}</span>;
}

function LabelBadge({ name, color }: { name: string; color: string }) {
  const bg = `#${color}`;
  const r = parseInt(color.slice(0, 2), 16);
  const g = parseInt(color.slice(2, 4), 16);
  const b = parseInt(color.slice(4, 6), 16);
  const fg = (r * 299 + g * 587 + b * 114) / 1000 > 128 ? "#000" : "#fff";
  return (
    <span
      className="rounded-full px-2 py-0.5 text-xs font-medium"
      style={{ backgroundColor: bg, color: fg, border: `1px solid ${bg}40` }}
    >
      {name}
    </span>
  );
}
