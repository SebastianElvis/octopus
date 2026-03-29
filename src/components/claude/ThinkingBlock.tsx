import { useEffect, useRef, useState } from "react";
import { AnimatedCollapse } from "./AnimatedCollapse";

interface ThinkingBlockProps {
  thinking: string;
  isStreaming?: boolean;
}

export function ThinkingBlock({ thinking, isStreaming }: ThinkingBlockProps) {
  // Expanded by default; user can collapse
  const [expanded, setExpanded] = useState(true);
  const contentRef = useRef<HTMLPreElement>(null);

  // Auto-scroll within the thinking block while streaming
  useEffect(() => {
    if (isStreaming && expanded && contentRef.current) {
      contentRef.current.scrollTop = contentRef.current.scrollHeight;
    }
  }, [thinking, isStreaming, expanded]);

  return (
    <div className="my-1 rounded-sm border border-outline-muted bg-surface-sunken/50">
      <button
        onClick={() => setExpanded((v) => !v)}
        className="flex w-full cursor-pointer items-center gap-2 px-3 py-1.5 text-left text-xs text-on-surface-faint hover:text-on-surface-muted"
      >
        <svg
          className={`h-3 w-3 shrink-0 transition-transform duration-200 ${expanded ? "rotate-90" : ""}`}
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={2}
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
        </svg>
        <span className="font-medium">Thinking</span>
        {isStreaming && (
          <span className="inline-block h-1.5 w-1.5 shrink-0 animate-pulse rounded-full bg-purple-400" />
        )}
      </button>
      <AnimatedCollapse expanded={expanded}>
        <div className="border-t border-outline-muted px-3 py-2">
          <pre
            ref={contentRef}
            className="max-h-60 overflow-auto whitespace-pre-wrap font-mono text-xs italic leading-relaxed text-on-surface-faint"
          >
            {thinking}
            {isStreaming && (
              <span className="inline-block h-3 w-0.5 animate-pulse bg-purple-400 align-text-bottom" />
            )}
          </pre>
        </div>
      </AnimatedCollapse>
    </div>
  );
}
