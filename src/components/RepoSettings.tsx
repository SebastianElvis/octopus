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
  const [error, setError] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);

  useEffect(() => {
    setLoadingRepos(true);
    void loadRepos().finally(() => {
      setLoadingRepos(false);
    });
  }, [loadRepos]);

  async function handleAdd() {
    if (!githubUrl.trim() || !localPath.trim()) {
      setError("Both GitHub URL and local path are required.");
      return;
    }
    setAdding(true);
    setError(null);
    try {
      await addRepo(githubUrl.trim(), localPath.trim());
      setGithubUrl("");
      setLocalPath("");
      setShowForm(false);
    } catch (err: unknown) {
      setError(formatError(err));
    } finally {
      setAdding(false);
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
                GitHub URL
              </label>
              <input
                type="url"
                value={githubUrl}
                onChange={(e) => setGithubUrl(e.target.value)}
                placeholder="https://github.com/owner/repo"
                className="w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 placeholder-gray-400 focus:border-blue-600 focus:outline-none dark:border-gray-700 dark:bg-gray-800 dark:text-gray-100 dark:placeholder-gray-600"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-gray-500 dark:text-gray-400">
                Local Path
              </label>
              <input
                type="text"
                value={localPath}
                onChange={(e) => setLocalPath(e.target.value)}
                placeholder="/Users/you/Projects/repo"
                className="w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 placeholder-gray-400 focus:border-blue-600 focus:outline-none dark:border-gray-700 dark:bg-gray-800 dark:text-gray-100 dark:placeholder-gray-600"
              />
            </div>
          </div>
          {error && <p className="mt-2 text-xs text-red-600 dark:text-red-400">{error}</p>}
          <div className="mt-3 flex justify-end gap-2">
            <button
              onClick={() => {
                setShowForm(false);
                setError(null);
              }}
              className="rounded-md border border-gray-300 px-3 py-1.5 text-sm text-gray-600 hover:border-gray-400 dark:border-gray-700 dark:text-gray-300 dark:hover:border-gray-600"
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
        <p className="text-sm text-gray-400 dark:text-gray-600">No repositories connected yet.</p>
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
                <p className="truncate text-xs text-gray-500">{repo.localPath}</p>
                <p className="mt-0.5 text-xs text-gray-400 dark:text-gray-600">
                  Default branch: {repo.defaultBranch}
                </p>
              </div>
              <button
                onClick={() => removeRepo(repo.id)}
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
