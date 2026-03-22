import { useState, useEffect } from "react";
import type { DiffFile } from "../lib/types";
import { parseDiff } from "../lib/utils";
import { getDiff, gitCommitAndPush } from "../lib/tauri";
import { formatError } from "../lib/errors";

interface DiffPanelProps {
  worktreePath?: string;
}

export function DiffPanel({ worktreePath }: DiffPanelProps) {
  const [files, setFiles] = useState<DiffFile[]>([]);
  const [commitMessage, setCommitMessage] = useState("");
  const [loading, setLoading] = useState(false);
  const [pushing, setPushing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [expandedFiles, setExpandedFiles] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (!worktreePath) return;
    setLoading(true);
    getDiff(worktreePath)
      .then((raw) => {
        const parsed = parseDiff(raw);
        setFiles(parsed);
        setExpandedFiles(new Set(parsed.map((f) => f.newPath)));
      })
      .catch((err: unknown) => {
        setError(formatError(err));
      })
      .finally(() => setLoading(false));
  }, [worktreePath]);

  function toggleFile(path: string) {
    setExpandedFiles((prev) => {
      const next = new Set(prev);
      if (next.has(path)) {
        next.delete(path);
      } else {
        next.add(path);
      }
      return next;
    });
  }

  async function handleCommit() {
    if (!worktreePath || !commitMessage.trim()) return;
    setPushing(true);
    setError(null);
    try {
      await gitCommitAndPush({ worktreePath, message: commitMessage });
      setCommitMessage("");
    } catch (err: unknown) {
      setError(formatError(err));
    } finally {
      setPushing(false);
    }
  }

  if (!worktreePath) {
    return (
      <div className="flex h-32 items-center justify-center rounded-lg border border-gray-800 bg-gray-900">
        <p className="text-sm text-gray-600">No worktree attached to this session.</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-0 overflow-hidden rounded-lg border border-gray-800 bg-gray-900">
      <div className="flex items-center justify-between border-b border-gray-800 px-4 py-2">
        <h3 className="text-sm font-medium text-gray-300">Diff</h3>
        {!loading && (
          <span className="text-xs text-gray-600">
            {files.length} file{files.length !== 1 ? "s" : ""} changed
          </span>
        )}
      </div>

      <div className="max-h-96 overflow-y-auto">
        {loading && (
          <div className="flex h-24 items-center justify-center">
            <span className="text-sm text-gray-600">Loading diff…</span>
          </div>
        )}

        {!loading && files.length === 0 && (
          <div className="flex h-24 items-center justify-center">
            <span className="text-sm text-gray-600">No changes.</span>
          </div>
        )}

        {!loading &&
          files.map((file) => (
            <div key={file.newPath} className="border-b border-gray-800 last:border-0">
              <button
                onClick={() => toggleFile(file.newPath)}
                className="flex w-full items-center justify-between px-4 py-2 text-left hover:bg-gray-800/50"
              >
                <span className="font-mono text-xs text-gray-300">
                  {file.oldPath !== file.newPath
                    ? `${file.oldPath} → ${file.newPath}`
                    : file.newPath}
                </span>
                <div className="flex items-center gap-2">
                  <span className="text-xs font-medium text-green-500">+{file.additions}</span>
                  <span className="text-xs font-medium text-red-500">-{file.deletions}</span>
                  <svg
                    className={`h-3 w-3 text-gray-600 transition-transform ${
                      expandedFiles.has(file.newPath) ? "rotate-180" : ""
                    }`}
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M19 9l-7 7-7-7"
                    />
                  </svg>
                </div>
              </button>

              {expandedFiles.has(file.newPath) && (
                <div className="overflow-x-auto bg-gray-950">
                  <table className="w-full border-collapse font-mono text-xs">
                    <tbody>
                      {file.lines.map((line, i) => {
                        if (line.type === "header") {
                          return (
                            <tr key={i} className="bg-blue-950/30">
                              <td colSpan={3} className="px-4 py-0.5 text-blue-400">
                                {line.content}
                              </td>
                            </tr>
                          );
                        }
                        const rowBg =
                          line.type === "add"
                            ? "bg-green-950/40"
                            : line.type === "remove"
                              ? "bg-red-950/40"
                              : "";
                        const textColor =
                          line.type === "add"
                            ? "text-green-300"
                            : line.type === "remove"
                              ? "text-red-300"
                              : "text-gray-400";
                        const prefix =
                          line.type === "add" ? "+" : line.type === "remove" ? "-" : " ";
                        return (
                          <tr key={i} className={rowBg}>
                            <td className="w-10 select-none px-2 py-0.5 text-right text-gray-700">
                              {line.oldLineNo ?? ""}
                            </td>
                            <td className="w-10 select-none px-2 py-0.5 text-right text-gray-700">
                              {line.newLineNo ?? ""}
                            </td>
                            <td className={`px-2 py-0.5 whitespace-pre ${textColor}`}>
                              {prefix}
                              {line.content}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          ))}
      </div>

      {/* Commit bar */}
      <div className="border-t border-gray-800 p-3">
        {error && <p className="mb-2 text-xs text-red-400">{error}</p>}
        <div className="flex gap-2">
          <textarea
            value={commitMessage}
            onChange={(e) => setCommitMessage(e.target.value)}
            placeholder="Commit message…"
            rows={2}
            className="flex-1 resize-none rounded-md border border-gray-700 bg-gray-800 px-3 py-2 text-sm text-gray-100 placeholder-gray-600 focus:border-blue-600 focus:outline-none"
          />
          <button
            onClick={() => {
              void handleCommit();
            }}
            disabled={pushing || !commitMessage.trim()}
            className="self-end rounded-md bg-blue-600 px-3 py-2 text-sm font-medium text-white hover:bg-blue-500 disabled:opacity-40"
          >
            {pushing ? "Pushing…" : "Commit & Push"}
          </button>
        </div>
      </div>
    </div>
  );
}
