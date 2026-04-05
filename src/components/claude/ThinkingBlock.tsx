import { useEffect, useRef } from "react";
import { TypingIndicator } from "./TypingIndicator";

interface ThinkingBlockProps {
  thinking: string;
  isStreaming?: boolean;
}

export function ThinkingBlock({ thinking, isStreaming }: ThinkingBlockProps) {
  const contentRef = useRef<HTMLPreElement>(null);

  // Auto-scroll within the thinking block while streaming
  useEffect(() => {
    if (isStreaming && contentRef.current) {
      contentRef.current.scrollTop = contentRef.current.scrollHeight;
    }
  }, [thinking, isStreaming]);

  return (
    <div className="my-1 rounded-sm border border-outline-muted bg-surface-sunken/50">
      <div className="flex items-center gap-2 px-3 py-1.5 text-xs text-on-surface-faint">
        <span className="font-medium">Thinking</span>
        {isStreaming && (
          <span className="inline-block h-1.5 w-1.5 shrink-0 animate-pulse rounded-full bg-purple-400" />
        )}
      </div>
      <div className="border-t border-outline-muted px-3 py-2">
        <pre
          ref={contentRef}
          className="max-h-[60vh] overflow-auto whitespace-pre-wrap font-mono text-xs italic leading-relaxed text-on-surface-faint"
        >
          {thinking}
          {isStreaming && <TypingIndicator color="purple" className="ml-0.5 align-text-bottom" />}
        </pre>
      </div>
    </div>
  );
}
