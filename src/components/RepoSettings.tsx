import { useState, useEffect } from "react";
import { useRepoStore } from "../stores/repoStore";
import { formatError } from "../lib/errors";

export function RepoSettings() {
  const repos = useRepoStore((s) => s.repos);
  const addRepo = useRepoStore((s) => s.addRepo);
  const removeRepo = useRepoStore((s) => s.removeRepo);
  const loadRepos = useRepoStore((s) => s.loadRepos);

  const [loadingRepos, setLoadingRepos] = useState(true);

  const [githubUrl, setGithubUrl] = useState("");
  const [localPath, setLocalPath] = useState("");
  const [adding, setAdding] = useState(false);
  const [addingStatus, setAddingStatus] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);

  useEffect(() => {
    setLoadingRepos(true);
    void loadRepos().finally(() => {
      setLoadingRepos(false);
    });
  }, [loadRepos]);

  /** Extract `owner/repo` from a URL or shorthand. */
  function ownerRepoFromInput(input: string): string {
    return (
      input
        .trim()
        .replace(/\.git$/, "")
        .replace(/^https?:\/\/github\.com\//, "")
        .split("/")
        .slice(-2)
        .join("/") || input
    );
  }

  /** Normalise user input: accept `owner/repo` shorthand → full URL. */
  function normaliseGithubUrl(input: string): string {
    const trimmed = input.trim();
    // Already a URL
    if (/^https?:\/\//.test(trimmed)) return trimmed;
    // owner/repo shorthand
    if (/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(trimmed)) {
      return `https://github.com/${trimmed}`;
    }
    return trimmed;
  }

  async function handleAdd() {
    if (!githubUrl.trim()) {
      setError("GitHub URL is required.");
      return;
    }
    setAdding(true);
    setError(null);

    const name = ownerRepoFromInput(githubUrl);
    if (localPath.trim()) {
      setAddingStatus(`Connecting ${name}...`);
    } else {
      setAddingStatus(`Cloning ${name}... This may take a moment.`);
    }

    try {
      await addRepo(normaliseGithubUrl(githubUrl), localPath.trim() || undefined);
      setGithubUrl("");
      setLocalPath("");
      setShowForm(false);
    } catch (err: unknown) {
      setError(formatError(err));
    } finally {
      setAdding(false);
      setAddingStatus("");
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <h2 className="text-base font-semibold text-gray-900 dark:text-gray-100">Repositories</h2>
        <button
          onClick={() => setShowForm((v) => !v)}
          className="rounded-md bg-blue-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-blue-500"
        >
          + Add Repo
        </button>
      </div>

      {/* Add form */}
      {showForm && (
        <div className="rounded-lg border border-gray-200 bg-gray-50 p-4 dark:border-gray-800 dark:bg-gray-900">
          <h3 className="mb-3 text-sm font-medium text-gray-700 dark:text-gray-300">
            Add Repository
          </h3>
          <div className="space-y-3">
            <div>
              <label className="mb-1 block text-xs font-medium text-gray-500 dark:text-gray-400">
                GitHub URL or owner/repo
              </label>
              <input
                type="text"
                value={githubUrl}
                onChange={(e) => setGithubUrl(e.target.value)}
                disabled={adding}
                placeholder="owner/repo"
                className="w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 placeholder-gray-400 focus:border-blue-600 focus:outline-none disabled:opacity-50 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-100 dark:placeholder-gray-500"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-gray-500 dark:text-gray-400">
                Local Path{" "}
                <span className="font-normal text-gray-400 dark:text-gray-500">(optional)</span>
              </label>
              <input
                type="text"
                value={localPath}
                onChange={(e) => setLocalPath(e.target.value)}
                disabled={adding}
                placeholder="Default: ~/.toomanytabs/repos/owner/repo"
                className="w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 placeholder-gray-400 focus:border-blue-600 focus:outline-none disabled:opacity-50 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-100 dark:placeholder-gray-500"
              />
            </div>
          </div>
          {error && <p className="mt-2 text-xs text-red-600 dark:text-red-400">{error}</p>}
          <div className="mt-3 flex items-center justify-between">
            {adding ? (
              <div className="flex items-center gap-2 text-xs text-gray-500 dark:text-gray-400">
                <svg
                  className="h-3.5 w-3.5 animate-spin text-blue-600"
                  viewBox="0 0 24 24"
                  fill="none"
                >
                  <circle
                    className="opacity-25"
                    cx="12"
                    cy="12"
                    r="10"
                    stroke="currentColor"
                    strokeWidth="4"
                  />
                  <path
                    className="opacity-75"
                    fill="currentColor"
                    d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
                  />
                </svg>
                {addingStatus}
              </div>
            ) : (
              <div />
            )}
            <div className="flex gap-2">
              <button
                onClick={() => {
                  setShowForm(false);
                  setError(null);
                }}
                disabled={adding}
                className="rounded-md border border-gray-300 px-3 py-1.5 text-sm text-gray-600 hover:border-gray-400 disabled:opacity-40 dark:border-gray-700 dark:text-gray-300 dark:hover:border-gray-600"
              >
                Cancel
              </button>
              <button
                onClick={() => {
                  void handleAdd();
                }}
                disabled={adding}
                className="rounded-md bg-blue-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-blue-500 disabled:opacity-40"
              >
                {adding ? "Adding…" : "Add"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Repo list */}
      {loadingRepos ? (
        <div className="space-y-2">
          {[1, 2].map((n) => (
            <div
              key={n}
              className="flex animate-pulse items-center justify-between rounded-lg border border-gray-200 bg-gray-50 px-4 py-3 dark:border-gray-800 dark:bg-gray-900"
            >
              <div className="space-y-2">
                <div className="h-3 w-48 rounded bg-gray-200 dark:bg-gray-700" />
                <div className="h-2.5 w-32 rounded bg-gray-100 dark:bg-gray-800" />
              </div>
              <div className="h-6 w-14 rounded bg-gray-100 dark:bg-gray-800" />
            </div>
          ))}
        </div>
      ) : repos.length === 0 ? (
        <p className="text-sm text-gray-400 dark:text-gray-500">No repositories connected yet.</p>
      ) : (
        <div className="space-y-2">
          {repos.map((repo) => (
            <div
              key={repo.id}
              className="flex items-center justify-between rounded-lg border border-gray-200 bg-gray-50 px-4 py-3 dark:border-gray-800 dark:bg-gray-900"
            >
              <div className="min-w-0">
                <p className="truncate text-sm font-medium text-gray-900 dark:text-gray-100">
                  {repo.githubUrl}
                </p>
                <p className="truncate text-xs text-gray-500 dark:text-gray-400">{repo.localPath}</p>
                <p className="mt-0.5 text-xs text-gray-400 dark:text-gray-500">
                  Default branch: {repo.defaultBranch}
                </p>
              </div>
              <button
                onClick={() => {
                  void removeRepo(repo.id);
                }}
                className="ml-3 shrink-0 rounded-md border border-gray-300 px-2.5 py-1 text-xs text-red-500 hover:border-red-300 hover:text-red-600 dark:border-gray-700 dark:text-red-400 dark:hover:border-red-800 dark:hover:text-red-300"
              >
                Remove
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
