import { useEffect } from "react";
import { useFileBrowserStore } from "../stores/fileBrowserStore";
import type { FileEntry } from "../lib/types";

interface FileTreeProps {
  rootPath: string;
  onFileSelect: (filePath: string) => void;
}

const FILE_ICONS: Record<string, string> = {
  ts: "🟦",
  tsx: "🟦",
  js: "🟨",
  jsx: "🟨",
  rs: "🦀",
  py: "🐍",
  go: "🔵",
  rb: "🔴",
  json: "📋",
  yaml: "📋",
  yml: "📋",
  toml: "📋",
  md: "📝",
  mdx: "📝",
  txt: "📄",
  html: "🌐",
  css: "🎨",
  scss: "🎨",
  sh: "⚙️",
  bash: "⚙️",
  zsh: "⚙️",
  lock: "🔒",
  svg: "🖼️",
  png: "🖼️",
  jpg: "🖼️",
};

function fileIcon(entry: FileEntry): string {
  if (entry.isDir) return "";
  return FILE_ICONS[entry.extension ?? ""] ?? "📄";
}

export function FileTree({ rootPath, onFileSelect }: FileTreeProps) {
  const { setRootPath, entries, expandedDirs, loading } = useFileBrowserStore();

  useEffect(() => {
    setRootPath(rootPath);
  }, [rootPath, setRootPath]);

  const rootEntries = entries[rootPath] ?? [];
  const rootLoading = loading[rootPath] ?? false;

  if (rootLoading && rootEntries.length === 0) {
    return (
      <div className="flex h-20 items-center justify-center">
        <span className="text-xs text-gray-400 dark:text-gray-500">Loading…</span>
      </div>
    );
  }

  if (rootEntries.length === 0) {
    return (
      <div className="flex h-20 items-center justify-center">
        <span className="text-xs text-gray-400 dark:text-gray-500">Empty directory</span>
      </div>
    );
  }

  return (
    <div className="overflow-y-auto text-xs">
      {rootEntries.map((entry) => (
        <FileTreeNode
          key={entry.path}
          entry={entry}
          depth={0}
          onFileSelect={onFileSelect}
          entries={entries}
          expandedDirs={expandedDirs}
          loading={loading}
        />
      ))}
    </div>
  );
}

function FileTreeNode({
  entry,
  depth,
  onFileSelect,
  entries,
  expandedDirs,
  loading,
}: {
  entry: FileEntry;
  depth: number;
  onFileSelect: (filePath: string) => void;
  entries: Record<string, FileEntry[]>;
  expandedDirs: Set<string>;
  loading: Record<string, boolean>;
}) {
  const toggleDir = useFileBrowserStore((s) => s.toggleDir);
  const isExpanded = expandedDirs.has(entry.path);
  const children = entries[entry.path] ?? [];
  const isLoading = loading[entry.path] ?? false;

  if (entry.isDir) {
    return (
      <div>
        <button
          onClick={() => {
            void toggleDir(entry.path);
          }}
          className="flex w-full items-center gap-1 rounded px-1 py-0.5 text-left text-gray-600 hover:bg-gray-100 dark:text-gray-400 dark:hover:bg-gray-800/50"
          style={{ paddingLeft: `${depth * 12 + 4}px` }}
        >
          <svg
            className={`h-3 w-3 shrink-0 text-gray-400 transition-transform dark:text-gray-500 ${isExpanded ? "rotate-90" : ""}`}
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={2}
          >
            <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
          </svg>
          <span className="truncate font-medium">{entry.name}</span>
        </button>
        {isExpanded && (
          <div>
            {isLoading && children.length === 0 && (
              <div
                style={{ paddingLeft: `${(depth + 1) * 12 + 4}px` }}
                className="py-0.5 text-gray-400 dark:text-gray-500"
              >
                Loading…
              </div>
            )}
            {children.map((child) => (
              <FileTreeNode
                key={child.path}
                entry={child}
                depth={depth + 1}
                onFileSelect={onFileSelect}
                entries={entries}
                expandedDirs={expandedDirs}
                loading={loading}
              />
            ))}
          </div>
        )}
      </div>
    );
  }

  return (
    <button
      onClick={() => onFileSelect(entry.path)}
      className="flex w-full items-center gap-1.5 rounded px-1 py-0.5 text-left text-gray-600 hover:bg-gray-100 dark:text-gray-400 dark:hover:bg-gray-800/50"
      style={{ paddingLeft: `${depth * 12 + 18}px` }}
    >
      <span className="shrink-0" style={{ fontSize: "10px" }}>
        {fileIcon(entry)}
      </span>
      <span className="truncate">{entry.name}</span>
    </button>
  );
}
