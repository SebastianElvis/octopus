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
    <div className="flex flex-col overflow-hidden rounded-lg border border-gray-200 bg-white dark:border-gray-800 dark:bg-gray-950">
      <div className="flex items-center justify-between border-b border-gray-200 px-4 py-2 dark:border-gray-800">
        <h3 className="text-sm font-medium text-gray-700 dark:text-gray-300">Output</h3>
        <div className="flex rounded-md border border-gray-300 text-xs dark:border-gray-700">
          <button
            onClick={() => setMode("live")}
            className={`px-2.5 py-1 ${
              mode === "live"
                ? "bg-gray-200 text-gray-900 dark:bg-gray-700 dark:text-gray-100"
                : "text-gray-500 hover:text-gray-700 dark:text-gray-500 dark:hover:text-gray-300"
            }`}
          >
            Live
          </button>
          <button
            onClick={() => setMode("full")}
            className={`px-2.5 py-1 ${
              mode === "full"
                ? "bg-gray-200 text-gray-900 dark:bg-gray-700 dark:text-gray-100"
                : "text-gray-500 hover:text-gray-700 dark:text-gray-500 dark:hover:text-gray-300"
            }`}
          >
            Full Log
          </button>
        </div>
      </div>

      <div className="h-64 overflow-y-auto p-3">
        {displayedLines.length === 0 ? (
          <p className="text-xs text-gray-400 dark:text-gray-700">No output yet.</p>
        ) : (
          <div className="space-y-0.5">
            {mode === "live" && lines.length > 20 && (
              <p className="mb-2 text-xs text-gray-400 dark:text-gray-600">
                Showing last 20 lines. Switch to Full Log for complete output.
              </p>
            )}
            {displayedLines.map((line, i) => (
              // React escapes JSX text content — raw HTML is never injected.
              // <pre> preserves whitespace without bypassing React's escaping.
              <pre
                key={i}
                className="whitespace-pre-wrap break-all font-mono text-xs leading-5 text-gray-700 dark:text-gray-300"
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
