import { useState, useRef, useEffect, useCallback, useMemo } from "react";
import type { SessionStatus, BlockType } from "../../lib/types";
import { isTauri } from "../../lib/env";
import { interruptSession, sendFollowup, saveTempImage, scanSlashCommands } from "../../lib/tauri";
import { useSessionStore } from "../../stores/sessionStore";
import type { SlashCommand } from "./SlashCommandMenu";
import { PermissionBanner } from "./PermissionBanner";
import { SlashCommandMenu, filterCommands, buildCommandList } from "./SlashCommandMenu";

interface AttachedImage {
  id: string;
  file: File;
  previewUrl: string;
}

function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

interface UserInputAreaProps {
  sessionId: string;
  sessionStatus: SessionStatus;
  blockType?: BlockType;
  lastMessage?: string;
}

export function UserInputArea({
  sessionId,
  sessionStatus,
  blockType,
  lastMessage,
}: UserInputAreaProps) {
  const [inputText, setInputText] = useState("");
  const [sending, setSending] = useState(false);
  const [slashMenuOpen, setSlashMenuOpen] = useState(false);
  const [slashSelectedIndex, setSlashSelectedIndex] = useState(0);
  const [fsCommands, setFsCommands] = useState<SlashCommand[]>([]);
  const [attachedImages, setAttachedImages] = useState<AttachedImage[]>([]);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const addOptimisticUserMessage = useSessionStore((s) => s.addOptimisticUserMessage);

  // Get the session's worktree path and init info from the store
  const worktreePath = useSessionStore(
    (s) => s.sessions.find((sess) => sess.id === sessionId)?.worktreePath,
  );
  const sessionInitInfo = useSessionStore((s) => s.sessionInitInfo[sessionId]);

  // Load filesystem-discovered commands on mount (project + personal custom commands/skills)
  useEffect(() => {
    if (!isTauri()) return;
    void scanSlashCommands(worktreePath).then((discovered) => {
      const mapped: SlashCommand[] = discovered.map((d) => ({
        command: d.command,
        description: d.description,
        category: d.source as SlashCommand["category"],
      }));
      setFsCommands(mapped);
    });
  }, [worktreePath]);

  // Build command list from init info (dynamic) or fall back to hardcoded list
  const allCommands = useMemo(
    () => buildCommandList(sessionInitInfo, fsCommands),
    [sessionInitInfo, fsCommands],
  );

  const isRunning = sessionStatus === "running";
  const isFinished = sessionStatus === "done";
  const isWaiting = sessionStatus === "attention";
  const isWaitingPermission = isWaiting && blockType === "permission";
  const isWaitingQuestion = isWaiting && (blockType === "question" || blockType === "input");
  const isWaitingConfirmation = isWaiting && blockType === "confirmation";
  const canType = !isWaitingPermission && !isWaitingConfirmation;

  // Auto-focus input when session finishes or is waiting for text input
  useEffect(() => {
    if ((isFinished || isWaitingQuestion || (isWaiting && !blockType)) && textareaRef.current) {
      textareaRef.current.focus();
    }
  }, [sessionStatus, blockType, isFinished, isWaiting, isWaitingQuestion]);

  // Auto-resize textarea
  const adjustHeight = useCallback(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 150)}px`;
  }, []);

  // Slash command detection
  const slashQuery = slashMenuOpen && inputText.startsWith("/")
    ? inputText.slice(1).split(" ")[0]
    : "";
  const slashFiltered = slashMenuOpen ? filterCommands(slashQuery, allCommands) : [];

  // Image handling
  const addImages = useCallback((files: FileList | File[]) => {
    const imageFiles = Array.from(files).filter((f) => f.type.startsWith("image/"));
    const newImages: AttachedImage[] = imageFiles.map((file) => ({
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      file,
      previewUrl: URL.createObjectURL(file),
    }));
    setAttachedImages((prev) => [...prev, ...newImages]);
  }, []);

  const removeImage = useCallback((id: string) => {
    setAttachedImages((prev) => {
      const removed = prev.find((img) => img.id === id);
      if (removed) URL.revokeObjectURL(removed.previewUrl);
      return prev.filter((img) => img.id !== id);
    });
  }, []);

  // Cleanup preview URLs on unmount
  useEffect(() => {
    return () => {
      attachedImages.forEach((img) => URL.revokeObjectURL(img.previewUrl));
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Paste handler for images
  const handlePaste = useCallback(
    (e: React.ClipboardEvent) => {
      const items = e.clipboardData.items;
      const imageFiles: File[] = [];
      for (const item of items) {
        if (item.type.startsWith("image/")) {
          const file = item.getAsFile();
          if (file) imageFiles.push(file);
        }
      }
      if (imageFiles.length > 0) {
        addImages(imageFiles);
      }
    },
    [addImages],
  );

  // Drop handler for images
  const [isDragOver, setIsDragOver] = useState(false);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    if (e.dataTransfer.types.includes("Files")) {
      setIsDragOver(true);
    }
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
  }, []);

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setIsDragOver(false);
      if (e.dataTransfer.files.length > 0) {
        addImages(e.dataTransfer.files);
      }
    },
    [addImages],
  );

  function handleInputChange(value: string) {
    setInputText(value);
    // Open menu when typing starts with "/" and has no space yet (still typing the command)
    if (value.startsWith("/") && !value.includes(" ")) {
      setSlashMenuOpen(true);
      setSlashSelectedIndex(0);
    } else {
      setSlashMenuOpen(false);
    }
  }

  function handleSlashSelect(command: string) {
    setInputText(command + " ");
    setSlashMenuOpen(false);
    textareaRef.current?.focus();
  }

  async function handleSend() {
    if ((!inputText.trim() && attachedImages.length === 0) || sending) return;
    const text = inputText.trim() || (attachedImages.length > 0 ? "Attached image(s)" : "");
    addOptimisticUserMessage(sessionId, text);
    setSending(true);
    try {
      if (isTauri()) {
        // Upload images to temp files and collect paths
        let imagePaths: string[] | undefined;
        if (attachedImages.length > 0) {
          imagePaths = await Promise.all(
            attachedImages.map(async (img) => {
              const dataUrl = await fileToDataUrl(img.file);
              return saveTempImage(dataUrl, img.file.name);
            }),
          );
        }
        await sendFollowup(sessionId, text, imagePaths);
      }
      setInputText("");
      // Cleanup image previews
      attachedImages.forEach((img) => URL.revokeObjectURL(img.previewUrl));
      setAttachedImages([]);
      if (textareaRef.current) {
        textareaRef.current.style.height = "auto";
      }
    } catch (err: unknown) {
      console.error("[UserInputArea] followup error:", err);
    } finally {
      setSending(false);
    }
  }

  async function handleInterrupt() {
    try {
      if (isTauri()) {
        await interruptSession(sessionId);
      }
    } catch (err: unknown) {
      console.error("[UserInputArea] interrupt error:", err);
    }
  }

  // Placeholder text
  function getPlaceholder(): string {
    if (isRunning) return "Type a message... (sent after current turn)";
    if (isWaitingPermission) return "Waiting for permission approval...";
    if (isWaitingConfirmation) return "Waiting for confirmation...";
    if (isWaitingQuestion) return "Type your response...";
    if (isWaiting) return "Type your response...";
    if (isFinished) return "Send a follow-up message...";
    return "Send a message...";
  }

  // Status line content
  function getStatusInfo(): { label: string; color: string } | null {
    if (isRunning) return { label: "Claude is working...", color: "bg-green-500" };
    if (isFinished) return { label: "Session done", color: "bg-green-500" };
    return null;
  }

  const statusInfo = getStatusInfo();

  return (
    <div className="border-t border-gray-200 bg-white dark:border-gray-800 dark:bg-gray-950">
      {/* Hook-based permission banner (rich inline UI) */}
      <PermissionBanner sessionId={sessionId} />

      {/* Question / input prompt */}
      {isWaitingQuestion && lastMessage && (
        <div className="mx-3 mb-2 flex items-start gap-2 rounded-lg border border-blue-200 bg-blue-50/50 p-3 dark:border-blue-900 dark:bg-blue-950/20">
          <svg
            className="mt-0.5 h-4 w-4 shrink-0 text-blue-500"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={1.5}
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M9.879 7.519c1.171-1.025 3.071-1.025 4.242 0 1.172 1.025 1.172 2.687 0 3.712-.203.179-.43.326-.67.442-.745.361-1.45.999-1.45 1.827v.75M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Zm-9 5.25h.008v.008H12v-.008Z"
            />
          </svg>
          <p className="text-sm text-gray-700 dark:text-gray-300">{lastMessage}</p>
        </div>
      )}

      {/* Confirmation prompt */}
      {isWaitingConfirmation && (
        <div className="mx-3 mb-2 rounded-lg border border-amber-200 bg-amber-50/50 p-3 dark:border-amber-900 dark:bg-amber-950/20">
          {lastMessage && (
            <p className="mb-2 text-sm text-gray-700 dark:text-gray-300">{lastMessage}</p>
          )}
          <div className="flex items-center gap-2">
            <button
              onClick={() => {
                setInputText("yes");
                void handleSend();
              }}
              disabled={sending}
              className="flex cursor-pointer items-center gap-1.5 rounded-md bg-green-600 px-3 py-1.5 text-xs font-medium text-white shadow-sm hover:bg-green-500 active:bg-green-700 disabled:cursor-not-allowed disabled:opacity-50"
            >
              <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="m4.5 12.75 6 6 9-13.5" />
              </svg>
              Yes
            </button>
            <button
              onClick={() => {
                setInputText("no");
                void handleSend();
              }}
              disabled={sending}
              className="flex cursor-pointer items-center gap-1.5 rounded-md border border-gray-300 bg-white px-3 py-1.5 text-xs font-medium text-gray-600 shadow-sm hover:bg-gray-50 active:bg-gray-100 disabled:cursor-not-allowed disabled:opacity-50 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-400 dark:hover:bg-gray-700"
            >
              <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" />
              </svg>
              No
            </button>
          </div>
        </div>
      )}

      {/* Session-level permission (fallback when no hook permissions are available) */}
      {isWaitingPermission && lastMessage && (
        <div className="mx-3 mb-2 rounded-lg border border-amber-200 bg-amber-50/50 p-3 dark:border-amber-900 dark:bg-amber-950/20">
          <div className="mb-2 flex items-center gap-2">
            <svg
              className="h-4 w-4 shrink-0 text-amber-500"
              fill="currentColor"
              viewBox="0 0 20 20"
            >
              <path
                fillRule="evenodd"
                d="M8.485 2.495c.673-1.167 2.357-1.167 3.03 0l6.28 10.875c.673 1.167-.17 2.625-1.516 2.625H3.72c-1.347 0-2.189-1.458-1.515-2.625L8.485 2.495ZM10 6a.75.75 0 0 1 .75.75v3.5a.75.75 0 0 1-1.5 0v-3.5A.75.75 0 0 1 10 6Zm0 9a1 1 0 1 0 0-2 1 1 0 0 0 0 2Z"
                clipRule="evenodd"
              />
            </svg>
            <span className="text-sm font-medium text-amber-700 dark:text-amber-400">
              Permission Required
            </span>
          </div>
          <p className="text-xs text-gray-600 dark:text-gray-400">{lastMessage}</p>
        </div>
      )}

      {/* Text input area — always visible */}
      <div
        className="relative px-3 py-2.5"
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
      >
        {/* Drag overlay */}
        {isDragOver && (
          <div className="pointer-events-none absolute inset-0 z-30 flex items-center justify-center rounded-xl border-2 border-dashed border-blue-400 bg-blue-50/80 dark:bg-blue-950/60">
            <span className="text-sm font-medium text-blue-600 dark:text-blue-400">
              Drop image here
            </span>
          </div>
        )}

        {/* Slash command autocomplete menu */}
        {slashMenuOpen && slashFiltered.length > 0 && (
          <SlashCommandMenu
            filter={slashQuery}
            selectedIndex={slashSelectedIndex}
            onSelect={handleSlashSelect}
            onHover={setSlashSelectedIndex}
            commands={allCommands}
          />
        )}
        <div className="rounded-xl border border-gray-200 bg-gray-50 focus-within:border-blue-400 focus-within:bg-white focus-within:ring-1 focus-within:ring-blue-400 dark:border-gray-700 dark:bg-gray-900 dark:focus-within:border-blue-500 dark:focus-within:bg-gray-950 dark:focus-within:ring-blue-500">
          {/* Image thumbnails */}
          {attachedImages.length > 0 && (
            <div className="flex flex-wrap gap-2 px-3 pt-2">
              {attachedImages.map((img) => (
                <div key={img.id} className="group relative">
                  <img
                    src={img.previewUrl}
                    alt={img.file.name}
                    className="h-16 w-16 rounded-md border border-gray-200 object-cover dark:border-gray-700"
                  />
                  <button
                    onClick={() => removeImage(img.id)}
                    className="absolute -right-1.5 -top-1.5 flex h-4 w-4 cursor-pointer items-center justify-center rounded-full bg-gray-800 text-white opacity-0 transition-opacity hover:bg-red-600 group-hover:opacity-100 dark:bg-gray-200 dark:text-gray-900 dark:hover:bg-red-400"
                    title="Remove image"
                  >
                    <svg className="h-2.5 w-2.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" />
                    </svg>
                  </button>
                </div>
              ))}
            </div>
          )}

          <div className="flex items-end gap-2 px-3 py-2">
            {/* Hidden file input */}
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              multiple
              className="hidden"
              onChange={(e) => {
                if (e.target.files) addImages(e.target.files);
                e.target.value = ""; // Reset so same file can be re-selected
              }}
            />

            {/* Image attach button */}
            <button
              onClick={() => fileInputRef.current?.click()}
              disabled={sending || !canType}
              className="flex h-7 w-7 shrink-0 cursor-pointer items-center justify-center rounded-lg text-gray-400 transition-colors hover:bg-gray-200 hover:text-gray-600 disabled:cursor-not-allowed disabled:opacity-50 dark:text-gray-500 dark:hover:bg-gray-800 dark:hover:text-gray-300"
              title="Attach image"
            >
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="m18.375 12.739-7.693 7.693a4.5 4.5 0 0 1-6.364-6.364l10.94-10.94A3 3 0 1 1 19.5 7.372L8.552 18.32m.009-.01-.01.01m5.699-9.941-7.81 7.81a1.5 1.5 0 0 0 2.112 2.13" />
              </svg>
            </button>

            <textarea
              ref={textareaRef}
              value={inputText}
              onChange={(e) => {
                handleInputChange(e.target.value);
                adjustHeight();
              }}
              onPaste={handlePaste}
              onKeyDown={(e) => {
                if (slashMenuOpen && slashFiltered.length > 0) {
                  if (e.key === "ArrowDown") {
                    e.preventDefault();
                    setSlashSelectedIndex((i) => Math.min(i + 1, slashFiltered.length - 1));
                    return;
                  }
                  if (e.key === "ArrowUp") {
                    e.preventDefault();
                    setSlashSelectedIndex((i) => Math.max(i - 1, 0));
                    return;
                  }
                  if (e.key === "Tab" || (e.key === "Enter" && !e.shiftKey)) {
                    e.preventDefault();
                    handleSlashSelect(slashFiltered[slashSelectedIndex].command);
                    return;
                  }
                  if (e.key === "Escape") {
                    e.preventDefault();
                    setSlashMenuOpen(false);
                    return;
                  }
                }
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  void handleSend();
                }
              }}
              onBlur={() => {
                // Delay closing so clicks on menu items register
                setTimeout(() => setSlashMenuOpen(false), 150);
              }}
              placeholder={getPlaceholder()}
              disabled={sending || !canType}
              rows={1}
              className="flex-1 resize-none border-0 bg-transparent text-sm text-gray-900 placeholder-gray-400 focus:outline-none disabled:opacity-50 dark:text-gray-100 dark:placeholder-gray-500"
            />
            <button
              onClick={() => {
                void handleSend();
              }}
              disabled={(!inputText.trim() && attachedImages.length === 0) || sending || !canType}
              className="flex h-7 w-7 shrink-0 cursor-pointer items-center justify-center rounded-lg bg-gray-900 text-white transition-colors hover:bg-gray-700 disabled:cursor-not-allowed disabled:bg-gray-300 disabled:text-gray-500 dark:bg-gray-100 dark:text-gray-900 dark:hover:bg-gray-300 dark:disabled:bg-gray-700 dark:disabled:text-gray-500"
              title="Send (Enter)"
            >
              <svg
                xmlns="http://www.w3.org/2000/svg"
                viewBox="0 0 20 20"
                fill="currentColor"
                className="h-3.5 w-3.5"
              >
                <path
                  fillRule="evenodd"
                  d="M10 17a.75.75 0 0 1-.75-.75V5.612L5.29 9.77a.75.75 0 0 1-1.08-1.04l5.25-5.5a.75.75 0 0 1 1.08 0l5.25 5.5a.75.75 0 1 1-1.08 1.04l-3.96-4.158V16.25A.75.75 0 0 1 10 17Z"
                  clipRule="evenodd"
                />
              </svg>
            </button>
          </div>
        </div>
      </div>

      {/* Bottom status bar */}
      <div className="flex items-center justify-between px-4 pb-2">
        <div className="flex items-center gap-2">
          {statusInfo && (
            <>
              <span
                className={`inline-block h-1.5 w-1.5 rounded-full ${statusInfo.color} ${isRunning ? "animate-pulse" : ""}`}
              />
              <span className="text-[11px] text-gray-400 dark:text-gray-500">
                {statusInfo.label}
              </span>
            </>
          )}
          {isWaiting && (
            <>
              <span className="inline-block h-1.5 w-1.5 animate-pulse rounded-full bg-amber-500" />
              <span className="text-[11px] text-gray-400 dark:text-gray-500">
                Waiting for your input
              </span>
            </>
          )}
        </div>
        {isRunning && (
          <button
            onClick={() => {
              void handleInterrupt();
            }}
            className="cursor-pointer rounded px-2 py-0.5 text-[11px] font-medium text-gray-400 hover:bg-gray-100 hover:text-gray-600 dark:text-gray-500 dark:hover:bg-gray-800 dark:hover:text-gray-300"
          >
            Interrupt
          </button>
        )}
      </div>
    </div>
  );
}
