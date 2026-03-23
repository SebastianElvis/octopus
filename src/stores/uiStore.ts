import { create } from "zustand";

interface PanelSizes {
  sidebarWidth: number;
  rightPanelWidth: number;
  terminalHeight: number; // percentage of center panel
}

type RightPanelTab = "files" | "changes" | "github";

interface UIState {
  panelSizes: PanelSizes;
  rightPanelTab: RightPanelTab;
  rightPanelCollapsed: boolean;
  sidebarCollapsed: boolean;

  setPanelSize: (key: keyof PanelSizes, value: number) => void;
  setRightPanelTab: (tab: RightPanelTab) => void;
  toggleRightPanel: () => void;
  toggleSidebar: () => void;
}

const STORAGE_KEY = "tmt-panel-sizes";

function loadSizes(): PanelSizes {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return JSON.parse(raw) as PanelSizes;
  } catch {
    /* ignore */
  }
  return { sidebarWidth: 240, rightPanelWidth: 320, terminalHeight: 60 };
}

function saveSizes(sizes: PanelSizes) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(sizes));
  } catch {
    /* ignore */
  }
}

export const useUIStore = create<UIState>((set, get) => ({
  panelSizes: loadSizes(),
  rightPanelTab: "changes",
  rightPanelCollapsed: false,
  sidebarCollapsed: false,

  setPanelSize: (key, value) => {
    const newSizes = { ...get().panelSizes, [key]: value };
    saveSizes(newSizes);
    set({ panelSizes: newSizes });
  },

  setRightPanelTab: (tab) => set({ rightPanelTab: tab, rightPanelCollapsed: false }),
  toggleRightPanel: () => set((s) => ({ rightPanelCollapsed: !s.rightPanelCollapsed })),
  toggleSidebar: () => set((s) => ({ sidebarCollapsed: !s.sidebarCollapsed })),
}));
