import { create } from "zustand";
import { listDir } from "../lib/tauri";
import type { FileEntry } from "../lib/types";

interface FileBrowserState {
  rootPath: string | null;
  expandedDirs: Set<string>;
  entries: Record<string, FileEntry[]>;
  loading: Record<string, boolean>;

  setRootPath: (path: string) => void;
  toggleDir: (path: string) => Promise<void>;
  refreshDir: (path: string) => Promise<void>;
  loadDir: (path: string) => Promise<void>;
}

export const useFileBrowserStore = create<FileBrowserState>((set, get) => ({
  rootPath: null,
  expandedDirs: new Set<string>(),
  entries: {},
  loading: {},

  setRootPath: (path: string) => {
    set({ rootPath: path, expandedDirs: new Set(), entries: {}, loading: {} });
    void get().loadDir(path);
  },

  loadDir: async (path: string) => {
    set((s) => ({ loading: { ...s.loading, [path]: true } }));
    try {
      const entries = await listDir(path);
      set((s) => ({
        entries: { ...s.entries, [path]: entries },
        loading: { ...s.loading, [path]: false },
      }));
    } catch (err) {
      console.error("[fileBrowserStore] Failed to load dir:", err);
      set((s) => ({ loading: { ...s.loading, [path]: false } }));
    }
  },

  toggleDir: async (path: string) => {
    const state = get();
    const newExpanded = new Set(state.expandedDirs);
    if (newExpanded.has(path)) {
      newExpanded.delete(path);
      set({ expandedDirs: newExpanded });
    } else {
      newExpanded.add(path);
      set({ expandedDirs: newExpanded });
      if (!state.entries[path]) {
        await state.loadDir(path);
      }
    }
  },

  refreshDir: async (path: string) => {
    await get().loadDir(path);
  },
}));
