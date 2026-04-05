import type { GitHubIssue, GitHubPR } from "../lib/types";
import { isTauri } from "../lib/env";

async function openExternal(url: string) {
  if (isTauri()) {
    const { open } = await import("@tauri-apps/plugin-shell");
    await open(url);
  } else {
    window.open(url, "_blank");
  }
}

interface GitHubDetailViewProps {
  issue?: GitHubIssue | null;
  pr?: GitHubPR | null;
}

export function GitHubDetailView({ issue, pr }: GitHubDetailViewProps) {
  const item = issue ?? pr;
  if (!item) {
    return (
      <div className="flex h-full items-center justify-center bg-surface">
        <p className="text-sm text-on-surface-faint">No issue or PR linked.</p>
      </div>
    );
  }

  const isIssue = issue != null;
  const number = item.number;
  const state = item.state;

  return (
    <div className="h-full overflow-y-auto bg-surface px-6 py-5">
      <div className="mx-auto max-w-3xl">
        {/* Header */}
        <div className="flex items-center gap-2">
          {isIssue ? <IssueIcon state={state} /> : <PRIcon state={state} />}
          <span className="text-xs font-medium text-on-surface-muted">
            {isIssue ? `Issue #${number}` : `PR #${number}`}
          </span>
          <StateBadge state={state} />
        </div>

        {/* Title */}
        <h2 className="mt-2 text-lg font-semibold text-on-surface">{item.title}</h2>

        {/* Meta */}
        <div className="mt-2 flex flex-wrap items-center gap-3 text-xs text-on-surface-faint">
          <span>by {item.user}</span>
          <span>opened {formatDate(item.createdAt)}</span>
          {item.updatedAt !== item.createdAt && (
            <span>updated {formatDate(item.updatedAt)}</span>
          )}
          {item.comments > 0 && <span>{item.comments} comments</span>}
        </div>

        {/* Branch info for PRs */}
        {pr && (
          <div className="mt-3 flex items-center gap-1.5 text-xs">
            <code className="rounded bg-brand-muted px-1.5 py-0.5 font-mono text-brand">
              {pr.headRef}
            </code>
            <span className="text-on-surface-faint">&rarr;</span>
            <code className="rounded bg-hover px-1.5 py-0.5 font-mono text-on-surface-muted">
              {pr.baseRef}
            </code>
          </div>
        )}

        {/* Labels for issues */}
        {issue && issue.labels.length > 0 && (
          <div className="mt-3 flex flex-wrap gap-1.5">
            {issue.labels.map((label) => (
              <LabelBadge key={label.name} name={label.name} color={label.color} />
            ))}
          </div>
        )}

        {/* View on GitHub link */}
        <div className="mt-3">
          <span
            role="link"
            className="cursor-pointer text-xs text-brand hover:underline"
            onClick={() => {
              void openExternal(item.htmlUrl);
            }}
          >
            View on GitHub &rarr;
          </span>
        </div>

        {/* Body */}
        {item.body && (
          <div className="mt-4 border-t border-outline pt-4">
            <pre className="whitespace-pre-wrap font-sans text-sm leading-relaxed text-on-surface">
              {item.body}
            </pre>
          </div>
        )}
      </div>
    </div>
  );
}

function formatDate(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString(undefined, {
      year: "numeric",
      month: "short",
      day: "numeric",
    });
  } catch {
    return iso;
  }
}

function IssueIcon({ state }: { state: string }) {
  return (
    <svg
      className={`h-4 w-4 shrink-0 ${state === "open" ? "text-status-done" : "text-block-question"}`}
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
      ? "text-block-question"
      : state === "open"
        ? "text-status-done"
        : "text-danger";
  return (
    <svg className={`h-4 w-4 shrink-0 ${color}`} viewBox="0 0 16 16" fill="currentColor">
      <path d="M1.5 3.25a2.25 2.25 0 1 1 3 2.122v5.256a2.251 2.251 0 1 1-1.5 0V5.372A2.25 2.25 0 0 1 1.5 3.25Zm5.677-.177L9.573.677A.25.25 0 0 1 10 .854V2.5h1A2.5 2.5 0 0 1 13.5 5v5.628a2.251 2.251 0 1 1-1.5 0V5a1 1 0 0 0-1-1h-1v1.646a.25.25 0 0 1-.427.177L7.177 3.427a.25.25 0 0 1 0-.354ZM3.75 2.5a.75.75 0 1 0 0 1.5.75.75 0 0 0 0-1.5Zm0 9.5a.75.75 0 1 0 0 1.5.75.75 0 0 0 0-1.5Zm8.25.75a.75.75 0 1 0 1.5 0 .75.75 0 0 0-1.5 0Z" />
    </svg>
  );
}

function StateBadge({ state }: { state: string }) {
  const cls =
    state === "open"
      ? "bg-status-done-muted text-status-done"
      : state === "merged"
        ? "bg-block-question-muted text-block-question"
        : "bg-gray-500/15 text-on-surface-muted";
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
