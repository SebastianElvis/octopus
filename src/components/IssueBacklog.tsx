import { useState, useEffect, useMemo } from "react";
import type { GitHubIssue, GitHubPR, Repo, LabelInfo } from "../lib/types";
import { fetchIssues, fetchPRs } from "../lib/tauri";
import { formatError } from "../lib/errors";
import { timeAgo } from "../lib/utils";
import { isTauri } from "../lib/env";

async function openExternal(url: string) {
  if (isTauri()) {
    const { open } = await import("@tauri-apps/plugin-shell");
    await open(url);
  } else {
    window.open(url, "_blank");
  }
}

type FilterTab = "all" | "issues" | "prs";

interface BacklogItem {
  kind: "issue" | "pr";
  repo: Repo;
  issue?: GitHubIssue;
  pr?: GitHubPR;
  number: number;
  title: string;
  state: string;
  labels: LabelInfo[];
  author: string;
  comments: number;
  createdAt: string;
  updatedAt: string;
  url: string;
}

interface IssueBacklogProps {
  repos: Repo[];
  onSelectIssue: (repo: Repo, issue: GitHubIssue) => void;
  onSelectPR: (repo: Repo, pr: GitHubPR) => void;
  onNavigateSettings: () => void;
}

function repoName(repo: Repo): string {
  return (repo.githubUrl ?? "").split("/").slice(-2).join("/") || "unknown";
}

/** Compute readable text color (black or white) for a hex background. */
function textColorForBg(hex: string): string {
  const r = parseInt(hex.slice(0, 2), 16);
  const g = parseInt(hex.slice(2, 4), 16);
  const b = parseInt(hex.slice(4, 6), 16);
  // Perceived brightness
  const brightness = (r * 299 + g * 587 + b * 114) / 1000;
  return brightness > 128 ? "#000000" : "#ffffff";
}

