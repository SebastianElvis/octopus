import { create } from "zustand";
import {
  getChangedFiles,
  getSyncStatus,
  gitStageFiles,
  gitUnstageFiles,
  gitDiscardFiles,
  getFileDiff,
  gitCommitAndPush,
  gitCommit,
  gitPush,
} from "../lib/tauri";
import type { SyncStatus } from "../lib/tauri";
import type { ChangedFile } from "../lib/types";
import { formatError } from "../lib/errors";
import { useEditorStore } from "./editorStore";

interface GitState {
  worktreePath: string | null;
  changedFiles: ChangedFile[];
  selectedFile: string | null;
  selectedFileDiff: string | null;
  selectedFileStaged: boolean;
  loading: boolean;
  commitMessage: string;
  pushing: boolean;
  committing: boolean;
  error: string | null;
  successMessage: string | null;
  successUrl: string | null;
  syncStatus: SyncStatus | null;

  setWorktreePath: (path: string | null) => void;
  refreshChanges: () => Promise<void>;
  stageFiles: (paths: string[]) => Promise<void>;
  unstageFiles: (paths: string[]) => Promise<void>;
  discardFiles: (paths: string[]) => Promise<void>;
  selectFile: (path: string, staged: boolean) => Promise<void>;
  clearSelection: () => void;
  setCommitMessage: (msg: string) => void;
  commitAndPush: () => Promise<void>;
  commit: () => Promise<void>;
  push: () => Promise<void>;
}

export const useGitStore = create<GitState>((set, get) => ({
  worktreePath: null,
  changedFiles: [],
  selectedFile: null,
  selectedFileDiff: null,
  selectedFileStaged: false,
  loading: false,
  commitMessage: "",
  pushing: false,
  committing: false,
  error: null,
  successMessage: null,
  successUrl: null,
  syncStatus: null,

  setWorktreePath: (path: string | null) => {
    set({
      worktreePath: path,
      changedFiles: [],
      selectedFile: null,
      selectedFileDiff: null,
      error: null,
    });
    if (path) {
      void get().refreshChanges();
    }
  },

  refreshChanges: async () => {
    const { worktreePath, changedFiles: existing } = get();
    if (!worktreePath) return;
    // Only show loading spinner on first fetch (when list is empty)
    if (existing.length === 0) {
      set({ loading: true, error: null });
    }
    try {
      const [files, sync] = await Promise.all([
        getChangedFiles(worktreePath),
        getSyncStatus(worktreePath),
      ]);
      set({ changedFiles: files, loading: false, error: null, syncStatus: sync });
    } catch (err) {
      const msg = String(err);
      // Don't log as error if worktree was simply cleaned up
      if (!msg.includes("No such file or directory")) {
        console.error("[gitStore] Failed to get changes:", err);
      }
      set({ loading: false, error: msg, successMessage: null, successUrl: null });
    }
  },

  stageFiles: async (paths: string[]) => {
    const { worktreePath } = get();
    if (!worktreePath) return;
    try {
      await gitStageFiles(worktreePath, paths);
      await get().refreshChanges();
    } catch (err) {
      set({ error: formatError(err), successMessage: null, successUrl: null });
    }
  },

  unstageFiles: async (paths: string[]) => {
    const { worktreePath } = get();
    if (!worktreePath) return;
    try {
      await gitUnstageFiles(worktreePath, paths);
      await get().refreshChanges();
    } catch (err) {
      set({ error: formatError(err), successMessage: null, successUrl: null });
    }
  },

  discardFiles: async (paths: string[]) => {
    const { worktreePath } = get();
    if (!worktreePath) return;
    try {
      await gitDiscardFiles(worktreePath, paths);
      await get().refreshChanges();
    } catch (err) {
      set({ error: formatError(err), successMessage: null, successUrl: null });
    }
  },

  selectFile: async (path: string, staged: boolean) => {
    const { worktreePath } = get();
    if (!worktreePath) return;
    set({ selectedFile: path, selectedFileStaged: staged });
    try {
      const diff = await getFileDiff(worktreePath, path, staged);
      set({ selectedFileDiff: diff });
      if (diff) {
        useEditorStore.getState().openDiff(path, diff);
      }
    } catch (err) {
      console.error("[gitStore] Failed to get diff:", err);
      set({ selectedFileDiff: null });
    }
  },

  clearSelection: () => set({ selectedFile: null, selectedFileDiff: null }),

  setCommitMessage: (msg: string) => set({ commitMessage: msg }),

  commitAndPush: async () => {
    const { worktreePath, commitMessage } = get();
    if (!worktreePath || !commitMessage.trim()) return;
    set({ pushing: true, error: null, successMessage: null, successUrl: null });
    try {
      const result = await gitCommitAndPush({ worktreePath, message: commitMessage });
      set({
        commitMessage: "",
        pushing: false,
        successMessage: `Committed and pushed ${result.shortHash}`,
        successUrl: result.commitUrl,
      });
      await get().refreshChanges();
    } catch (err) {
      set({ pushing: false, error: formatError(err), successMessage: null, successUrl: null });
    }
  },

  commit: async () => {
    const { worktreePath, commitMessage, syncStatus } = get();
    if (!worktreePath || !commitMessage.trim()) return;
    set({ committing: true, error: null, successMessage: null, successUrl: null });
    try {
      await gitCommit(worktreePath, commitMessage);
      const unpushed = (syncStatus?.ahead ?? 0) + 1;
      const hint = syncStatus?.hasUpstream === false
        ? "Committed locally — push to publish branch"
        : `Committed locally — ${unpushed} unpushed`;
      set({ commitMessage: "", committing: false, successMessage: hint, successUrl: null });
      await get().refreshChanges();
    } catch (err) {
      set({ committing: false, error: formatError(err), successMessage: null, successUrl: null });
    }
  },

  push: async () => {
    const { worktreePath, syncStatus } = get();
    if (!worktreePath) return;
    const count = syncStatus?.ahead ?? 0;
    set({ pushing: true, error: null, successMessage: null, successUrl: null });
    try {
      const result = await gitPush(worktreePath);
      const msg = count > 0
        ? `Pushed ${count} commit${count === 1 ? "" : "s"} — ${result.shortHash}`
        : `Pushed ${result.shortHash}`;
      set({ pushing: false, successMessage: msg, successUrl: result.commitUrl });
      await get().refreshChanges();
    } catch (err) {
      set({ pushing: false, error: formatError(err), successMessage: null, successUrl: null });
    }
  },
}));
