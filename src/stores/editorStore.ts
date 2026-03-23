import { create } from "zustand";
import { readFile } from "../lib/tauri";
import type { EditorTab } from "../lib/types";

function detectLanguage(filePath: string): string {
  const ext = filePath.split(".").pop()?.toLowerCase() ?? "";
  const map: Record<string, string> = {
    ts: "typescript", tsx: "typescript", js: "javascript", jsx: "javascript",
    rs: "rust", py: "python", go: "go", rb: "ruby",
    json: "json", yaml: "yaml", yml: "yaml", toml: "toml",
    md: "markdown", mdx: "markdown",
    html: "html", htm: "html", css: "css", scss: "css",
    sh: "shell", bash: "shell", zsh: "shell",
    sql: "sql", java: "java", kt: "kotlin", swift: "swift",
    c: "c", cpp: "cpp", h: "c", hpp: "cpp",
    xml: "xml", svg: "xml",
  };
  return map[ext] ?? "text";
}

interface EditorState {
  tabs: EditorTab[];
  activeTabId: string | null;
  contents: Record<string, string>;
  loading: boolean;

  openFile: (filePath: string) => Promise<void>;
  closeTab: (id: string) => void;
  setActiveTab: (id: string) => void;
  closeAllTabs: () => void;
}

export const useEditorStore = create<EditorState>((set, get) => ({
  tabs: [],
  activeTabId: null,
  contents: {},
  loading: false,

  openFile: async (filePath: string) => {
    const state = get();
    const existing = state.tabs.find((t) => t.id === filePath);
    if (existing) {
      set({ activeTabId: filePath });
      return;
    }

    set({ loading: true });
    try {
      const content = await readFile(filePath);
      const fileName = filePath.split("/").pop() ?? filePath;
      const tab: EditorTab = {
        id: filePath,
        filePath,
        fileName,
        language: detectLanguage(filePath),
        isDirty: false,
      };
      set((s) => ({
        tabs: [...s.tabs, tab],
        activeTabId: filePath,
        contents: { ...s.contents, [filePath]: content },
        loading: false,
      }));
    } catch (err) {
      console.error("[editorStore] Failed to open file:", err);
      set({ loading: false });
    }
  },

  closeTab: (id: string) => {
    set((s) => {
      const newTabs = s.tabs.filter((t) => t.id !== id);
      const newContents = { ...s.contents };
      delete newContents[id];
      const newActiveId =
        s.activeTabId === id
          ? newTabs.length > 0
            ? newTabs[newTabs.length - 1].id
            : null
          : s.activeTabId;
      return { tabs: newTabs, activeTabId: newActiveId, contents: newContents };
    });
  },

  setActiveTab: (id: string) => set({ activeTabId: id }),

  closeAllTabs: () => set({ tabs: [], activeTabId: null, contents: {} }),
}));
