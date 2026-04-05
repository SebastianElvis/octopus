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
      <div className="rounded-lg border border-outline bg-surface-sunken p-4">
        <h3 className="mb-3 text-xs font-semibold uppercase tracking-wide text-on-surface-muted">
          Review Comments
        </h3>
        <div className="space-y-3">
          {[1, 2, 3].map((n) => (
            <div key={n} className="flex animate-pulse flex-col gap-2">
              <div className="h-3 w-48 rounded bg-active" />
              <div className="h-2.5 w-full rounded bg-hover" />
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-sm border border-danger bg-danger-muted p-4">
        <p className="text-xs text-danger">
          Failed to load review comments: {error}
        </p>
      </div>
    );
  }

  if (comments.length === 0) {
    return (
      <div className="rounded-lg border border-outline bg-surface-sunken p-4">
        <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-on-surface-muted">
          Review Comments
        </h3>
        <p className="text-xs text-on-surface-faint">No review comments on this PR.</p>
      </div>
    );
  }

  return (
    <div className="rounded-lg border border-outline bg-surface-sunken p-4">
      <div className="mb-3 flex items-center justify-between">
        <h3 className="text-xs font-semibold uppercase tracking-wide text-on-surface-muted">
          Review Comments ({comments.length})
        </h3>
        {selectedIds.size > 0 && (
          <button
            onClick={() => {
              void handleCreateSession();
            }}
            disabled={creating}
            className="cursor-pointer rounded-sm bg-brand px-3 py-1.5 text-xs font-medium text-white hover:bg-blue-500 active:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-brand focus:ring-offset-1 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {creating ? "Creating..." : `Create Session to Address (${String(selectedIds.size)})`}
          </button>
        )}
      </div>

      {createError && <p className="mb-2 text-xs text-danger">{createError}</p>}

      <div className="max-h-64 space-y-3 overflow-y-auto">
        {comments.map((comment) => (
          <div
            key={comment.id}
            className={`rounded-sm border p-3 transition-colors ${
              selectedIds.has(comment.id)
                ? "border-brand bg-brand-muted"
                : "border-outline bg-surface-raised"
            }`}
          >
            <div className="mb-2 flex items-start gap-2">
              <input
                type="checkbox"
                checked={selectedIds.has(comment.id)}
                onChange={() => toggleSelection(comment.id)}
                className="mt-0.5 h-4 w-4 rounded border-outline-strong text-brand focus:ring-brand"
              />
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2 text-xs text-on-surface-muted">
                  <span className="font-medium text-on-surface">
                    {comment.user}
                  </span>
                  <span className="text-on-surface-faint">
                    {timeAgo(new Date(comment.createdAt).getTime())}
                  </span>
                </div>
                <div className="mt-0.5 flex items-center gap-1 text-xs text-on-surface-faint">
                  <span className="font-mono">{comment.path}</span>
                  {comment.line !== null && <span>:{String(comment.line)}</span>}
                </div>
              </div>
            </div>
            <p className="ml-6 text-sm leading-relaxed text-on-surface">
              {comment.body}
            </p>
          </div>
        ))}
      </div>
    </div>
  );
}
