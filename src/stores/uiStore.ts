import { create } from "zustand";

interface PanelSizes {
  sidebarWidth: number;
  rightPanelWidth: number;
  terminalHeight: number; // percentage of center panel
  rightOutputHeight: number; // height of the output panel in the right column (px)
}

type RightPanelTab = "files" | "changes";

interface UIState {
  panelSizes: PanelSizes;
  rightPanelTab: RightPanelTab;
  rightPanelCollapsed: boolean;
  sidebarCollapsed: boolean;
  soundEnabled: boolean;

  setPanelSize: (key: keyof PanelSizes, value: number) => void;
  setRightPanelTab: (tab: RightPanelTab) => void;
  toggleRightPanel: () => void;
  toggleSidebar: () => void;
  toggleSound: () => void;
}

const STORAGE_KEY = "tmt-panel-sizes";

function loadSizes(): PanelSizes {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return JSON.parse(raw) as PanelSizes;
  } catch {
    /* ignore */
  }
  return { sidebarWidth: 240, rightPanelWidth: 320, terminalHeight: 60, rightOutputHeight: 200 };
}

function saveSizes(sizes: PanelSizes) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(sizes));
  } catch {
    /* ignore */
  }
}

function loadSoundPref(): boolean {
  try {
    const val = localStorage.getItem("tmt-sound-enabled");
    return val === null ? true : val === "true";
  } catch { return true; }
}

export const useUIStore = create<UIState>((set, get) => ({
  panelSizes: loadSizes(),
  rightPanelTab: "changes",
  rightPanelCollapsed: false,
  sidebarCollapsed: false,
  soundEnabled: loadSoundPref(),

  setPanelSize: (key, value) => {
    const newSizes = { ...get().panelSizes, [key]: value };
    saveSizes(newSizes);
    set({ panelSizes: newSizes });
  },

  setRightPanelTab: (tab) => set({ rightPanelTab: tab, rightPanelCollapsed: false }),
  toggleRightPanel: () => set((s) => ({ rightPanelCollapsed: !s.rightPanelCollapsed })),
  toggleSidebar: () => set((s) => ({ sidebarCollapsed: !s.sidebarCollapsed })),
  toggleSound: () => {
    const next = !get().soundEnabled;
    try { localStorage.setItem("tmt-sound-enabled", String(next)); } catch { /* ignore */ }
    set({ soundEnabled: next });
  },
}));
