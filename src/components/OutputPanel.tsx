import { useEffect, useMemo, useRef, useState } from "react";
import { useSessionStore } from "../stores/sessionStore";

interface OutputPanelProps {
  sessionId: string;
}

export function OutputPanel({ sessionId }: OutputPanelProps) {
  const outputBuffers = useSessionStore((s) => s.outputBuffers);
  const lines = useMemo(() => outputBuffers[sessionId] ?? [], [outputBuffers, sessionId]);
  const [mode, setMode] = useState<"live" | "full">("live");
  const bottomRef = useRef<HTMLDivElement>(null);

  const displayedLines = mode === "live" ? lines.slice(-20) : lines;

  useEffect(() => {
    if (mode === "live") {
      bottomRef.current?.scrollIntoView({ behavior: "smooth" });
    }
  }, [lines, mode]);

  return (
    <div className="flex h-full flex-col overflow-hidden bg-surface">
      <div className="flex shrink-0 items-center justify-between border-b border-outline px-3 py-1.5">
        <h3 className="text-xs font-semibold text-on-surface">Output</h3>
        <div className="flex rounded-sm border border-outline text-xs">
          <button
            onClick={() => setMode("live")}
            className={`px-2.5 py-1 ${
              mode === "live"
                ? "bg-active text-on-surface"
                : "text-on-surface-muted hover:text-on-surface"
            }`}
          >
            Live
          </button>
          <button
            onClick={() => setMode("full")}
            className={`px-2.5 py-1 ${
              mode === "full"
                ? "bg-active text-on-surface"
                : "text-on-surface-muted hover:text-on-surface"
            }`}
          >
            Full Log
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-2">
        {displayedLines.length === 0 ? (
          <p className="text-xs text-on-surface-faint">No output yet.</p>
        ) : (
          <div className="space-y-0">
            {mode === "live" && lines.length > 20 && (
              <p className="mb-2 text-xs text-on-surface-faint">
                Showing last 20 lines. Switch to Full Log for complete output.
              </p>
            )}
            {displayedLines.map((line, i) => (
              // React escapes JSX text content — raw HTML is never injected.
              // <pre> preserves whitespace without bypassing React's escaping.
              <pre
                key={i}
                className="whitespace-pre-wrap break-all font-mono text-xs leading-5 text-on-surface"
              >
                {line}
              </pre>
            ))}
          </div>
        )}
        <div ref={bottomRef} />
      </div>
    </div>
  );
}
