import { FileTree } from "./FileTree";
import { GitChangesPanel } from "./GitChangesPanel";
import type { Session } from "../lib/types";
import { useUIStore } from "../stores/uiStore";
import { useEditorStore } from "../stores/editorStore";
import { useGitStore } from "../stores/gitStore";

interface RightPanelProps {
  session: Session | null;
  onCommitted?: () => void;
}

type Tab = "files" | "changes";

export function RightPanel({ session, onCommitted }: RightPanelProps) {
  const activeTab = useUIStore((s) => s.rightPanelTab);
  const setTab = useUIStore((s) => s.setRightPanelTab);
  const openFile = useEditorStore((s) => s.openFile);
  const changedFileCount = useGitStore((s) => s.changedFiles.length);

  const tabs: { id: Tab; label: string; count?: number }[] = [
    { id: "files", label: "Files" },
    { id: "changes", label: "Changes", count: changedFileCount },
  ];

  // Fall back to "changes" if the stored tab is no longer valid
  const effectiveTab = tabs.some((t) => t.id === activeTab) ? activeTab : "changes";

  return (
    <div className="flex h-full flex-col overflow-hidden bg-white dark:bg-gray-950">
      {/* Tab bar */}
      <div className="flex shrink-0 border-b border-gray-200 dark:border-gray-800">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setTab(tab.id)}
            className={`flex items-center gap-1 px-3 py-2 text-xs font-medium transition-colors ${
              effectiveTab === tab.id
                ? "border-b-2 border-blue-600 text-blue-600 dark:text-blue-400"
                : "text-gray-500 hover:text-gray-700 dark:text-gray-500 dark:hover:text-gray-300"
            }`}
          >
            {tab.label}
            {tab.count !== undefined && tab.count > 0 && (
              <span className="rounded-full bg-gray-200 px-1.5 text-xs dark:bg-gray-700">
                {tab.count}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* Tab content */}
      <div className="flex-1 overflow-hidden">
        {effectiveTab === "files" && session?.worktreePath && (
          <FileTree
            rootPath={session.worktreePath}
            onFileSelect={(path) => {
              void openFile(path);
            }}
          />
        )}
        {effectiveTab === "files" && !session?.worktreePath && (
          <div className="flex h-full items-center justify-center">
            <p className="text-xs text-gray-400 dark:text-gray-500">No worktree</p>
          </div>
        )}

        {effectiveTab === "changes" && (
          <GitChangesPanel
            worktreePath={session?.worktreePath}
            sessionId={session?.id}
            sessionName={session?.name}
            sessionStatus={session?.status}
            repoId={session?.repoId}
            branch={session?.branch}
            onCommitted={onCommitted}
          />
        )}
      </div>
    </div>
  );
}
