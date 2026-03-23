import { useState, useEffect, useMemo } from "react";
import type { GitHubIssue, GitHubPR, Repo } from "../lib/types";
import { fetchIssues, fetchPRs } from "../lib/tauri";
import { formatError } from "../lib/errors";
import { timeAgo } from "../lib/utils";

type FilterTab = "all" | "issues" | "prs";

interface BacklogItem {
  kind: "issue" | "pr";
  repo: Repo;
  issue?: GitHubIssue;
  pr?: GitHubPR;
  number: number;
  title: string;
  labels: string[];
  author: string;
  createdAt: number;
  url: string;
}

interface IssueBacklogProps {
  repos: Repo[];
  onSelectIssue: (repo: Repo, issue: GitHubIssue) => void;
  onSelectPR: (repo: Repo, pr: GitHubPR) => void;
  onNavigateSettings: () => void;
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
                    labels: issue.labels,
                    author: "",
                    createdAt: Date.now(),
                    url: issue.url,
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
                    labels: [],
                    author: "",
                    createdAt: Date.now(),
                    url: pr.url,
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

  const filtered = useMemo(() => {
    let list = items;
    if (filter === "issues") list = list.filter((i) => i.kind === "issue");
    if (filter === "prs") list = list.filter((i) => i.kind === "pr");
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter(
        (i) =>
          i.title.toLowerCase().includes(q) ||
          String(i.number).includes(q) ||
          i.labels.some((l) => l.toLowerCase().includes(q)),
      );
    }
    return list;
  }, [items, filter, search]);

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
          Go to Settings
        </button>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <h2 className="text-base font-semibold text-gray-900 dark:text-gray-100">Issue Backlog</h2>
      </div>

      {/* Search bar */}
      <input
        type="text"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        placeholder="Search issues and PRs..."
        className="w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 placeholder-gray-400 focus:border-blue-600 focus:outline-none dark:border-gray-700 dark:bg-gray-800 dark:text-gray-100 dark:placeholder-gray-600"
      />

      {/* Filter tabs */}
      <div className="flex rounded-md border border-gray-300 text-sm dark:border-gray-700">
        {(
          [
            ["all", `All (${String(items.length)})`],
            ["issues", `Issues (${String(issueCount)})`],
            ["prs", `Pull Requests (${String(prCount)})`],
          ] as [FilterTab, string][]
        ).map(([tab, label]) => (
          <button
            key={tab}
            onClick={() => setFilter(tab)}
            className={`flex-1 py-1.5 text-center ${
              filter === tab
                ? "bg-gray-100 text-gray-900 dark:bg-gray-700 dark:text-gray-100"
                : "text-gray-500 hover:text-gray-700 dark:text-gray-500 dark:hover:text-gray-300"
            }`}
          >
            {label}
          </button>
        ))}
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
          {search ? "No results match your search." : "No open issues or pull requests found."}
        </p>
      )}

      {!loading && filtered.length > 0 && (
        <div className="space-y-2">
          {filtered.map((item) => {
            const repoName = item.repo.githubUrl.split("/").slice(-2).join("/");
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
                className="flex w-full items-center justify-between rounded-lg border border-gray-200 bg-white px-4 py-3 text-left transition-colors hover:border-gray-300 dark:border-gray-800 dark:bg-gray-900 dark:hover:border-gray-700"
              >
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span
                      className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-medium ${
                        item.kind === "issue"
                          ? "bg-green-500/20 text-green-600 ring-1 ring-green-500/30 dark:text-green-400"
                          : "bg-purple-500/20 text-purple-600 ring-1 ring-purple-500/30 dark:text-purple-400"
                      }`}
                    >
                      {item.kind === "issue" ? "Issue" : "PR"}
                    </span>
                    <span className="truncate font-medium text-gray-900 dark:text-gray-100">
                      {item.title}
                    </span>
                  </div>
                  <div className="mt-1 flex items-center gap-2 text-xs text-gray-500 dark:text-gray-500">
                    <span>{repoName}</span>
                    <span className="text-gray-400 dark:text-gray-600">#{String(item.number)}</span>
                    {item.labels.length > 0 && (
                      <div className="flex gap-1">
                        {item.labels.slice(0, 3).map((label) => (
                          <span
                            key={label}
                            className="rounded-full bg-blue-500/20 px-1.5 py-0.5 text-xs text-blue-600 dark:text-blue-400"
                          >
                            {label}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
                <span className="shrink-0 text-xs text-gray-400 dark:text-gray-600">
                  {timeAgo(item.createdAt)}
                </span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
