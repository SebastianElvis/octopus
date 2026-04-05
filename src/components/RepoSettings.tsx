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
        <h2 className="text-base font-semibold text-on-surface">Repositories</h2>
        <button
          onClick={() => setShowForm((v) => !v)}
          className="cursor-pointer rounded-sm bg-brand px-3 py-1.5 text-sm font-medium text-white hover:bg-brand active:bg-brand focus:outline-none focus:ring-2 focus:ring-brand focus:ring-offset-1"
        >
          + Add Repo
        </button>
      </div>

      {/* Add form */}
      {showForm && (
        <div className="rounded-sm border border-outline bg-surface-sunken p-4">
          <h3 className="mb-3 text-sm font-medium text-on-surface">
            Add Repository
          </h3>
          <div className="space-y-3">
            <div>
              <label className="mb-1 block text-xs font-medium text-on-surface-muted">
                GitHub URL or owner/repo
              </label>
              <input
                type="text"
                value={githubUrl}
                onChange={(e) => setGithubUrl(e.target.value)}
                disabled={adding}
                placeholder="owner/repo"
                className="w-full rounded-sm border border-outline bg-surface-raised px-3 py-2 text-sm text-on-surface placeholder-on-surface-faint focus:border-brand focus:outline-none disabled:opacity-50"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-on-surface-muted">
                Local Path{" "}
                <span className="font-normal text-on-surface-faint">(optional)</span>
              </label>
              <input
                type="text"
                value={localPath}
                onChange={(e) => setLocalPath(e.target.value)}
                disabled={adding}
                placeholder="Default: ~/.toomanytabs/repos/owner/repo"
                className="w-full rounded-sm border border-outline bg-surface-raised px-3 py-2 text-sm text-on-surface placeholder-on-surface-faint focus:border-brand focus:outline-none disabled:opacity-50"
              />
            </div>
          </div>
          {error && <p className="mt-2 text-xs text-danger">{error}</p>}
          <div className="mt-3 flex items-center justify-between">
            {adding ? (
              <div className="flex items-center gap-2 text-xs text-on-surface-muted">
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
                className="cursor-pointer rounded-sm border border-outline px-3 py-1.5 text-sm text-on-surface-muted hover:border-outline-strong active:bg-hover focus:outline-none focus:ring-2 focus:ring-brand focus:ring-offset-1 disabled:cursor-not-allowed disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                onClick={() => {
                  void handleAdd();
                }}
                disabled={adding}
                className="cursor-pointer rounded-sm bg-brand px-3 py-1.5 text-sm font-medium text-white hover:bg-brand active:bg-brand focus:outline-none focus:ring-2 focus:ring-brand focus:ring-offset-1 disabled:cursor-not-allowed disabled:opacity-50"
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
              className="flex animate-pulse items-center justify-between rounded-sm border border-outline bg-surface-sunken px-4 py-3"
            >
              <div className="space-y-2">
                <div className="h-3 w-48 rounded bg-active" />
                <div className="h-2.5 w-32 rounded bg-hover" />
              </div>
              <div className="h-6 w-14 rounded bg-hover" />
            </div>
          ))}
        </div>
      ) : repos.length === 0 ? (
        <p className="text-sm text-on-surface-faint">No repositories connected yet.</p>
      ) : (
        <div className="space-y-2">
          {repos.map((repo) => (
            <div
              key={repo.id}
              className="flex items-center justify-between rounded-sm border border-outline bg-surface-sunken px-4 py-3"
            >
              <div className="min-w-0">
                <p className="truncate text-sm font-medium text-on-surface">
                  {repo.githubUrl}
                </p>
                <p className="truncate text-xs text-on-surface-muted">
                  {repo.localPath}
                </p>
                <p className="mt-0.5 text-xs text-on-surface-faint">
                  Default branch: {repo.defaultBranch}
                </p>
              </div>
              <button
                onClick={() => {
                  void removeRepo(repo.id);
                }}
                className="ml-3 shrink-0 cursor-pointer rounded-sm border border-outline px-2.5 py-1 text-xs text-danger hover:border-danger/30 hover:text-danger active:bg-danger-muted focus:outline-none focus:ring-2 focus:ring-danger focus:ring-offset-1"
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
