import { useState, useEffect, useMemo } from "react";
import type { Repo, GitHubIssue, GitHubPR } from "../lib/types";
import { fetchIssues, fetchPRs, spawnSession } from "../lib/tauri";
import { useSessionStore } from "../stores/sessionStore";
import { formatError } from "../lib/errors";

interface NewSessionModalProps {
  repos: Repo[];
  onClose: () => void;
  onCreated?: (sessionId: string) => void;
  prefillRepo?: Repo;
  prefillIssue?: GitHubIssue;
  prefillPR?: GitHubPR;
}

type LinkedItem = { kind: "issue"; issue: GitHubIssue } | { kind: "pr"; pr: GitHubPR };

type CreationStep = "idle" | "worktree" | "spawning" | "done";

function generatePrompt(kind: "issue" | "pr", url: string, body?: string): string {
  const bodyNote = body ? `\n\nIssue body:\n${body}` : "";
  if (kind === "issue") {
    return `Read ${url} , understand the requirements, and resolve the issue.${bodyNote}`;
  }
  return `Read ${url} , review the changes, and address any feedback or requested changes.`;
}

export function NewSessionModal({
  repos,
  onClose,
  onCreated,
  prefillRepo,
  prefillIssue,
  prefillPR,
}: NewSessionModalProps) {
  const addSession = useSessionStore((s) => s.addSession);

  const [repoId, setRepoId] = useState(prefillRepo?.id ?? (repos.length > 0 ? repos[0].id : ""));
  const [query, setQuery] = useState("");
  const [prompt, setPrompt] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [creationStep, setCreationStep] = useState<CreationStep>("idle");
  const [error, setError] = useState<string | null>(null);
  const [worktreeConflict, setWorktreeConflict] = useState(false);
  const [dangerouslySkipPermissions, setDangerouslySkipPermissions] = useState(false);

  const [issues, setIssues] = useState<GitHubIssue[]>([]);
  const [prs, setPrs] = useState<GitHubPR[]>([]);
  const [loadingItems, setLoadingItems] = useState(false);
  const [linked, setLinked] = useState<LinkedItem | null>(null);
  const [showDropdown, setShowDropdown] = useState(false);

  // Fetch issues + PRs when repo changes
  useEffect(() => {
    if (!repoId) return;
    setLoadingItems(true);
    void Promise.all([
      fetchIssues(repoId).catch(() => [] as GitHubIssue[]),
      fetchPRs(repoId).catch(() => [] as GitHubPR[]),
    ]).then(([fetchedIssues, fetchedPrs]) => {
      setIssues(fetchedIssues);
      setPrs(fetchedPrs);
      setLoadingItems(false);
    });
  }, [repoId]);

  // Prefill from props
  useEffect(() => {
    if (prefillIssue) {
      setLinked({ kind: "issue", issue: prefillIssue });
      setPrompt(generatePrompt("issue", prefillIssue.htmlUrl, prefillIssue.body));
      setQuery(`#${prefillIssue.number}`);
    }
    if (prefillPR) {
      setLinked({ kind: "pr", pr: prefillPR });
      setPrompt(generatePrompt("pr", prefillPR.htmlUrl));
      setQuery(`#${prefillPR.number}`);
    }
  }, [prefillIssue, prefillPR]);

  // Auto-detect from query input
  function handleQueryChange(val: string) {
    setQuery(val);
    setShowDropdown(true);

    // Try to parse a number from URL or #number
    const num = parseNumber(val);
    if (num) {
      const foundIssue = issues.find((i) => i.number === num);
      const foundPR = prs.find((p) => p.number === num);
      if (val.includes("/pull/") && foundPR) {
        selectPR(foundPR);
        return;
      }
      if (val.includes("/issues/") && foundIssue) {
        selectIssue(foundIssue);
        return;
      }
      // If just a number, try issue first then PR
      if (foundIssue) {
        selectIssue(foundIssue);
        return;
      }
      if (foundPR) {
        selectPR(foundPR);
        return;
      }
    }
    // No match — clear linked item if user is actively typing
    if (linked) {
      const linkedNum = linked.kind === "issue" ? linked.issue.number : linked.pr.number;
      if (num !== linkedNum) {
        setLinked(null);
      }
    }
  }

  function selectIssue(issue: GitHubIssue) {
    setLinked({ kind: "issue", issue });
    if (!prompt) {
      setPrompt(generatePrompt("issue", issue.htmlUrl, issue.body));
    }
    setShowDropdown(false);
  }

  function selectPR(pr: GitHubPR) {
    setLinked({ kind: "pr", pr });
    if (!prompt) {
      setPrompt(generatePrompt("pr", pr.htmlUrl));
    }
    setShowDropdown(false);
  }

  function clearLinked() {
    setLinked(null);
    setQuery("");
    setPrompt("");
  }

  // Filter dropdown items by query
  const filteredItems = useMemo(() => {
    const q = query.toLowerCase().replace(/^#/, "");
    const items: {
      kind: "issue" | "pr";
      number: number;
      title: string;
      state: string;
      item: GitHubIssue | GitHubPR;
    }[] = [];

    for (const issue of issues) {
      if (issue.state !== "open") continue;
      items.push({
        kind: "issue",
        number: issue.number,
        title: issue.title,
        state: issue.state,
        item: issue,
      });
    }
    for (const pr of prs) {
      if (pr.state !== "open") continue;
      items.push({ kind: "pr", number: pr.number, title: pr.title, state: pr.state, item: pr });
    }

    if (!q) return items;

    return items.filter((i) => String(i.number).includes(q) || i.title.toLowerCase().includes(q));
  }, [query, issues, prs]);

  function parseNumber(val: string): number | undefined {
    // Match #123 or .../issues/123 or .../pull/123 or just 123
    const match = val.match(/(?:issues|pull)\/(\d+)|#(\d+)|^(\d+)$/);
    if (!match) return undefined;
    // The matched digit string is in one of the capture groups
    const numStr = match[1] || match[2] || match[3];
    return parseInt(numStr, 10);
  }

  function deriveBranchName(): string {
    if (linked?.kind === "issue") {
      const slug = linked.issue.title
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .slice(0, 40);
      return `issue-${linked.issue.number}-${slug}`;
    }
    if (linked?.kind === "pr") {
      return linked.pr.headRef || `pr-${linked.pr.number}`;
    }
    return `session-${Date.now()}`;
  }

  function deriveSessionName(): string {
    if (linked?.kind === "issue") return linked.issue.title.slice(0, 60);
    if (linked?.kind === "pr") return linked.pr.title.slice(0, 60);
    return prompt.trim().slice(0, 60) || `session-${Date.now()}`;
  }

  const branchPreview = deriveBranchName();
  const canSubmit = prompt.trim().length > 0 && repos.length > 0 && !submitting;

  async function handleSubmit(force = false) {
    if (!repoId || !prompt.trim()) {
      setError("Please select a repository and provide a prompt.");
      return;
    }
    setSubmitting(true);
    setError(null);
    setWorktreeConflict(false);
    setCreationStep("worktree");
    try {
      setCreationStep("spawning");
      const session = await spawnSession({
        repoId,
        branch: deriveBranchName(),
        prompt: prompt.trim(),
        name: deriveSessionName(),
        issueNumber: linked?.kind === "issue" ? linked.issue.number : undefined,
        prNumber: linked?.kind === "pr" ? linked.pr.number : undefined,
        force,
        dangerouslySkipPermissions: dangerouslySkipPermissions || undefined,
      });
      addSession(session);
      setCreationStep("done");
      // Close immediately and let the toast handle notification
      onClose();
      onCreated?.(session.id);
    } catch (err: unknown) {
      setCreationStep("idle");
      const msg = formatError(err);
      if (msg.includes("WORKTREE_CONFLICT:")) {
        setError(msg.replace("WORKTREE_CONFLICT: ", ""));
        setWorktreeConflict(true);
      } else {
        setError(msg);
      }
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div
        data-testid="new-session-modal"
        className="w-full max-w-lg rounded-xl border border-gray-200 bg-white p-6 shadow-2xl dark:border-gray-800 dark:bg-gray-900"
      >
        <div className="mb-5 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">New Session</h2>
          <button
            onClick={onClose}
            className="cursor-pointer text-gray-400 hover:text-gray-600 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-1 dark:text-gray-500 dark:hover:text-gray-300"
          >
            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M6 18L18 6M6 6l12 12"
              />
            </svg>
          </button>
        </div>

        {/* Progress steps */}
        {creationStep !== "idle" && creationStep !== "done" && (
          <div className="mb-4 flex items-center gap-2">
            <StepIndicator
              active={creationStep === "worktree"}
              done={creationStep === "spawning"}
              label="Creating worktree"
            />
            <div className="h-px flex-1 bg-gray-200 dark:bg-gray-700" />
            <StepIndicator
              active={creationStep === "spawning"}
              done={false}
              label="Spawning session"
            />
          </div>
        )}

        <div className="space-y-4">
          {/* Repo selector */}
          <div>
            <label className="mb-1 block text-xs font-medium text-gray-500 dark:text-gray-400">
              Repository
            </label>
            {repos.length === 0 ? (
              <p className="text-xs text-gray-400 dark:text-gray-500">No repositories added yet.</p>
            ) : (
              <select
                value={repoId}
                onChange={(e) => {
                  setRepoId(e.target.value);
                  setLinked(null);
                  setQuery("");
                }}
                className="w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 focus:border-blue-600 focus:outline-none dark:border-gray-700 dark:bg-gray-800 dark:text-gray-100"
              >
                {repos.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.githubUrl}
                  </option>
                ))}
              </select>
            )}
          </div>

          {/* Unified source input */}
          <div className="relative">
            <label className="mb-1 block text-xs font-medium text-gray-500 dark:text-gray-400">
              Link Issue or PR <span className="text-gray-400 dark:text-gray-500">(optional)</span>
            </label>

            {/* Show linked item card */}
            {linked ? (
              <div className="rounded-md border border-gray-200 bg-gray-50 p-3 dark:border-gray-700 dark:bg-gray-800">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span
                        className={`shrink-0 rounded px-1.5 py-0.5 text-xs font-medium ${
                          linked.kind === "issue"
                            ? "bg-green-500/20 text-green-700 dark:text-green-400"
                            : "bg-purple-500/20 text-purple-700 dark:text-purple-400"
                        }`}
                      >
                        {linked.kind === "issue" ? "Issue" : "PR"}
                      </span>
                      <span className="text-xs text-gray-400 dark:text-gray-500">
                        #{linked.kind === "issue" ? linked.issue.number : linked.pr.number}
                      </span>
                    </div>
                    <p className="mt-1 text-sm font-medium text-gray-900 dark:text-gray-100">
                      {linked.kind === "issue" ? linked.issue.title : linked.pr.title}
                    </p>
                    {linked.kind === "issue" && linked.issue.labels.length > 0 && (
                      <div className="mt-1.5 flex flex-wrap gap-1">
                        {linked.issue.labels.map((label) => (
                          <span
                            key={label.name}
                            className="rounded-full px-1.5 py-0.5 text-xs"
                            style={{
                              backgroundColor: `#${label.color}20`,
                              color: `#${label.color}`,
                              border: `1px solid #${label.color}40`,
                            }}
                          >
                            {label.name}
                          </span>
                        ))}
                      </div>
                    )}
                    {linked.kind === "pr" && (
                      <p className="mt-1 text-xs text-gray-500 dark:text-gray-500">
                        {linked.pr.headRef} &rarr; {linked.pr.baseRef}
                      </p>
                    )}
                  </div>
                  <button
                    onClick={clearLinked}
                    className="shrink-0 cursor-pointer rounded p-0.5 text-gray-400 hover:bg-gray-200 hover:text-gray-600 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-1 dark:text-gray-500 dark:hover:bg-gray-700 dark:hover:text-gray-400"
                    title="Remove"
                  >
                    <svg
                      className="h-4 w-4"
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                      strokeWidth={2}
                    >
                      <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                </div>
              </div>
            ) : (
              <>
                <input
                  type="text"
                  value={query}
                  onChange={(e) => handleQueryChange(e.target.value)}
                  onFocus={() => setShowDropdown(true)}
                  onBlur={() => {
                    // Delay to allow dropdown click to register
                    setTimeout(() => setShowDropdown(false), 200);
                  }}
                  placeholder="Paste URL, type #number, or search..."
                  className="w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 placeholder-gray-400 focus:border-blue-600 focus:outline-none dark:border-gray-700 dark:bg-gray-800 dark:text-gray-100 dark:placeholder-gray-500"
                />

                {/* Dropdown */}
                {showDropdown && (
                  <div className="absolute left-0 right-0 z-10 mt-1 max-h-48 overflow-y-auto rounded-md border border-gray-200 bg-white shadow-lg dark:border-gray-700 dark:bg-gray-800">
                    {loadingItems && (
                      <div className="px-3 py-2 text-xs text-gray-400 dark:text-gray-500">
                        Loading...
                      </div>
                    )}
                    {!loadingItems && filteredItems.length === 0 && (
                      <div className="px-3 py-2 text-xs text-gray-400 dark:text-gray-500">
                        {query ? "No matches" : "No open issues or PRs"}
                      </div>
                    )}
                    {filteredItems.map((item) => (
                      <button
                        key={`${item.kind}-${item.number}`}
                        onMouseDown={(e) => e.preventDefault()}
                        onClick={() => {
                          if (item.kind === "issue") {
                            selectIssue(item.item as GitHubIssue);
                          } else {
                            selectPR(item.item as GitHubPR);
                          }
                          setQuery(`#${item.number}`);
                        }}
                        className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-sm hover:bg-gray-100 dark:hover:bg-gray-700"
                      >
                        <span
                          className={`shrink-0 rounded px-1 py-0.5 text-xs font-medium ${
                            item.kind === "issue"
                              ? "bg-green-500/20 text-green-700 dark:text-green-400"
                              : "bg-purple-500/20 text-purple-700 dark:text-purple-400"
                          }`}
                        >
                          {item.kind === "issue" ? "I" : "PR"}
                        </span>
                        <span className="text-xs text-gray-400 dark:text-gray-500">
                          #{item.number}
                        </span>
                        <span className="truncate text-gray-700 dark:text-gray-300">
                          {item.title}
                        </span>
                      </button>
                    ))}
                  </div>
                )}
              </>
            )}
          </div>

          {/* Prompt */}
          <div>
            <label className="mb-1 block text-xs font-medium text-gray-500 dark:text-gray-400">
              Prompt
            </label>
            <textarea
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              placeholder="Describe the task for Claude..."
              rows={4}
              className="w-full resize-none rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 placeholder-gray-400 focus:border-blue-600 focus:outline-none dark:border-gray-700 dark:bg-gray-800 dark:text-gray-100 dark:placeholder-gray-500"
            />
            {/* Branch name preview */}
            <p className="mt-1 text-xs text-gray-400 dark:text-gray-500">
              Branch:{" "}
              <code className="rounded bg-gray-100 px-1 py-0.5 font-mono dark:bg-gray-800">
                {branchPreview}
              </code>
            </p>
          </div>

          {/* Skip permissions */}
          <label className="flex cursor-pointer items-center gap-2">
            <input
              type="checkbox"
              checked={dangerouslySkipPermissions}
              onChange={(e) => setDangerouslySkipPermissions(e.target.checked)}
              className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500 dark:border-gray-600 dark:bg-gray-800"
            />
            <span className="text-sm text-gray-700 dark:text-gray-300">
              Dangerously skip permissions
            </span>
          </label>
        </div>

        {error && (
          <div className="mt-3">
            <p className="text-xs text-red-600 dark:text-red-400">{error}</p>
            {worktreeConflict && (
              <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                The existing worktree will be removed and a new one created.
              </p>
            )}
          </div>
        )}

        <div className="mt-5 flex justify-end gap-3">
          <button
            onClick={onClose}
            className="cursor-pointer rounded-md border border-gray-300 px-4 py-2 text-sm font-medium text-gray-600 hover:border-gray-400 hover:text-gray-900 active:bg-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-1 dark:border-gray-700 dark:text-gray-300 dark:hover:border-gray-600 dark:hover:text-gray-100 dark:active:bg-gray-800"
          >
            Cancel
          </button>
          {worktreeConflict ? (
            <button
              onClick={() => {
                void handleSubmit(true);
              }}
              disabled={submitting}
              className="cursor-pointer rounded-md bg-orange-600 px-4 py-2 text-sm font-medium text-white hover:bg-orange-500 active:bg-orange-700 focus:outline-none focus:ring-2 focus:ring-orange-500 focus:ring-offset-1 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {submitting ? "Replacing..." : "Replace & Create"}
            </button>
          ) : (
            <button
              onClick={() => {
                void handleSubmit();
              }}
              disabled={!canSubmit}
              className="cursor-pointer rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-500 active:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-1 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {submitting ? "Creating..." : "Create Session"}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

function StepIndicator({ active, done, label }: { active: boolean; done: boolean; label: string }) {
  return (
    <div className="flex items-center gap-1.5">
      <span
        className={`h-2 w-2 rounded-full ${
          done
            ? "bg-green-500"
            : active
              ? "animate-pulse bg-blue-500"
              : "bg-gray-300 dark:bg-gray-600"
        }`}
      />
      <span
        className={`text-xs ${
          active || done
            ? "font-medium text-gray-700 dark:text-gray-300"
            : "text-gray-400 dark:text-gray-500"
        }`}
      >
        {label}
      </span>
    </div>
  );
}
