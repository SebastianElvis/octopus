import { create } from "zustand";
import {
  getChangedFiles,
  gitStageFiles,
  gitUnstageFiles,
  gitDiscardFiles,
  getFileDiff,
  gitCommitAndPush,
  gitCommit,
  gitPush,
} from "../lib/tauri";
import type { ChangedFile } from "../lib/types";

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
    const { worktreePath } = get();
    if (!worktreePath) return;
    set({ loading: true, error: null });
    try {
      const files = await getChangedFiles(worktreePath);
      set({ changedFiles: files, loading: false });
    } catch (err) {
      const msg = String(err);
      // Don't log as error if worktree was simply cleaned up
      if (!msg.includes("No such file or directory")) {
        console.error("[gitStore] Failed to get changes:", err);
      }
      set({ loading: false, error: msg });
    }
  },

  stageFiles: async (paths: string[]) => {
    const { worktreePath } = get();
    if (!worktreePath) return;
    try {
      await gitStageFiles(worktreePath, paths);
      await get().refreshChanges();
    } catch (err) {
      set({ error: String(err) });
    }
  },

  unstageFiles: async (paths: string[]) => {
    const { worktreePath } = get();
    if (!worktreePath) return;
    try {
      await gitUnstageFiles(worktreePath, paths);
      await get().refreshChanges();
    } catch (err) {
      set({ error: String(err) });
    }
  },

  discardFiles: async (paths: string[]) => {
    const { worktreePath } = get();
    if (!worktreePath) return;
    try {
      await gitDiscardFiles(worktreePath, paths);
      await get().refreshChanges();
    } catch (err) {
      set({ error: String(err) });
    }
  },

  selectFile: async (path: string, staged: boolean) => {
    const { worktreePath } = get();
    if (!worktreePath) return;
    set({ selectedFile: path, selectedFileStaged: staged });
    try {
      const diff = await getFileDiff(worktreePath, path, staged);
      set({ selectedFileDiff: diff });
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
    set({ pushing: true, error: null });
    try {
      await gitCommitAndPush({ worktreePath, message: commitMessage });
      set({ commitMessage: "", pushing: false });
      await get().refreshChanges();
    } catch (err) {
      set({ pushing: false, error: String(err) });
    }
  },

  commit: async () => {
    const { worktreePath, commitMessage } = get();
    if (!worktreePath || !commitMessage.trim()) return;
    set({ committing: true, error: null });
    try {
      await gitCommit(worktreePath, commitMessage);
      set({ commitMessage: "", committing: false });
      await get().refreshChanges();
    } catch (err) {
      set({ committing: false, error: String(err) });
    }
  },

  push: async () => {
    const { worktreePath } = get();
    if (!worktreePath) return;
    set({ pushing: true, error: null });
    try {
      await gitPush(worktreePath);
      set({ pushing: false });
    } catch (err) {
      set({ pushing: false, error: String(err) });
    }
  },
}));
