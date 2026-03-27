import { useState, useEffect, useMemo, useCallback, useRef } from "react";
import { useSessionStore } from "../stores/sessionStore";
import { timeAgo } from "../lib/utils";
import { STATUS_DOT, STATUS_PILL, RUNNING_PULSE } from "../lib/statusColors";

interface CommandPaletteProps {
  open: boolean;
  onClose: () => void;
  onSelectSession: (id: string) => void;
}

export function CommandPalette({ open, onClose, onSelectSession }: CommandPaletteProps) {
  if (!open) return null;

  // Inner component remounts each time the palette opens, naturally resetting state
  return <CommandPaletteInner onClose={onClose} onSelectSession={onSelectSession} />;
}

function CommandPaletteInner({
  onClose,
  onSelectSession,
}: {
  onClose: () => void;
  onSelectSession: (id: string) => void;
}) {
  const sessions = useSessionStore((s) => s.sessions);
  const [query, setQuery] = useState("");
  const [selectedIndex, setSelectedIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  const filtered = useMemo(() => {
    if (!query.trim()) return sessions;
    const q = query.toLowerCase();
    return sessions.filter(
      (s) =>
        s.name.toLowerCase().includes(q) ||
        s.repo.toLowerCase().includes(q) ||
        s.branch.toLowerCase().includes(q) ||
        s.status.toLowerCase().includes(q),
    );
  }, [sessions, query]);

  // Focus input on mount
  useEffect(() => {
    requestAnimationFrame(() => inputRef.current?.focus());
  }, []);

  // Scroll selected item into view
  useEffect(() => {
    if (!listRef.current) return;
    const item = listRef.current.children[selectedIndex] as HTMLElement | undefined;
    item?.scrollIntoView({ block: "nearest" });
  }, [selectedIndex]);

  const handleSelect = useCallback(
    (id: string) => {
      onSelectSession(id);
      onClose();
    },
    [onSelectSession, onClose],
  );

  const handleQueryChange = useCallback((value: string) => {
    setQuery(value);
    setSelectedIndex(0);
  }, []);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      switch (e.key) {
        case "ArrowDown":
          e.preventDefault();
          setSelectedIndex((i) => Math.min(i + 1, filtered.length - 1));
          break;
        case "ArrowUp":
          e.preventDefault();
          setSelectedIndex((i) => Math.max(i - 1, 0));
          break;
        case "Enter":
          e.preventDefault();
          if (filtered[selectedIndex]) {
            handleSelect(filtered[selectedIndex].id);
          }
          break;
        case "Escape":
          e.preventDefault();
          onClose();
          break;
      }
    },
    [filtered, selectedIndex, handleSelect, onClose],
  );

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center bg-black/60 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        data-testid="command-palette"
        className="mt-[15vh] w-full max-w-lg overflow-hidden rounded-xl border border-gray-200 bg-white shadow-2xl dark:border-gray-800 dark:bg-gray-950"
        onClick={(e) => e.stopPropagation()}
        onKeyDown={handleKeyDown}
      >
        {/* Search input */}
        <div className="flex items-center gap-3 border-b border-gray-200 px-4 dark:border-gray-800">
          <svg
            className="h-4 w-4 shrink-0 text-gray-400 dark:text-gray-500"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={2}
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
            />
          </svg>
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => handleQueryChange(e.target.value)}
            placeholder="Search sessions..."
            className="h-12 flex-1 bg-transparent text-sm text-gray-900 placeholder-gray-400 outline-none dark:text-gray-100 dark:placeholder-gray-500"
          />
          <kbd className="hidden rounded border border-gray-300 px-1.5 py-0.5 text-xs text-gray-400 sm:inline-block dark:border-gray-700 dark:text-gray-500">
            esc
          </kbd>
        </div>

        {/* Results */}
        <div ref={listRef} className="max-h-80 overflow-y-auto py-2">
          {filtered.length === 0 && (
            <div className="px-4 py-8 text-center text-sm text-gray-400 dark:text-gray-500">
              No sessions found
            </div>
          )}
          {filtered.map((session, index) => (
            <button
              key={session.id}
              onClick={() => handleSelect(session.id)}
              onMouseEnter={() => setSelectedIndex(index)}
              className={`flex w-full items-center gap-3 px-4 py-2.5 text-left transition-colors ${
                index === selectedIndex
                  ? "bg-gray-100 dark:bg-gray-800/80"
                  : "hover:bg-gray-50 dark:hover:bg-gray-900"
              }`}
            >
              {/* Status dot */}
              <span
                className={`h-2 w-2 shrink-0 rounded-full ${STATUS_DOT[session.status] ?? "bg-gray-500"} ${session.status === "running" ? RUNNING_PULSE : ""}`}
              />

              {/* Session info */}
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className="truncate text-sm font-medium text-gray-900 dark:text-gray-100">
                    {session.name}
                  </span>
                  <span
                    className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-medium transition-colors duration-300 ${STATUS_PILL[session.status] ?? ""}`}
                  >
                    {session.status}
                  </span>
                </div>
                <p className="mt-0.5 truncate text-xs text-gray-500 dark:text-gray-400">
                  {session.repo}
                  {session.branch && (
                    <span className="ml-1 text-gray-400 dark:text-gray-500">
                      · {session.branch}
                    </span>
                  )}
                </p>
              </div>

              {/* Time ago */}
              <span className="shrink-0 text-xs text-gray-400 dark:text-gray-500">
                {timeAgo(session.stateChangedAt)}
              </span>
            </button>
          ))}
        </div>

        {/* Footer hint */}
        {filtered.length > 0 && (
          <div className="flex items-center gap-3 border-t border-gray-200 px-4 py-2 dark:border-gray-800">
            <span className="flex items-center gap-1 text-xs text-gray-400 dark:text-gray-500">
              <kbd className="rounded border border-gray-300 px-1 py-0.5 text-xs dark:border-gray-700">
                &uarr;
              </kbd>
              <kbd className="rounded border border-gray-300 px-1 py-0.5 text-xs dark:border-gray-700">
                &darr;
              </kbd>
              navigate
            </span>
            <span className="flex items-center gap-1 text-xs text-gray-400 dark:text-gray-500">
              <kbd className="rounded border border-gray-300 px-1 py-0.5 text-xs dark:border-gray-700">
                &crarr;
              </kbd>
              select
            </span>
          </div>
        )}
      </div>
    </div>
  );
}
