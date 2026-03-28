import { useState } from "react";
import { useRepoStore } from "../stores/repoStore";
import { formatError } from "../lib/errors";

interface AddRepoDialogProps {
  open: boolean;
  onClose: () => void;
}

export function AddRepoDialog({ open, onClose }: AddRepoDialogProps) {
  const addRepo = useRepoStore((s) => s.addRepo);

  const [githubUrl, setGithubUrl] = useState("");
  const [localPath, setLocalPath] = useState("");
  const [adding, setAdding] = useState(false);
  const [addingStatus, setAddingStatus] = useState("");
  const [error, setError] = useState<string | null>(null);

  if (!open) return null;

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

  function normaliseGithubUrl(input: string): string {
    const trimmed = input.trim();
    if (/^https?:\/\//.test(trimmed)) return trimmed;
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
      setError(null);
      onClose();
    } catch (err: unknown) {
      setError(formatError(err));
    } finally {
      setAdding(false);
      setAddingStatus("");
    }
  }

  function handleClose() {
    if (adding) return;
    setGithubUrl("");
    setLocalPath("");
    setError(null);
    onClose();
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40"
      onClick={(e) => {
        if (e.target === e.currentTarget) handleClose();
      }}
    >
      <div className="w-full max-w-md rounded-lg border border-gray-200 bg-white p-6 shadow-xl dark:border-gray-700 dark:bg-gray-900">
        <h2 className="mb-4 text-base font-semibold text-gray-900 dark:text-gray-100">
          Add Repository
        </h2>
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
              autoFocus
              onKeyDown={(e) => {
                if (e.key === "Enter" && !adding) void handleAdd();
              }}
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
              onKeyDown={(e) => {
                if (e.key === "Enter" && !adding) void handleAdd();
              }}
              className="w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 placeholder-gray-400 focus:border-blue-600 focus:outline-none disabled:opacity-50 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-100 dark:placeholder-gray-500"
            />
          </div>
        </div>
        {error && <p className="mt-2 text-xs text-red-600 dark:text-red-400">{error}</p>}
        <div className="mt-4 flex items-center justify-between">
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
              onClick={handleClose}
              disabled={adding}
              className="cursor-pointer rounded-md border border-gray-300 px-3 py-1.5 text-sm text-gray-600 hover:border-gray-400 active:bg-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-1 disabled:cursor-not-allowed disabled:opacity-50 dark:border-gray-700 dark:text-gray-300 dark:hover:border-gray-600 dark:active:bg-gray-800"
            >
              Cancel
            </button>
            <button
              onClick={() => {
                void handleAdd();
              }}
              disabled={adding}
              className="cursor-pointer rounded-md bg-blue-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-blue-500 active:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-1 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {adding ? "Adding…" : "Add"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
