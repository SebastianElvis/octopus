import { useState, useEffect, useMemo, useCallback, useRef } from "react";
import { useSessionStore } from "../stores/sessionStore";
import { timeAgo } from "../lib/utils";

const STATUS_DOT: Record<string, string> = {
  waiting: "bg-red-500",
  running: "bg-green-500",
  idle: "bg-gray-500",
  done: "bg-gray-600",
  completed: "bg-green-600",
  failed: "bg-red-600",
  paused: "bg-gray-400",
  stuck: "bg-orange-500",
  interrupted: "bg-yellow-500",
  killed: "bg-red-700",
};

const STATUS_PILL: Record<string, string> = {
  waiting: "bg-red-500/20 text-red-600 dark:text-red-400",
  running: "bg-green-500/20 text-green-600 dark:text-green-400",
  idle: "bg-gray-500/20 text-gray-500 dark:text-gray-400",
  done: "bg-gray-200/60 text-gray-500 dark:bg-gray-700/40 dark:text-gray-500",
  completed: "bg-green-200/60 text-green-600 dark:bg-green-900/30 dark:text-green-400",
  failed: "bg-red-200/60 text-red-600 dark:bg-red-900/30 dark:text-red-400",
  paused: "bg-gray-400/20 text-gray-500 dark:text-gray-400",
  stuck: "bg-orange-500/20 text-orange-600 dark:text-orange-400",
  interrupted: "bg-yellow-500/20 text-yellow-600 dark:text-yellow-400",
  killed: "bg-red-200/60 text-red-700 dark:bg-red-900/30 dark:text-red-400",
};

interface CommandPaletteProps {
  open: boolean;
  onClose: () => void;
  onSelectSession: (id: string) => void;
}

export function CommandPalette({ open, onClose, onSelectSession }: CommandPaletteProps) {
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

  // Reset selection when query or filtered results change
  useEffect(() => {
    setSelectedIndex(0);
  }, [query, filtered.length]);

  // Focus input when opened, reset state
  useEffect(() => {
    if (open) {
      setQuery("");
      setSelectedIndex(0);
      // Delay focus to ensure the element is rendered
      requestAnimationFrame(() => inputRef.current?.focus());
    }
  }, [open]);

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

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center bg-black/60 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
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
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search sessions..."
            className="h-12 flex-1 bg-transparent text-sm text-gray-900 placeholder-gray-400 outline-none dark:text-gray-100 dark:placeholder-gray-600"
          />
          <kbd className="hidden rounded border border-gray-300 px-1.5 py-0.5 text-xs text-gray-400 sm:inline-block dark:border-gray-700 dark:text-gray-600">
            esc
          </kbd>
        </div>

        {/* Results */}
        <div ref={listRef} className="max-h-80 overflow-y-auto py-2">
          {filtered.length === 0 && (
            <div className="px-4 py-8 text-center text-sm text-gray-400 dark:text-gray-600">
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
                className={`h-2 w-2 shrink-0 rounded-full ${STATUS_DOT[session.status] ?? "bg-gray-500"}`}
              />

              {/* Session info */}
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className="truncate text-sm font-medium text-gray-900 dark:text-gray-100">
                    {session.name}
                  </span>
                  <span
                    className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_PILL[session.status] ?? ""}`}
                  >
                    {session.status}
                  </span>
                </div>
                <p className="mt-0.5 truncate text-xs text-gray-500 dark:text-gray-500">
                  {session.repo}
                  {session.branch && (
                    <span className="ml-1 text-gray-400 dark:text-gray-600">
                      · {session.branch}
                    </span>
                  )}
                </p>
              </div>

              {/* Time ago */}
              <span className="shrink-0 text-xs text-gray-400 dark:text-gray-600">
                {timeAgo(session.stateChangedAt)}
              </span>
            </button>
          ))}
        </div>

        {/* Footer hint */}
        {filtered.length > 0 && (
          <div className="flex items-center gap-3 border-t border-gray-200 px-4 py-2 dark:border-gray-800">
            <span className="flex items-center gap-1 text-xs text-gray-400 dark:text-gray-600">
              <kbd className="rounded border border-gray-300 px-1 py-0.5 text-xs dark:border-gray-700">
                &uarr;
              </kbd>
              <kbd className="rounded border border-gray-300 px-1 py-0.5 text-xs dark:border-gray-700">
                &darr;
              </kbd>
              navigate
            </span>
            <span className="flex items-center gap-1 text-xs text-gray-400 dark:text-gray-600">
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
