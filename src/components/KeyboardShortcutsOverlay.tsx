import { useEffect, useMemo } from "react";
import { getKeybindingsBySection } from "../lib/keybindings";

interface KeyboardShortcutsOverlayProps {
  open: boolean;
  onClose: () => void;
}

export function KeyboardShortcutsOverlay({ open, onClose }: KeyboardShortcutsOverlayProps) {
  const sections = useMemo(() => getKeybindingsBySection(), []);

  useEffect(() => {
    if (!open) return;
    function handleKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="w-full max-w-md rounded-xl border border-outline bg-surface p-6 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-on-surface">Keyboard Shortcuts</h2>
          <button onClick={onClose} className="text-on-surface-faint hover:text-on-surface-muted">
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

        <div className="space-y-5">
          {sections.map((section) => (
            <div key={section.section}>
              <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-on-surface-muted">
                {section.section}
              </h3>
              <div className="space-y-1.5">
                {section.items.map((item) => (
                  <div key={item.id} className="flex items-center justify-between py-0.5">
                    <span className="text-sm text-on-surface-muted">{item.description}</span>
                    <kbd className="rounded border border-outline px-2 py-0.5 text-xs font-mono text-on-surface-muted">
                      {item.keys}
                    </kbd>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>

        <p className="mt-5 text-xs text-gray-400 dark:text-gray-500">
          Shortcuts can be customized via localStorage key{" "}
          <code className="rounded bg-gray-100 px-1 dark:bg-gray-800">tmt-keybindings</code>
        </p>
      </div>
    </div>
  );
}
