import { useState, useEffect } from "react";
import { checkPrerequisites } from "../lib/tauri";
import type { PrerequisiteStatus } from "../lib/tauri";

interface PrerequisiteCheckProps {
  onAllPassed?: () => void;
}

const TOOLS = [
  {
    key: "claude" as const,
    name: "Claude CLI",
    installUrl: "https://docs.anthropic.com/en/docs/claude-cli",
    description: "Required to run Claude Code sessions",
  },
  {
    key: "git" as const,
    name: "Git",
    installUrl: "https://git-scm.com/downloads",
    description: "Required for version control and worktrees",
  },
  {
    key: "gh" as const,
    name: "GitHub CLI",
    installUrl: "https://cli.github.com/",
    description: "Required for GitHub integration (issues, PRs)",
  },
];

export function PrerequisiteCheck({ onAllPassed }: PrerequisiteCheckProps) {
  const [status, setStatus] = useState<PrerequisiteStatus | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    void checkPrerequisites()
      .then((s) => {
        setStatus(s);
        if (s.claude && s.git && s.gh) {
          onAllPassed?.();
        }
      })
      .finally(() => setLoading(false));
  }, [onAllPassed]);

  if (loading) {
    return (
      <div className="flex items-center gap-2">
        <span className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-outline-strong border-t-brand" />
        <span className="text-sm text-on-surface-muted">Checking prerequisites...</span>
      </div>
    );
  }

  if (!status) return null;

  return (
    <div className="space-y-3">
      {TOOLS.map((tool) => {
        const available = status[tool.key];
        return (
          <div key={tool.key} className="flex items-start gap-3">
            <span className={`mt-0.5 text-lg ${available ? "text-status-done" : "text-danger"}`}>
              {available ? (
                <svg
                  className="h-5 w-5"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                  strokeWidth={2}
                >
                  <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                </svg>
              ) : (
                <svg
                  className="h-5 w-5"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                  strokeWidth={2}
                >
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              )}
            </span>
            <div>
              <p className="text-sm font-medium text-on-surface">{tool.name}</p>
              <p className="text-xs text-on-surface-muted">{tool.description}</p>
              {!available && (
                <a
                  href={tool.installUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="mt-0.5 inline-block text-xs text-brand hover:underline"
                >
                  Install instructions
                </a>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
