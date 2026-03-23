import { useEditorStore } from "../stores/editorStore";

interface EditorTabsProps {
  terminalActive: boolean;
  onSelectTerminal: () => void;
  sessionStatus: string;
}

export function EditorTabs({ terminalActive, onSelectTerminal, sessionStatus }: EditorTabsProps) {
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
        className={`flex items-center gap-1.5 border-r border-gray-200 px-3 py-1.5 text-xs dark:border-gray-800 ${
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

      {/* File tabs */}
      {tabs.map((tab) => {
        const isActive = !terminalActive && tab.id === activeTabId;
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
              className="shrink-0 rounded p-0.5 text-gray-400 opacity-0 hover:bg-gray-200 hover:text-gray-600 group-hover:opacity-100 dark:text-gray-600 dark:hover:bg-gray-700 dark:hover:text-gray-300"
            >
              <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        );
      })}
    </div>
  );
}
