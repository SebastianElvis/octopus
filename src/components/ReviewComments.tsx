import { useState, useEffect } from "react";
import type { ReviewComment } from "../lib/types";
import { fetchPrReviewComments, createSessionFromReview } from "../lib/tauri";
import { useSessionStore } from "../stores/sessionStore";
import { formatError } from "../lib/errors";
import { timeAgo } from "../lib/utils";

interface ReviewCommentsProps {
  repoId: string;
  prNumber: number;
}

export function ReviewComments({ repoId, prNumber }: ReviewCommentsProps) {
  const addSession = useSessionStore((s) => s.addSession);

  const [comments, setComments] = useState<ReviewComment[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);

  useEffect(() => {
    setLoading(true);
    setError(null);
    fetchPrReviewComments(repoId, prNumber)
      .then(setComments)
      .catch((err: unknown) => {
        setError(formatError(err));
      })
      .finally(() => {
        setLoading(false);
      });
  }, [repoId, prNumber]);

  function toggleSelection(id: number) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  }

  async function handleCreateSession() {
    if (selectedIds.size === 0) return;
    setCreating(true);
    setCreateError(null);
    try {
      const session = await createSessionFromReview({
        repoId,
        prNumber,
        commentIds: Array.from(selectedIds),
      });
      addSession(session);
      setSelectedIds(new Set());
    } catch (err: unknown) {
      setCreateError(formatError(err));
    } finally {
      setCreating(false);
    }
  }

  if (loading) {
    return (
      <div className="rounded-lg border border-gray-200 bg-gray-50 p-4 dark:border-gray-800 dark:bg-gray-900">
        <h3 className="mb-3 text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
          Review Comments
        </h3>
        <div className="space-y-3">
          {[1, 2, 3].map((n) => (
            <div key={n} className="flex animate-pulse flex-col gap-2">
              <div className="h-3 w-48 rounded bg-gray-200 dark:bg-gray-700" />
              <div className="h-2.5 w-full rounded bg-gray-100 dark:bg-gray-800" />
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-lg border border-red-200 bg-red-50 p-4 dark:border-red-800/40 dark:bg-red-950/20">
        <p className="text-xs text-red-600 dark:text-red-400">
          Failed to load review comments: {error}
        </p>
      </div>
    );
  }

  if (comments.length === 0) {
    return (
      <div className="rounded-lg border border-gray-200 bg-gray-50 p-4 dark:border-gray-800 dark:bg-gray-900">
        <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
          Review Comments
        </h3>
        <p className="text-xs text-gray-400 dark:text-gray-500">No review comments on this PR.</p>
      </div>
    );
  }

  return (
    <div className="rounded-lg border border-gray-200 bg-gray-50 p-4 dark:border-gray-800 dark:bg-gray-900">
      <div className="mb-3 flex items-center justify-between">
        <h3 className="text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
          Review Comments ({comments.length})
        </h3>
        {selectedIds.size > 0 && (
          <button
            onClick={() => {
              void handleCreateSession();
            }}
            disabled={creating}
            className="cursor-pointer rounded-md bg-blue-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-blue-500 active:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-1 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {creating ? "Creating..." : `Create Session to Address (${String(selectedIds.size)})`}
          </button>
        )}
      </div>

      {createError && <p className="mb-2 text-xs text-red-600 dark:text-red-400">{createError}</p>}

      <div className="max-h-64 space-y-3 overflow-y-auto">
        {comments.map((comment) => (
          <div
            key={comment.id}
            className={`rounded-md border p-3 transition-colors ${
              selectedIds.has(comment.id)
                ? "border-blue-400 bg-blue-50 dark:border-blue-700 dark:bg-blue-950/30"
                : "border-gray-200 bg-white dark:border-gray-700 dark:bg-gray-800"
            }`}
          >
            <div className="mb-2 flex items-start gap-2">
              <input
                type="checkbox"
                checked={selectedIds.has(comment.id)}
                onChange={() => toggleSelection(comment.id)}
                className="mt-0.5 h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500 dark:border-gray-600"
              />
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2 text-xs text-gray-500 dark:text-gray-400">
                  <span className="font-medium text-gray-700 dark:text-gray-300">
                    {comment.user}
                  </span>
                  <span className="text-gray-400 dark:text-gray-500">
                    {timeAgo(new Date(comment.createdAt).getTime())}
                  </span>
                </div>
                <div className="mt-0.5 flex items-center gap-1 text-xs text-gray-400 dark:text-gray-500">
                  <span className="font-mono">{comment.path}</span>
                  {comment.line !== null && <span>:{String(comment.line)}</span>}
                </div>
              </div>
            </div>
            <p className="ml-6 text-sm leading-relaxed text-gray-700 dark:text-gray-300">
              {comment.body}
            </p>
          </div>
        ))}
      </div>
    </div>
  );
}
