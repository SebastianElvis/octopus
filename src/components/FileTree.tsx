import { useEffect, useMemo } from "react";
import { useFileBrowserStore } from "../stores/fileBrowserStore";
import { useGitStore } from "../stores/gitStore";
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

/** Map git status codes to text color classes */
function gitStatusColor(status: string): string {
  switch (status) {
    case "A":
    case "U":
      return "text-green-500 dark:text-green-400";
    case "M":
    case "R":
      return "text-yellow-600 dark:text-yellow-400";
    case "D":
      return "text-red-500 dark:text-red-400";
    default:
      return "text-green-500 dark:text-green-400";
  }
}

/** Status letter badge */
function gitStatusBadge(status: string): string {
  switch (status) {
    case "A":
      return "A";
    case "U":
      return "U";
    case "M":
      return "M";
    case "D":
      return "D";
    case "R":
      return "R";
    case "C":
      return "C";
    default:
      return "•";
  }
}

/** Build a map from absolute file path → git status, plus a set of directories containing changes */
function buildChangeMap(
  changedFiles: { path: string; status: string }[],
  rootPath: string,
): { fileStatus: Map<string, string>; dirHasChanges: Set<string> } {
  const fileStatus = new Map<string, string>();
  const dirHasChanges = new Set<string>();
  const root = rootPath.endsWith("/") ? rootPath : rootPath + "/";

  for (const f of changedFiles) {
    const absPath = root + f.path;
    fileStatus.set(absPath, f.status);

    // Mark all ancestor directories as having changes
    let slash = absPath.lastIndexOf("/");
    while (slash > 0) {
      const dir = absPath.substring(0, slash);
      if (dir.length < root.length - 1) break;
      dirHasChanges.add(dir);
      slash = dir.lastIndexOf("/");
    }
  }
  return { fileStatus, dirHasChanges };
}

export function FileTree({ rootPath, onFileSelect }: FileTreeProps) {
  const { setRootPath, entries, expandedDirs, loading } = useFileBrowserStore();
  const changedFiles = useGitStore((s) => s.changedFiles);

  useEffect(() => {
    setRootPath(rootPath);
  }, [rootPath, setRootPath]);

  const { fileStatus, dirHasChanges } = useMemo(
    () => buildChangeMap(changedFiles, rootPath),
    [changedFiles, rootPath],
  );

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
    <div className="h-full overflow-y-auto text-xs">
      {rootEntries.map((entry) => (
        <FileTreeNode
          key={entry.path}
          entry={entry}
          depth={0}
          onFileSelect={onFileSelect}
          entries={entries}
          expandedDirs={expandedDirs}
          loading={loading}
          fileStatus={fileStatus}
          dirHasChanges={dirHasChanges}
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
  fileStatus,
  dirHasChanges,
}: {
  entry: FileEntry;
  depth: number;
  onFileSelect: (filePath: string) => void;
  entries: Record<string, FileEntry[]>;
  expandedDirs: Set<string>;
  loading: Record<string, boolean>;
  fileStatus: Map<string, string>;
  dirHasChanges: Set<string>;
}) {
  const toggleDir = useFileBrowserStore((s) => s.toggleDir);
  const isExpanded = expandedDirs.has(entry.path);
  const children = entries[entry.path] ?? [];
  const isLoading = loading[entry.path] ?? false;

  if (entry.isDir) {
    const hasChanges = dirHasChanges.has(entry.path);
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
          <span className={`truncate font-medium ${hasChanges ? "text-yellow-600 dark:text-yellow-400" : ""}`}>
            {entry.name}
          </span>
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
                fileStatus={fileStatus}
                dirHasChanges={dirHasChanges}
              />
            ))}
          </div>
        )}
      </div>
    );
  }

  const status = fileStatus.get(entry.path);
  const colorClass = status ? gitStatusColor(status) : "";

  return (
    <button
      onClick={() => onFileSelect(entry.path)}
      className={`flex w-full items-center gap-1.5 rounded px-1 py-0.5 text-left hover:bg-gray-100 dark:hover:bg-gray-800/50 ${
        status ? colorClass : "text-gray-600 dark:text-gray-400"
      }`}
      style={{ paddingLeft: `${depth * 12 + 18}px` }}
    >
      <span className="shrink-0" style={{ fontSize: "10px" }}>
        {fileIcon(entry)}
      </span>
      <span className="truncate">{entry.name}</span>
      {status && (
        <span className={`ml-auto shrink-0 text-[10px] font-medium ${colorClass}`}>
          {gitStatusBadge(status)}
        </span>
      )}
    </button>
  );
}
