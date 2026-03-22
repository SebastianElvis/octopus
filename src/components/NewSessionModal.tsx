import { useState, useEffect } from "react";
import type { Repo, GitHubIssue } from "../lib/types";
import { fetchIssues, spawnSession } from "../lib/tauri";
import { useSessionStore } from "../stores/sessionStore";
import { formatError } from "../lib/errors";

type SourceType = "issue" | "pr" | "adhoc";

interface NewSessionModalProps {
  repos: Repo[];
  onClose: () => void;
}

export function NewSessionModal({ repos, onClose }: NewSessionModalProps) {
  const addSession = useSessionStore((s) => s.addSession);

  const [repoId, setRepoId] = useState(repos[0]?.id ?? "");
  const [sourceType, setSourceType] = useState<SourceType>("adhoc");
  const [url, setUrl] = useState("");
  const [prompt, setPrompt] = useState("");
  const [baseBranch, setBaseBranch] = useState("");
  const [branchName, setBranchName] = useState("");
  const [sessionName, setSessionName] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [issues, setIssues] = useState<GitHubIssue[]>([]);
  const [selectedIssue, setSelectedIssue] = useState<GitHubIssue | null>(null);

  const selectedRepo = repos.find((r) => r.id === repoId);

  useEffect(() => {
    if (selectedRepo) {
      setBaseBranch(selectedRepo.defaultBranch);
    }
  }, [selectedRepo]);

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
      const slug = selectedIssue.title
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .slice(0, 40);
      setBranchName(`issue-${selectedIssue.number}-${slug}`);
      setSessionName(selectedIssue.title.slice(0, 60));
    }
  }, [selectedIssue]);

  useEffect(() => {
    if (!selectedIssue && branchName === "") {
      setBranchName(`session-${Date.now()}`);
    }
  }, [selectedIssue, branchName]);

  async function handleSubmit() {
    if (!repoId || !prompt.trim() || !branchName.trim()) {
      setError("Please fill in all required fields.");
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      const session = await spawnSession({
        repoId,
        branch: branchName,
        prompt: prompt.trim(),
        name: sessionName || branchName,
        issueNumber: selectedIssue?.number,
      });
      addSession(session);
      onClose();
    } catch (err: unknown) {
      setError(formatError(err));
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
      <div className="w-full max-w-lg rounded-xl border border-gray-800 bg-gray-900 p-6 shadow-2xl">
        <div className="mb-5 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-gray-100">New Session</h2>
          <button onClick={onClose} className="text-gray-500 hover:text-gray-300">
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
            <label className="mb-1 block text-xs font-medium text-gray-400">Repository</label>
            {repos.length === 0 ? (
              <p className="text-xs text-gray-600">No repositories added yet.</p>
            ) : (
              <select
                value={repoId}
                onChange={(e) => setRepoId(e.target.value)}
                className="w-full rounded-md border border-gray-700 bg-gray-800 px-3 py-2 text-sm text-gray-100 focus:border-blue-600 focus:outline-none"
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
            <label className="mb-1 block text-xs font-medium text-gray-400">Source</label>
            <div className="flex rounded-md border border-gray-700 text-sm">
              {(["issue", "pr", "adhoc"] as SourceType[]).map((t) => (
                <button
                  key={t}
                  onClick={() => setSourceType(t)}
                  className={`flex-1 py-1.5 capitalize ${
                    sourceType === t
                      ? "bg-gray-700 text-gray-100"
                      : "text-gray-500 hover:text-gray-300"
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
              <label className="mb-1 block text-xs font-medium text-gray-400">
                {sourceType === "issue" ? "Issue URL" : "PR URL"}
              </label>
              <input
                type="url"
                value={url}
                onChange={(e) => handleUrlChange(e.target.value)}
                placeholder={`https://github.com/owner/repo/${sourceType}s/123`}
                className="w-full rounded-md border border-gray-700 bg-gray-800 px-3 py-2 text-sm text-gray-100 placeholder-gray-600 focus:border-blue-600 focus:outline-none"
              />
            </div>
          )}

          {/* Issue picker */}
          {sourceType === "issue" && issues.length > 0 && (
            <div>
              <label className="mb-1 block text-xs font-medium text-gray-400">Select Issue</label>
              <select
                value={selectedIssue?.number ?? ""}
                onChange={(e) => {
                  const num = parseInt(e.target.value, 10);
                  const found = issues.find((i) => i.number === num) ?? null;
                  setSelectedIssue(found);
                }}
                className="w-full rounded-md border border-gray-700 bg-gray-800 px-3 py-2 text-sm text-gray-100 focus:border-blue-600 focus:outline-none"
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

          {/* Session name */}
          <div>
            <label className="mb-1 block text-xs font-medium text-gray-400">Session Name</label>
            <input
              type="text"
              value={sessionName}
              onChange={(e) => setSessionName(e.target.value)}
              placeholder="e.g. Fix login bug"
              className="w-full rounded-md border border-gray-700 bg-gray-800 px-3 py-2 text-sm text-gray-100 placeholder-gray-600 focus:border-blue-600 focus:outline-none"
            />
          </div>

          {/* Prompt */}
          <div>
            <label className="mb-1 block text-xs font-medium text-gray-400">Prompt</label>
            <textarea
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              placeholder="Describe the task for Claude…"
              rows={4}
              className="w-full resize-none rounded-md border border-gray-700 bg-gray-800 px-3 py-2 text-sm text-gray-100 placeholder-gray-600 focus:border-blue-600 focus:outline-none"
            />
          </div>

          {/* Base branch */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1 block text-xs font-medium text-gray-400">Base Branch</label>
              <input
                type="text"
                value={baseBranch}
                onChange={(e) => setBaseBranch(e.target.value)}
                placeholder="main"
                className="w-full rounded-md border border-gray-700 bg-gray-800 px-3 py-2 text-sm text-gray-100 placeholder-gray-600 focus:border-blue-600 focus:outline-none"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-gray-400">Branch Name</label>
              <input
                type="text"
                value={branchName}
                onChange={(e) => setBranchName(e.target.value)}
                placeholder="feature/my-branch"
                className="w-full rounded-md border border-gray-700 bg-gray-800 px-3 py-2 text-sm text-gray-100 placeholder-gray-600 focus:border-blue-600 focus:outline-none"
              />
            </div>
          </div>
        </div>

        {error && <p className="mt-3 text-xs text-red-400">{error}</p>}

        <div className="mt-5 flex justify-end gap-3">
          <button
            onClick={onClose}
            className="rounded-md border border-gray-700 px-4 py-2 text-sm font-medium text-gray-300 hover:border-gray-600 hover:text-gray-100"
          >
            Cancel
          </button>
          <button
            onClick={() => {
              void handleSubmit();
            }}
            disabled={submitting || repos.length === 0}
            className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-500 disabled:opacity-40"
          >
            {submitting ? "Creating…" : "Create Session"}
          </button>
        </div>
      </div>
    </div>
  );
}
