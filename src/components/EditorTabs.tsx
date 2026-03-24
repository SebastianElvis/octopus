import { useEditorStore } from "../stores/editorStore";

interface EditorTabsProps {
  terminalActive: boolean;
  onSelectTerminal: () => void;
  sessionStatus: string;
  hasGitHubTab?: boolean;
  githubActive?: boolean;
  onSelectGitHub?: () => void;
  githubLabel?: string;
}

export function EditorTabs({
  terminalActive,
  onSelectTerminal,
  sessionStatus,
  hasGitHubTab,
  githubActive,
  onSelectGitHub,
  githubLabel,
}: EditorTabsProps) {
  const tabs = useEditorStore((s) => s.tabs);
  const activeTabId = useEditorStore((s) => s.activeTabId);
  const setActiveTab = useEditorStore((s) => s.setActiveTab);
  const closeTab = useEditorStore((s) => s.closeTab);

  const isRunning = sessionStatus === "running" || sessionStatus === "waiting";

  return (
    <div className="flex shrink-0 items-center gap-0 overflow-x-auto border-b border-gray-200 bg-gray-50 dark:border-gray-800 dark:bg-gray-900">
      {/* Pinned Claude terminal tab */}
      <button
        onClick={onSelectTerminal}
        className={`flex cursor-pointer items-center gap-1.5 border-r border-gray-200 px-3 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-1 dark:border-gray-800 ${
          terminalActive
            ? "bg-white text-gray-900 dark:bg-gray-950 dark:text-gray-100"
            : "text-gray-500 hover:bg-gray-100 dark:text-gray-400 dark:hover:bg-gray-800/50"
        }`}
      >
        <span
          className={`h-2 w-2 shrink-0 rounded-full ${isRunning ? "bg-green-500 animate-pulse" : "bg-gray-400"}`}
        />
        <span className="font-medium">Claude</span>
      </button>

      {/* GitHub tab */}
      {hasGitHubTab && onSelectGitHub && (
        <button
          onClick={onSelectGitHub}
          className={`flex cursor-pointer items-center gap-1.5 border-r border-gray-200 px-3 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-1 dark:border-gray-800 ${
            githubActive
              ? "bg-white text-gray-900 dark:bg-gray-950 dark:text-gray-100"
              : "text-gray-500 hover:bg-gray-100 dark:text-gray-400 dark:hover:bg-gray-800/50"
          }`}
        >
          <svg className="h-3.5 w-3.5 shrink-0" viewBox="0 0 16 16" fill="currentColor">
            <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0016 8c0-4.42-3.58-8-8-8z" />
          </svg>
          <span className="font-medium">{githubLabel ?? "GitHub"}</span>
        </button>
      )}

      {/* File tabs */}
      {tabs.map((tab) => {
        const isActive = !terminalActive && !githubActive && tab.id === activeTabId;
        return (
          <div
            key={tab.id}
            className={`group flex items-center gap-1.5 border-r border-gray-200 px-3 py-1.5 text-xs dark:border-gray-800 ${
              isActive
                ? "bg-white text-gray-900 dark:bg-gray-950 dark:text-gray-100"
                : "text-gray-500 hover:bg-gray-100 dark:text-gray-400 dark:hover:bg-gray-800/50"
            }`}
          >
            <button
              onClick={() => setActiveTab(tab.id)}
              className="truncate"
              style={{ maxWidth: "140px" }}
            >
              {tab.fileName}
            </button>
            <button
              onClick={(e) => {
                e.stopPropagation();
                closeTab(tab.id);
              }}
              className="shrink-0 rounded p-0.5 text-gray-400 opacity-0 hover:bg-gray-200 hover:text-gray-600 group-hover:opacity-100 dark:text-gray-500 dark:hover:bg-gray-700 dark:hover:text-gray-300"
            >
              <svg
                className="h-3 w-3"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={2}
              >
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        );
      })}
    </div>
  );
}
