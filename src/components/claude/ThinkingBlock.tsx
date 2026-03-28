import { useState } from "react";

interface ThinkingBlockProps {
  thinking: string;
  isStreaming?: boolean;
}

export function ThinkingBlock({ thinking, isStreaming }: ThinkingBlockProps) {
  const [expanded, setExpanded] = useState(false);

  const previewLength = 120;
  const hasMore = thinking.length > previewLength;
  const preview = hasMore ? thinking.slice(0, previewLength) + "..." : thinking;

  return (
    <div className="my-1 rounded-md border border-gray-200/60 bg-gray-50/50 dark:border-gray-800/60 dark:bg-gray-900/30">
      <button
        onClick={() => setExpanded((v) => !v)}
        className="flex w-full cursor-pointer items-center gap-2 px-3 py-1.5 text-left text-xs text-gray-400 hover:text-gray-500 dark:text-gray-500 dark:hover:text-gray-400"
      >
        <svg
          className={`h-3 w-3 shrink-0 transition-transform ${expanded ? "rotate-90" : ""}`}
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={2}
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
        </svg>
        <span className="font-medium">Thinking</span>
        {isStreaming && (
          <span className="inline-block h-1.5 w-1.5 animate-pulse rounded-full bg-purple-400" />
        )}
      </button>
      {expanded && (
        <div className="border-t border-gray-200/60 px-3 py-2 dark:border-gray-800/60">
          <pre className="whitespace-pre-wrap font-mono text-xs italic leading-relaxed text-gray-400 dark:text-gray-500">
            {thinking}
          </pre>
        </div>
      )}
      {!expanded && thinking && (
        <div className="px-3 pb-2">
          <p className="truncate font-mono text-xs italic text-gray-400 dark:text-gray-500">
            {preview}
          </p>
        </div>
      )}
    </div>
  );
}
