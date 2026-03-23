import type { GitHubIssue, GitHubPR } from "../lib/types";

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

  const url = item.htmlUrl;

  return (
    <div className="h-full bg-white dark:bg-gray-950">
      <iframe
        src={url}
        className="h-full w-full border-0"
        title={item.title}
        sandbox="allow-same-origin allow-scripts allow-popups allow-forms"
      />
    </div>
  );
}
