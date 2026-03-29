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
        data-testid="settings-modal"
        className="w-full max-w-lg rounded-xl border border-outline bg-surface shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-outline px-6 py-4">
          <h2 className="text-lg font-semibold text-on-surface">Settings</h2>
          <button
            onClick={onClose}
            className="cursor-pointer text-on-surface-faint hover:text-on-surface-muted focus:outline-none focus:ring-2 focus:ring-brand focus:ring-offset-1"
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
        <div className="flex border-b border-outline px-6">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`cursor-pointer px-3 py-2.5 text-xs font-medium transition-colors focus:outline-none focus:ring-2 focus:ring-brand focus:ring-offset-1 ${
                activeTab === tab.id
                  ? "border-b-2 border-brand text-brand"
                  : "text-on-surface-muted hover:text-on-surface"
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
                <label className="mb-1 block text-xs font-medium text-on-surface-muted">
                  Theme
                </label>
                <select
                  value={theme}
                  onChange={(e) => setTheme(e.target.value as "system" | "light" | "dark")}
                  className="w-full rounded-sm border border-outline bg-surface-raised px-3 py-2 text-sm text-on-surface focus:border-brand focus:outline-none"
                >
                  <option value="system">System</option>
                  <option value="light">Light</option>
                  <option value="dark">Dark</option>
                </select>
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-on-surface-muted">
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
                <div className="flex justify-between text-xs text-on-surface-faint">
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
                  <p className="text-sm font-medium text-on-surface">
                    Sound Notifications
                  </p>
                  <p className="text-xs text-on-surface-muted">
                    Play a sound when sessions need attention
                  </p>
                </div>
                <button
                  onClick={toggleSound}
                  className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors ${
                    soundEnabled ? "bg-brand" : "bg-active"
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
                <p className="text-sm font-medium text-on-surface">
                  System Notifications
                </p>
                <p className="text-xs text-on-surface-muted">
                  Desktop notifications are managed by your OS settings
                </p>
              </div>
            </div>
          )}

          {activeTab === "api" && (
            <div className="space-y-4">
              <div>
                <label className="mb-1 block text-xs font-medium text-on-surface-muted">
                  Claude API Key
                </label>
                <p className="mb-2 text-xs text-on-surface-muted">
                  Claude API key. Optional if you have Claude CLI configured.
                </p>
                <input
                  type="password"
                  value={apiKey}
                  onChange={(e) => setApiKey(e.target.value)}
                  placeholder="sk-ant-..."
                  className="w-full rounded-sm border border-outline bg-surface-raised px-3 py-2 text-sm text-on-surface placeholder-on-surface-faint focus:border-brand focus:outline-none"
                />
                {apiKeyError && (
                  <p className="mt-1 text-xs text-danger">{apiKeyError}</p>
                )}
                <button
                  onClick={() => {
                    void handleSaveApiKey();
                  }}
                  className="mt-2 cursor-pointer rounded-sm bg-brand px-3 py-1.5 text-xs font-medium text-white hover:bg-brand active:bg-brand focus:outline-none focus:ring-2 focus:ring-brand focus:ring-offset-1"
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
                className="mt-3 cursor-pointer text-xs text-brand hover:underline focus:outline-none focus:ring-2 focus:ring-brand focus:ring-offset-1"
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
      <span className="text-xs text-on-surface-muted">{action}</span>
      <kbd className="rounded border border-outline px-2 py-0.5 text-xs font-mono text-on-surface-muted">
        {keys}
      </kbd>
    </div>
  );
}