export function IssueBacklog({
  repos,
  onSelectIssue,
  onSelectPR,
  onNavigateSettings,
}: IssueBacklogProps) {
  const [items, setItems] = useState<BacklogItem[]>([]);
  const [loading, setLoading] = useState(repos.length > 0);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<FilterTab>("all");
  const [search, setSearch] = useState("");
  const [selectedRepo, setSelectedRepo] = useState<string>("all");
  const [selectedLabel, setSelectedLabel] = useState<string>("all");

  const hasRepos = repos.length > 0;

  useEffect(() => {
    if (!hasRepos) return;

    let cancelled = false;

    async function load() {
      try {
        const promises = repos.flatMap((repo) => [
          fetchIssues(repo.id)
            .then((issues) =>
              issues
                .filter((i) => i.state === "open")
                .map(
                  (issue): BacklogItem => ({
                    kind: "issue",
                    repo,
                    issue,
                    number: issue.number,
                    title: issue.title,
                    state: issue.state,
                    labels: issue.labels ?? [],
                    author: issue.user,
                    comments: issue.comments,
                    createdAt: issue.createdAt,
                    updatedAt: issue.updatedAt,
                    url: issue.htmlUrl,
                  }),
                ),
            )
            .catch((err: unknown) => {
              console.error(`Failed to fetch issues for ${repo.githubUrl}:`, formatError(err));
              return [] as BacklogItem[];
            }),
          fetchPRs(repo.id)
            .then((prs) =>
              prs
                .filter((p) => p.state === "open")
                .map(
                  (pr): BacklogItem => ({
                    kind: "pr",
                    repo,
                    pr,
                    number: pr.number,
                    title: pr.title,
                    state: pr.state,
                    labels: [],
                    author: pr.user,
                    comments: pr.comments,
                    createdAt: pr.createdAt,
                    updatedAt: pr.updatedAt,
                    url: pr.htmlUrl,
                  }),
                ),
            )
            .catch((err: unknown) => {
              console.error(`Failed to fetch PRs for ${repo.githubUrl}:`, formatError(err));
              return [] as BacklogItem[];
            }),
        ]);

        const results = await Promise.all(promises);
        if (!cancelled) {
          setItems(results.flat());
        }
      } catch (err: unknown) {
        if (!cancelled) {
          setError(formatError(err));
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    void load();
    return () => {
      cancelled = true;
    };
  }, [hasRepos, repos]);

  // Collect all unique labels for the label filter
  const allLabels = useMemo(() => {
    const set = new Set<string>();
    for (const item of items) {
      for (const l of item.labels) set.add(l.name);
    }
    return Array.from(set).sort();
  }, [items]);

  const filtered = useMemo(() => {
    let list = items;
    if (filter === "issues") list = list.filter((i) => i.kind === "issue");
    if (filter === "prs") list = list.filter((i) => i.kind === "pr");
    if (selectedRepo !== "all") list = list.filter((i) => i.repo.id === selectedRepo);
    if (selectedLabel !== "all") list = list.filter((i) => i.labels.some((l) => l.name === selectedLabel));
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter(
        (i) =>
          i.title.toLowerCase().includes(q) ||
          String(i.number).includes(q) ||
          i.labels.some((l) => l.name.toLowerCase().includes(q)) ||
          i.author.toLowerCase().includes(q),
      );
    }
    return list;
  }, [items, filter, search, selectedRepo, selectedLabel]);

  const issueCount = items.filter((i) => i.kind === "issue").length;
  const prCount = items.filter((i) => i.kind === "pr").length;

  if (repos.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-24 text-center">
        <p className="text-lg font-medium text-gray-500 dark:text-gray-400">No repos connected</p>
        <p className="mt-1 text-sm text-gray-400 dark:text-gray-600">
          Connect a repository to browse its issues and pull requests.
        </p>
        <button
          onClick={onNavigateSettings}
          className="mt-4 rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-500"
        >
          Add a Repo
        </button>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <h2 className="text-base font-semibold text-gray-900 dark:text-gray-100">Task Backlog</h2>
      </div>

      {/* Search bar */}
      <input
        type="text"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        placeholder="Search by title, #number, label, or author..."
        className="w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 placeholder-gray-400 focus:border-blue-600 focus:outline-none dark:border-gray-700 dark:bg-gray-800 dark:text-gray-100 dark:placeholder-gray-600"
      />

      {/* Filter row: type tabs + dropdowns */}
      <div className="flex flex-wrap items-center gap-3">
        {/* Type tabs */}
        <div className="flex rounded-md border border-gray-300 text-sm dark:border-gray-700">
          {(
            [
              ["all", `All (${String(items.length)})`],
              ["issues", `Issues (${String(issueCount)})`],
              ["prs", `PRs (${String(prCount)})`],
            ] as [FilterTab, string][]
          ).map(([tab, label]) => (
            <button
              key={tab}
              onClick={() => setFilter(tab)}
              className={`px-3 py-1.5 text-center ${
                filter === tab
                  ? "bg-gray-100 text-gray-900 dark:bg-gray-700 dark:text-gray-100"
                  : "text-gray-500 hover:text-gray-700 dark:text-gray-500 dark:hover:text-gray-300"
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        {/* Repo filter */}
        {repos.length > 1 && (
          <select
            value={selectedRepo}
            onChange={(e) => setSelectedRepo(e.target.value)}
            className="rounded-md border border-gray-300 bg-white px-2 py-1.5 text-sm text-gray-700 focus:border-blue-600 focus:outline-none dark:border-gray-700 dark:bg-gray-800 dark:text-gray-300"
          >
            <option value="all">All repos</option>
            {repos.map((r) => (
              <option key={r.id} value={r.id}>
                {repoName(r)}
              </option>
            ))}
          </select>
        )}

        {/* Label filter */}
        {allLabels.length > 0 && (
          <select
            value={selectedLabel}
            onChange={(e) => setSelectedLabel(e.target.value)}
            className="rounded-md border border-gray-300 bg-white px-2 py-1.5 text-sm text-gray-700 focus:border-blue-600 focus:outline-none dark:border-gray-700 dark:bg-gray-800 dark:text-gray-300"
          >
            <option value="all">All labels</option>
            {allLabels.map((l) => (
              <option key={l} value={l}>
                {l}
              </option>
            ))}
          </select>
        )}
      </div>

      {/* Error */}
      {error && <p className="text-xs text-red-600 dark:text-red-400">{error}</p>}

      {/* Loading skeletons */}
      {loading && (
        <div className="space-y-2">
          {[1, 2, 3, 4, 5].map((n) => (
            <div
              key={n}
              className="flex animate-pulse items-center justify-between rounded-lg border border-gray-200 bg-gray-50 px-4 py-3 dark:border-gray-800 dark:bg-gray-900"
            >
              <div className="space-y-2">
                <div className="h-3 w-64 rounded bg-gray-200 dark:bg-gray-700" />
                <div className="h-2.5 w-40 rounded bg-gray-100 dark:bg-gray-800" />
              </div>
              <div className="h-5 w-12 rounded bg-gray-100 dark:bg-gray-800" />
            </div>
          ))}
        </div>
      )}

      {/* Items list */}
      {!loading && filtered.length === 0 && (
        <p className="py-8 text-center text-sm text-gray-400 dark:text-gray-600">
          {search || selectedRepo !== "all" || selectedLabel !== "all"
            ? "No results match your filters."
            : "No open issues or pull requests found."}
        </p>
      )}

      {!loading && filtered.length > 0 && (
        <div className="space-y-1.5">
          {filtered.map((item) => {
            const rName = repoName(item.repo);
            const ts = item.updatedAt || item.createdAt;
            const ago = ts ? timeAgo(new Date(ts).getTime()) : "";
            return (
              <button
                key={`${item.repo.id}-${item.kind}-${String(item.number)}`}
                onClick={() => {
                  if (item.kind === "issue" && item.issue) {
                    onSelectIssue(item.repo, item.issue);
                  } else if (item.kind === "pr" && item.pr) {
                    onSelectPR(item.repo, item.pr);
                  }
                }}
                className="flex w-full items-start gap-3 rounded-lg border border-gray-200 bg-white px-4 py-3 text-left transition-colors hover:border-gray-300 dark:border-gray-800 dark:bg-gray-900 dark:hover:border-gray-700"
              >
                {/* State icon — GitHub-style colors */}
                {item.kind === "issue" ? (
                  <IssueIcon state={item.state} />
                ) : (
                  <PRIcon state={item.state} />
                )}

                {/* Main content */}
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="truncate text-sm font-medium text-gray-900 dark:text-gray-100">
                      {item.title}
                    </span>
                  </div>
                  <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-gray-500 dark:text-gray-500">
                    <span className="font-medium text-gray-600 dark:text-gray-400">{rName}</span>
                    <span className="text-gray-400 dark:text-gray-600">#{String(item.number)}</span>
                    {item.author && <span>by {item.author}</span>}
                    {item.comments > 0 && (
                      <span className="flex items-center gap-0.5">
                        <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
                        </svg>
                        {String(item.comments)}
                      </span>
                    )}
                    {ago && <span>{ago}</span>}
                    {/* Direct GitHub link */}
                    <span
                      role="link"
                      className="cursor-pointer text-blue-500 hover:underline dark:text-blue-400"
                      onClick={(e) => {
                        e.stopPropagation();
                        void openExternal(item.url);
                      }}
                    >
                      GitHub &rarr;
                    </span>
                  </div>
                  {/* Labels with GitHub colors */}
                  {item.labels.length > 0 && (
                    <div className="mt-1.5 flex flex-wrap gap-1">
                      {item.labels.map((label) => (
                        <span
                          key={label.name}
                          className="rounded-full px-2 py-0.5 text-xs font-medium"
                          style={{
                            backgroundColor: `#${label.color}`,
                            color: textColorForBg(label.color),
                            border: `1px solid #${label.color}40`,
                          }}
                        >
                          {label.name}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

/** GitHub-style issue icon: green circle-dot for open, purple circle-check for closed. */
function IssueIcon({ state }: { state: string }) {
  if (state === "closed") {
    return (
      <svg className="mt-0.5 h-4 w-4 shrink-0 text-[#8250df]" viewBox="0 0 16 16" fill="currentColor">
        <path d="M11.28 6.78a.75.75 0 0 0-1.06-1.06L7.25 8.69 5.78 7.22a.75.75 0 0 0-1.06 1.06l2 2a.75.75 0 0 0 1.06 0l3.5-3.5ZM16 8A8 8 0 1 1 0 8a8 8 0 0 1 16 0Zm-1.5 0a6.5 6.5 0 1 0-13 0 6.5 6.5 0 0 0 13 0Z" />
      </svg>
    );
  }
  return (
    <svg className="mt-0.5 h-4 w-4 shrink-0 text-[#1a7f37]" viewBox="0 0 16 16" fill="currentColor">
      <path d="M8 9.5a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3Z" />
      <path d="M8 0a8 8 0 1 1 0 16A8 8 0 0 1 8 0ZM1.5 8a6.5 6.5 0 1 0 13 0 6.5 6.5 0 0 0-13 0Z" />
    </svg>
  );
}

/** GitHub-style PR icon: green for open, purple for merged, red for closed. */
function PRIcon({ state }: { state: string }) {
  const color =
    state === "merged" ? "text-[#8250df]" : state === "closed" ? "text-[#cf222e]" : "text-[#1a7f37]";
  return (
    <svg className={`mt-0.5 h-4 w-4 shrink-0 ${color}`} viewBox="0 0 16 16" fill="currentColor">
      <path d="M1.5 3.25a2.25 2.25 0 1 1 3 2.122v5.256a2.251 2.251 0 1 1-1.5 0V5.372A2.25 2.25 0 0 1 1.5 3.25Zm5.677-.177L9.573.677A.25.25 0 0 1 10 .854V2.5h1A2.5 2.5 0 0 1 13.5 5v5.628a2.251 2.251 0 1 1-1.5 0V5a1 1 0 0 0-1-1h-1v1.646a.25.25 0 0 1-.427.177L7.177 3.427a.25.25 0 0 1 0-.354ZM3.75 2.5a.75.75 0 1 0 0 1.5.75.75 0 0 0 0-1.5Zm0 9.5a.75.75 0 1 0 0 1.5.75.75 0 0 0 0-1.5Zm8.25.75a.75.75 0 1 0 1.5 0 .75.75 0 0 0-1.5 0Z" />
    </svg>
  );
}
