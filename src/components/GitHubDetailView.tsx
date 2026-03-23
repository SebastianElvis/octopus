import Markdown from "react-markdown";
import remarkGfm from "remark-gfm";
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
      <div className="flex h-full items-center justify-center bg-white dark:bg-gray-950">
        <p className="text-sm text-gray-400">No issue or PR linked.</p>
      </div>
    );
  }

  const isIssue = !!issue;
  const isPR = !!pr;
  const state = isIssue ? issue.state : pr!.state;
  const body = ("body" in item && item.body) || "";
  const url = isIssue ? issue.htmlUrl : pr!.htmlUrl;

  return (
    <div className="h-full overflow-y-auto bg-white dark:bg-gray-950">
      <div className="mx-auto max-w-3xl px-6 py-5">
        {/* Header */}
        <div className="mb-4 border-b border-gray-200 pb-4 dark:border-gray-800">
          <div className="flex items-center gap-2">
            {isIssue ? <IssueIcon state={state} /> : <PRIcon state={state} />}
            <span className="text-xs font-medium text-gray-500 dark:text-gray-500">
              {isIssue ? "Issue" : "Pull Request"} #{item.number}
            </span>
            <StateBadge state={state} />
            <span className="ml-auto text-xs text-gray-400 dark:text-gray-600">
              {new Date(item.createdAt).toLocaleDateString(undefined, {
                year: "numeric",
                month: "short",
                day: "numeric",
              })}
            </span>
          </div>

          <h1 className="mt-2 text-xl font-semibold text-gray-900 dark:text-gray-100">
            {item.title}
          </h1>

          <div className="mt-2 flex flex-wrap items-center gap-3 text-xs text-gray-500 dark:text-gray-500">
            <span className="flex items-center gap-1">
              <UserIcon />
              {item.user}
            </span>
            {item.comments > 0 && (
              <span className="flex items-center gap-1">
                <CommentIcon />
                {item.comments} comment{item.comments !== 1 ? "s" : ""}
              </span>
            )}
            {isPR && pr && (
              <span className="flex items-center gap-1.5">
                <code className="rounded bg-blue-50 px-1.5 py-0.5 font-mono text-blue-700 dark:bg-blue-950/40 dark:text-blue-400">
                  {pr.headRef}
                </code>
                <span className="text-gray-400">→</span>
                <code className="rounded bg-gray-100 px-1.5 py-0.5 font-mono text-gray-600 dark:bg-gray-800 dark:text-gray-400">
                  {pr.baseRef}
                </code>
              </span>
            )}
          </div>

          {/* Labels */}
          {isIssue && issue.labels.length > 0 && (
            <div className="mt-3 flex flex-wrap gap-1.5">
              {issue.labels.map((label) => (
                <LabelBadge key={label.name} name={label.name} color={label.color} />
              ))}
            </div>
          )}

          <button
            onClick={() => void openExternal(url)}
            className="mt-3 inline-flex items-center gap-1 text-xs text-blue-600 hover:underline dark:text-blue-500"
          >
            Open on GitHub
            <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
            </svg>
          </button>
        </div>

        {/* Body */}
        {body ? (
          <div className="prose prose-sm prose-gray max-w-none dark:prose-invert prose-headings:text-gray-900 prose-p:text-gray-700 prose-a:text-blue-600 prose-code:rounded prose-code:bg-gray-100 prose-code:px-1 prose-code:py-0.5 prose-code:text-sm prose-code:before:content-none prose-code:after:content-none prose-pre:bg-gray-50 prose-pre:border prose-pre:border-gray-200 dark:prose-headings:text-gray-100 dark:prose-p:text-gray-300 dark:prose-a:text-blue-400 dark:prose-code:bg-gray-800 dark:prose-pre:bg-gray-900 dark:prose-pre:border-gray-800">
            <Markdown remarkPlugins={[remarkGfm]}>{body}</Markdown>
          </div>
        ) : (
          <p className="py-8 text-center text-sm italic text-gray-400 dark:text-gray-600">
            No description provided.
          </p>
        )}
      </div>
    </div>
  );
}

function IssueIcon({ state }: { state: string }) {
  return (
    <svg className={`h-5 w-5 shrink-0 ${state === "open" ? "text-green-600" : "text-purple-600"}`} viewBox="0 0 16 16" fill="currentColor">
      <path d="M8 9.5a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3Z" />
      <path d="M8 0a8 8 0 1 1 0 16A8 8 0 0 1 8 0ZM1.5 8a6.5 6.5 0 1 0 13 0 6.5 6.5 0 0 0-13 0Z" />
    </svg>
  );
}

function PRIcon({ state }: { state: string }) {
  const color = state === "merged" ? "text-purple-600" : state === "open" ? "text-green-600" : "text-red-600";
  return (
    <svg className={`h-5 w-5 shrink-0 ${color}`} viewBox="0 0 16 16" fill="currentColor">
      <path d="M1.5 3.25a2.25 2.25 0 1 1 3 2.122v5.256a2.251 2.251 0 1 1-1.5 0V5.372A2.25 2.25 0 0 1 1.5 3.25Zm5.677-.177L9.573.677A.25.25 0 0 1 10 .854V2.5h1A2.5 2.5 0 0 1 13.5 5v5.628a2.251 2.251 0 1 1-1.5 0V5a1 1 0 0 0-1-1h-1v1.646a.25.25 0 0 1-.427.177L7.177 3.427a.25.25 0 0 1 0-.354ZM3.75 2.5a.75.75 0 1 0 0 1.5.75.75 0 0 0 0-1.5Zm0 9.5a.75.75 0 1 0 0 1.5.75.75 0 0 0 0-1.5Zm8.25.75a.75.75 0 1 0 1.5 0 .75.75 0 0 0-1.5 0Z" />
    </svg>
  );
}

function StateBadge({ state }: { state: string }) {
  const cls =
    state === "open"
      ? "bg-green-600 text-white"
      : state === "merged"
        ? "bg-purple-600 text-white"
        : "bg-gray-500 text-white";
  return (
    <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${cls}`}>
      {state}
    </span>
  );
}

function LabelBadge({ name, color }: { name: string; color: string }) {
  const bg = `#${color}`;
  const r = parseInt(color.slice(0, 2), 16);
  const g = parseInt(color.slice(2, 4), 16);
  const b = parseInt(color.slice(4, 6), 16);
  const fg = (r * 299 + g * 587 + b * 114) / 1000 > 128 ? "#000" : "#fff";
  return (
    <span
      className="rounded-full px-2.5 py-0.5 text-xs font-medium"
      style={{ backgroundColor: bg, color: fg }}
    >
      {name}
    </span>
  );
}

function UserIcon() {
  return (
    <svg className="h-3.5 w-3.5 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
    </svg>
  );
}

function CommentIcon() {
  return (
    <svg className="h-3.5 w-3.5 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
    </svg>
  );
}
