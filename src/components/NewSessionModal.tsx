import { useState, useEffect } from "react";
import type { Repo, GitHubIssue, GitHubPR } from "../lib/types";
import { fetchIssues, spawnSession } from "../lib/tauri";
import { useSessionStore } from "../stores/sessionStore";
import { formatError } from "../lib/errors";

type SourceType = "issue" | "pr" | "adhoc";

interface NewSessionModalProps {
  repos: Repo[];
  onClose: () => void;
  prefillRepo?: Repo;
  prefillIssue?: GitHubIssue;
  prefillPR?: GitHubPR;
}

export function NewSessionModal({
  repos,
  onClose,
  prefillRepo,
  prefillIssue,
  prefillPR,
}: NewSessionModalProps) {
  const addSession = useSessionStore((s) => s.addSession);

  const [repoId, setRepoId] = useState(prefillRepo?.id ?? (repos.length > 0 ? repos[0].id : ""));
  const [sourceType, setSourceType] = useState<SourceType>(
    prefillIssue ? "issue" : prefillPR ? "pr" : "adhoc",
  );
  const [url, setUrl] = useState("");
  const [prompt, setPrompt] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [worktreeConflict, setWorktreeConflict] = useState(false);

  const [issues, setIssues] = useState<GitHubIssue[]>([]);
  const [selectedIssue, setSelectedIssue] = useState<GitHubIssue | null>(null);

  useEffect(() => {
    if (repoId && sourceType === "issue") {
      fetchIssues(repoId)
        .then(setIssues)
        .catch((err: unknown) => {
          setError(formatError(err));
        });
    }
  }, [repoId, sourceType]);

  useEffect(() => {
    if (selectedIssue) {
      setPrompt(selectedIssue.body ?? "");
    }
  }, [selectedIssue]);

  // Prefill from props
  useEffect(() => {
    if (prefillIssue) {
      setSelectedIssue(prefillIssue);
    }
    if (prefillPR) {
      setPrompt(prefillPR.body ?? "");
    }
  }, [prefillIssue, prefillPR]);

  function deriveBranchName(): string {
    if (selectedIssue) {
      const slug = selectedIssue.title
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .slice(0, 40);
      return `issue-${selectedIssue.number}-${slug}`;
    }
    if (prefillPR) {
      return prefillPR.headRef || `pr-${prefillPR.number}`;
    }
    return `session-${Date.now()}`;
  }

  function deriveSessionName(): string {
    if (selectedIssue) return selectedIssue.title.slice(0, 60);
    if (prefillPR) return prefillPR.title.slice(0, 60);
    return prompt.trim().slice(0, 60) || `session-${Date.now()}`;
  }

  async function handleSubmit(force = false) {
    if (!repoId || !prompt.trim()) {
      setError("Please select a repository and provide a prompt.");
      return;
    }
    setSubmitting(true);
    setError(null);
    setWorktreeConflict(false);
    try {
      const branch = deriveBranchName();
      const session = await spawnSession({
        repoId,
        branch,
        prompt: prompt.trim(),
        name: deriveSessionName(),
        issueNumber: selectedIssue?.number,
        prNumber: prefillPR?.number,
        force,
      });
      addSession(session);
      onClose();
    } catch (err: unknown) {
      const msg = formatError(err);
      if (msg.includes("WORKTREE_CONFLICT:")) {
        setError(msg.replace("WORKTREE_CONFLICT: ", ""));
        setWorktreeConflict(true);
      } else {
        setError(msg);
      }
    } finally {
      setSubmitting(false);
    }
  }

  function parseIssueNumber(issueUrl: string): number | undefined {
    const match = issueUrl.match(/issues\/(\d+)/);
    return match ? parseInt(match[1], 10) : undefined;
  }

  function handleUrlChange(val: string) {
    setUrl(val);
    if (sourceType === "issue" && val) {
      const num = parseIssueNumber(val);
      if (num) {
        const found = issues.find((i) => i.number === num);
        if (found) setSelectedIssue(found);
      }
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="w-full max-w-lg rounded-xl border border-gray-200 bg-white p-6 shadow-2xl dark:border-gray-800 dark:bg-gray-900">
        <div className="mb-5 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">New Session</h2>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 dark:text-gray-500 dark:hover:text-gray-300"
          >
            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M6 18L18 6M6 6l12 12"
              />
            </svg>
          </button>
        </div>

        <div className="space-y-4">
          {/* Repo selector */}
          <div>
            <label className="mb-1 block text-xs font-medium text-gray-500 dark:text-gray-400">
              Repository
            </label>
            {repos.length === 0 ? (
              <p className="text-xs text-gray-400 dark:text-gray-600">No repositories added yet.</p>
            ) : (
              <select
                value={repoId}
                onChange={(e) => setRepoId(e.target.value)}
                className="w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 focus:border-blue-600 focus:outline-none dark:border-gray-700 dark:bg-gray-800 dark:text-gray-100"
              >
                {repos.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.githubUrl}
                  </option>
                ))}
              </select>
            )}
          </div>

          {/* Source type */}
          <div>
            <label className="mb-1 block text-xs font-medium text-gray-500 dark:text-gray-400">
              Source
            </label>
            <div className="flex rounded-md border border-gray-300 text-sm dark:border-gray-700">
              {(["issue", "pr", "adhoc"] as SourceType[]).map((t) => (
                <button
                  key={t}
                  onClick={() => setSourceType(t)}
                  className={`flex-1 py-1.5 capitalize ${
                    sourceType === t
                      ? "bg-gray-100 text-gray-900 dark:bg-gray-700 dark:text-gray-100"
                      : "text-gray-500 hover:text-gray-700 dark:text-gray-500 dark:hover:text-gray-300"
                  }`}
                >
                  {t === "adhoc" ? "Ad-hoc" : t === "issue" ? "Issue URL" : "PR URL"}
                </button>
              ))}
            </div>
          </div>

          {/* URL input */}
          {(sourceType === "issue" || sourceType === "pr") && (
            <div>
              <label className="mb-1 block text-xs font-medium text-gray-500 dark:text-gray-400">
                {sourceType === "issue" ? "Issue URL" : "PR URL"}
              </label>
              <input
                type="url"
                value={url}
                onChange={(e) => handleUrlChange(e.target.value)}
                placeholder={`https://github.com/owner/repo/${sourceType}s/123`}
                className="w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 placeholder-gray-400 focus:border-blue-600 focus:outline-none dark:border-gray-700 dark:bg-gray-800 dark:text-gray-100 dark:placeholder-gray-600"
              />
            </div>
          )}

          {/* Issue picker */}
          {sourceType === "issue" && issues.length > 0 && (
            <div>
              <label className="mb-1 block text-xs font-medium text-gray-500 dark:text-gray-400">
                Select Issue
              </label>
              <select
                value={selectedIssue?.number ?? ""}
                onChange={(e) => {
                  const num = parseInt(e.target.value, 10);
                  const found = issues.find((i) => i.number === num) ?? null;
                  setSelectedIssue(found);
                }}
                className="w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 focus:border-blue-600 focus:outline-none dark:border-gray-700 dark:bg-gray-800 dark:text-gray-100"
              >
                <option value="">-- Select an issue --</option>
                {issues.map((i) => (
                  <option key={i.number} value={i.number}>
                    #{i.number}: {i.title}
                  </option>
                ))}
              </select>
            </div>
          )}

          {/* Prompt */}
          <div>
            <label className="mb-1 block text-xs font-medium text-gray-500 dark:text-gray-400">
              Prompt
            </label>
            <textarea
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              placeholder="Describe the task for Claude…"
              rows={4}
              className="w-full resize-none rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 placeholder-gray-400 focus:border-blue-600 focus:outline-none dark:border-gray-700 dark:bg-gray-800 dark:text-gray-100 dark:placeholder-gray-600"
            />
          </div>

        </div>

        {error && (
          <div className="mt-3">
            <p className="text-xs text-red-600 dark:text-red-400">{error}</p>
            {worktreeConflict && (
              <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                The existing worktree will be removed and a new one created.
              </p>
            )}
          </div>
        )}

        <div className="mt-5 flex justify-end gap-3">
          <button
            onClick={onClose}
            className="rounded-md border border-gray-300 px-4 py-2 text-sm font-medium text-gray-600 hover:border-gray-400 hover:text-gray-900 dark:border-gray-700 dark:text-gray-300 dark:hover:border-gray-600 dark:hover:text-gray-100"
          >
            Cancel
          </button>
          {worktreeConflict ? (
            <button
              onClick={() => {
                void handleSubmit(true);
              }}
              disabled={submitting}
              className="rounded-md bg-orange-600 px-4 py-2 text-sm font-medium text-white hover:bg-orange-500 disabled:opacity-40"
            >
              {submitting ? "Replacing…" : "Replace & Create"}
            </button>
          ) : (
            <button
              onClick={() => {
                void handleSubmit();
              }}
              disabled={submitting || repos.length === 0}
              className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-500 disabled:opacity-40"
            >
              {submitting ? "Creating…" : "Create Session"}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
