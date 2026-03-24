import { useState, useEffect } from "react";
import { useUIStore } from "../stores/uiStore";
import { useThemeStore } from "../stores/themeStore";
import { getSetting, setSetting } from "../lib/tauri";
import { formatError } from "../lib/errors";

interface SettingsModalProps {
  open: boolean;
  onClose: () => void;
  onShowShortcuts: () => void;
}

type SettingsTab = "appearance" | "notifications" | "api" | "shortcuts";

export function SettingsModal({ open, onClose, onShowShortcuts }: SettingsModalProps) {
  if (!open) return null;
  return <SettingsModalInner onClose={onClose} onShowShortcuts={onShowShortcuts} />;
}

function SettingsModalInner({
  onClose,
  onShowShortcuts,
}: {
  onClose: () => void;
  onShowShortcuts: () => void;
}) {
  const [activeTab, setActiveTab] = useState<SettingsTab>("appearance");
  const soundEnabled = useUIStore((s) => s.soundEnabled);
  const toggleSound = useUIStore((s) => s.toggleSound);
  const terminalFontSize = useUIStore((s) => s.terminalFontSize);
  const setTerminalFontSize = useUIStore((s) => s.setTerminalFontSize);
  const theme = useThemeStore((s) => s.theme);
  const setTheme = useThemeStore((s) => s.setTheme);

  const [apiKey, setApiKey] = useState("");
  const [apiKeySaved, setApiKeySaved] = useState(false);
  const [apiKeyError, setApiKeyError] = useState<string | null>(null);

  // Load API key
  useEffect(() => {
    void getSetting("claude_api_key").then((val) => {
      if (val) setApiKey(val);
    });
  }, []);

  async function handleSaveApiKey() {
    setApiKeyError(null);
    try {
      await setSetting("claude_api_key", apiKey);
      setApiKeySaved(true);
      setTimeout(() => setApiKeySaved(false), 2000);
    } catch (err: unknown) {
      setApiKeyError(formatError(err));
    }
  }

  // Close on Escape
  useEffect(() => {
    function handleKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [onClose]);

  const tabs: { id: SettingsTab; label: string }[] = [
    { id: "appearance", label: "Appearance" },
    { id: "notifications", label: "Notifications" },
    { id: "api", label: "API Keys" },
    { id: "shortcuts", label: "Shortcuts" },
  ];

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="w-full max-w-lg rounded-xl border border-gray-200 bg-white shadow-2xl dark:border-gray-800 dark:bg-gray-900"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-gray-200 px-6 py-4 dark:border-gray-800">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">Settings</h2>
          <button
            onClick={onClose}
            className="cursor-pointer text-gray-400 hover:text-gray-600 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-1 dark:text-gray-500 dark:hover:text-gray-300"
          >
            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M6 18L18 6M6 6l12 12"
              />
            </svg>
          </button>
        </div>

        {/* Tabs */}
        <div className="flex border-b border-gray-200 px-6 dark:border-gray-800">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`cursor-pointer px-3 py-2.5 text-xs font-medium transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-1 ${
                activeTab === tab.id
                  ? "border-b-2 border-blue-600 text-blue-600 dark:text-blue-400"
                  : "text-gray-500 hover:text-gray-700 dark:text-gray-500 dark:hover:text-gray-300"
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* Content */}
        <div className="p-6">
          {activeTab === "appearance" && (
            <div className="space-y-4">
              <div>
                <label className="mb-1 block text-xs font-medium text-gray-500 dark:text-gray-400">
                  Theme
                </label>
                <select
                  value={theme}
                  onChange={(e) => setTheme(e.target.value as "system" | "light" | "dark")}
                  className="w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 focus:border-blue-600 focus:outline-none dark:border-gray-700 dark:bg-gray-800 dark:text-gray-100"
                >
                  <option value="system">System</option>
                  <option value="light">Light</option>
                  <option value="dark">Dark</option>
                </select>
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-gray-500 dark:text-gray-400">
                  Terminal Font Size ({terminalFontSize}px)
                </label>
                <input
                  type="range"
                  min={8}
                  max={24}
                  value={terminalFontSize}
                  onChange={(e) => setTerminalFontSize(parseInt(e.target.value, 10))}
                  className="w-full"
                />
                <div className="flex justify-between text-xs text-gray-400">
                  <span>8px</span>
                  <span>24px</span>
                </div>
              </div>
            </div>
          )}

          {activeTab === "notifications" && (
            <div className="space-y-4">
              <label className="flex cursor-pointer items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-gray-900 dark:text-gray-100">
                    Sound Notifications
                  </p>
                  <p className="text-xs text-gray-500 dark:text-gray-400">
                    Play a sound when sessions need attention
                  </p>
                </div>
                <button
                  onClick={toggleSound}
                  className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors ${
                    soundEnabled ? "bg-blue-600" : "bg-gray-300 dark:bg-gray-600"
                  }`}
                >
                  <span
                    className={`inline-block h-4 w-4 rounded-full bg-white transition-transform ${
                      soundEnabled ? "translate-x-6" : "translate-x-1"
                    }`}
                  />
                </button>
              </label>
              <div>
                <p className="text-sm font-medium text-gray-900 dark:text-gray-100">
                  System Notifications
                </p>
                <p className="text-xs text-gray-500 dark:text-gray-400">
                  Desktop notifications are managed by your OS settings
                </p>
              </div>
            </div>
          )}

          {activeTab === "api" && (
            <div className="space-y-4">
              <div>
                <label className="mb-1 block text-xs font-medium text-gray-500 dark:text-gray-400">
                  Claude API Key
                </label>
                <p className="mb-2 text-xs text-gray-500 dark:text-gray-400">
                  Claude API key. Optional if you have Claude CLI configured.
                </p>
                <input
                  type="password"
                  value={apiKey}
                  onChange={(e) => setApiKey(e.target.value)}
                  placeholder="sk-ant-..."
                  className="w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 placeholder-gray-400 focus:border-blue-600 focus:outline-none dark:border-gray-700 dark:bg-gray-800 dark:text-gray-100 dark:placeholder-gray-500"
                />
                {apiKeyError && (
                  <p className="mt-1 text-xs text-red-600 dark:text-red-400">{apiKeyError}</p>
                )}
                <button
                  onClick={() => {
                    void handleSaveApiKey();
                  }}
                  className="mt-2 cursor-pointer rounded-md bg-blue-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-blue-500 active:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-1"
                >
                  {apiKeySaved ? "Saved" : "Save"}
                </button>
              </div>
            </div>
          )}

          {activeTab === "shortcuts" && (
            <div className="space-y-2">
              <ShortcutRow keys="Cmd+K" action="Command palette" />
              <ShortcutRow keys="Cmd+N" action="New session" />
              <ShortcutRow keys="Cmd+J" action="Jump to next waiting session" />
              <ShortcutRow keys="Cmd+1" action="Home / Board" />
              <ShortcutRow keys="Cmd+2" action="Tasks" />
              <ShortcutRow keys="Cmd+3" action="Repos" />
              <ShortcutRow keys="Cmd+?" action="Keyboard shortcuts overlay" />
              <ShortcutRow keys="Esc" action="Close modal / Go back" />
              <button
                onClick={() => {
                  onShowShortcuts();
                  onClose();
                }}
                className="mt-3 cursor-pointer text-xs text-blue-600 hover:underline focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-1 dark:text-blue-500"
              >
                View full shortcuts overlay
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function ShortcutRow({ keys, action }: { keys: string; action: string }) {
  return (
    <div className="flex items-center justify-between py-1">
      <span className="text-xs text-gray-600 dark:text-gray-400">{action}</span>
      <kbd className="rounded border border-gray-300 px-2 py-0.5 text-xs font-mono text-gray-500 dark:border-gray-700 dark:text-gray-400">
        {keys}
      </kbd>
    </div>
  );
}
