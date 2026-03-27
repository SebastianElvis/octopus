import { useState, useCallback } from "react";
import { PrerequisiteCheck } from "./PrerequisiteCheck";

const STORAGE_KEY = "tmt-onboarding-completed";

export function useOnboarding() {
  const [show, setShow] = useState(() => {
    try {
      return localStorage.getItem(STORAGE_KEY) !== "true";
    } catch {
      return true;
    }
  });

  function dismiss() {
    try {
      localStorage.setItem(STORAGE_KEY, "true");
    } catch {
      /* ignore */
    }
    setShow(false);
  }

  return { showOnboarding: show, dismissOnboarding: dismiss };
}

interface OnboardingDialogProps {
  onClose: () => void;
  onOpenRepoSettings: () => void;
  onOpenNewSession: () => void;
}

type Step = "prerequisites" | "repo" | "session" | "board";

export function OnboardingDialog({
  onClose,
  onOpenRepoSettings,
  onOpenNewSession,
}: OnboardingDialogProps) {
  const [step, setStep] = useState<Step>("prerequisites");
  const [prereqsPassed, setPrereqsPassed] = useState(false);

  const handlePrereqsPassed = useCallback(() => {
    setPrereqsPassed(true);
  }, []);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div
        data-testid="onboarding-dialog"
        className="w-full max-w-lg rounded-xl border border-gray-200 bg-white p-6 shadow-2xl dark:border-gray-800 dark:bg-gray-900"
      >
        {/* Step indicators */}
        <div className="mb-6 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
            Welcome to TooManyTabs
          </h2>
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

        {/* Progress bar */}
        <div className="mb-6 flex items-center gap-2">
          {(["prerequisites", "repo", "session", "board"] as Step[]).map((s, i) => (
            <div
              key={s}
              className={`h-1 flex-1 rounded-full ${
                (["prerequisites", "repo", "session", "board"] as Step[]).indexOf(step) >= i
                  ? "bg-blue-600"
                  : "bg-gray-200 dark:bg-gray-700"
              }`}
            />
          ))}
        </div>

        {/* Step content */}
        {step === "prerequisites" && (
          <div>
            <h3 className="mb-3 text-sm font-medium text-gray-700 dark:text-gray-300">
              Step 1: Check Prerequisites
            </h3>
            <p className="mb-4 text-xs text-gray-500 dark:text-gray-400">
              TooManyTabs needs these CLI tools installed on your system.
            </p>
            <PrerequisiteCheck onAllPassed={handlePrereqsPassed} />
            <div className="mt-6 flex justify-end">
              <button
                onClick={() => setStep("repo")}
                disabled={!prereqsPassed}
                className="cursor-pointer rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-500 active:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-1 disabled:cursor-not-allowed disabled:opacity-50"
              >
                Next
              </button>
            </div>
          </div>
        )}

        {step === "repo" && (
          <div>
            <h3 className="mb-3 text-sm font-medium text-gray-700 dark:text-gray-300">
              Step 2: Connect a Repository
            </h3>
            <p className="mb-4 text-xs text-gray-500 dark:text-gray-400">
              Add a GitHub repository to start creating sessions. You can add repos from the Repos
              settings page.
            </p>
            <div className="flex gap-3">
              <button
                onClick={() => {
                  onOpenRepoSettings();
                  onClose();
                }}
                className="cursor-pointer rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-500 active:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-1"
              >
                Open Repo Settings
              </button>
              <button
                onClick={() => setStep("session")}
                className="cursor-pointer rounded-md border border-gray-300 px-4 py-2 text-sm font-medium text-gray-600 hover:border-gray-400 active:bg-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-1 dark:border-gray-700 dark:text-gray-300 dark:active:bg-gray-800"
              >
                Skip
              </button>
            </div>
          </div>
        )}

        {step === "session" && (
          <div>
            <h3 className="mb-3 text-sm font-medium text-gray-700 dark:text-gray-300">
              Step 3: Create Your First Session
            </h3>
            <p className="mb-4 text-xs text-gray-500 dark:text-gray-400">
              A session runs Claude Code in its own git worktree. Link an issue, provide a prompt,
              and let Claude work.
            </p>
            <div className="flex gap-3">
              <button
                onClick={() => {
                  onOpenNewSession();
                  onClose();
                }}
                className="cursor-pointer rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-500 active:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-1"
              >
                Create Session
              </button>
              <button
                onClick={() => setStep("board")}
                className="cursor-pointer rounded-md border border-gray-300 px-4 py-2 text-sm font-medium text-gray-600 hover:border-gray-400 active:bg-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-1 dark:border-gray-700 dark:text-gray-300 dark:active:bg-gray-800"
              >
                Skip
              </button>
            </div>
          </div>
        )}

        {step === "board" && (
          <div>
            <h3 className="mb-3 text-sm font-medium text-gray-700 dark:text-gray-300">
              Step 4: The Dispatch Board
            </h3>
            <p className="mb-4 text-xs text-gray-500 dark:text-gray-400">
              The board shows all your sessions organized by status. Sessions needing your input
              appear in the &quot;Needs Attention&quot; column. Use keyboard shortcuts for quick
              navigation:
            </p>
            <div className="mb-4 space-y-1.5">
              <ShortcutRow keys="Cmd+K" action="Open command palette" />
              <ShortcutRow keys="Cmd+N" action="New session" />
              <ShortcutRow keys="Cmd+J" action="Jump to next waiting session" />
              <ShortcutRow keys="Cmd+1/2/3" action="Switch views" />
              <ShortcutRow keys="Cmd+?" action="View all shortcuts" />
            </div>
            <div className="flex justify-end">
              <button
                onClick={onClose}
                className="cursor-pointer rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-500 active:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-1"
              >
                Get Started
              </button>
            </div>
          </div>
        )}
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
