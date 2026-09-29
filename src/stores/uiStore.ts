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
  terminalFontSize: number;
  activeSessionId: string | null;
  verboseMode: boolean;
  showShortcuts: boolean;

  setPanelSize: (key: keyof PanelSizes, value: number) => void;
  setRightPanelTab: (tab: RightPanelTab) => void;
  toggleRightPanel: () => void;
  toggleSidebar: () => void;
  toggleSound: () => void;
  setTerminalFontSize: (size: number) => void;
  setActiveSessionId: (id: string | null) => void;
  toggleVerboseMode: () => void;
  setVerboseMode: (enabled: boolean) => void;
  setShowShortcuts: (open: boolean) => void;
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

function loadTerminalFontSize(): number {
  try {
    const val = localStorage.getItem("tmt-terminal-font-size");
    if (val) {
      const n = parseInt(val, 10);
      if (!isNaN(n) && n >= 8 && n <= 24) return n;
    }
  } catch {
    /* ignore */
  }
  return 13;
}

function loadSoundPref(): boolean {
  try {
    const val = localStorage.getItem("tmt-sound-enabled");
    return val === null ? true : val === "true";
  } catch {
    return true;
  }
}

function loadVerboseMode(): boolean {
  try {
    const val = localStorage.getItem("tmt-verbose-mode");
    return val === "true";
  } catch {
    return false;
  }
}

export const useUIStore = create<UIState>((set, get) => ({
  panelSizes: loadSizes(),
  rightPanelTab: "changes",
  rightPanelCollapsed: false,
  sidebarCollapsed: false,
  soundEnabled: loadSoundPref(),
  terminalFontSize: loadTerminalFontSize(),
  activeSessionId: null,
  verboseMode: loadVerboseMode(),
  showShortcuts: false,

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
    try {
      localStorage.setItem("tmt-sound-enabled", String(next));
    } catch {
      /* ignore */
    }
    set({ soundEnabled: next });
  },
  setTerminalFontSize: (size: number) => {
    try {
      localStorage.setItem("tmt-terminal-font-size", String(size));
    } catch {
      /* ignore */
    }
    set({ terminalFontSize: size });
  },
  setActiveSessionId: (id) => set({ activeSessionId: id }),
  toggleVerboseMode: () => {
    const next = !get().verboseMode;
    try {
      localStorage.setItem("tmt-verbose-mode", String(next));
    } catch {
      /* ignore */
    }
    set({ verboseMode: next });
  },
  setVerboseMode: (enabled) => {
    try {
      localStorage.setItem("tmt-verbose-mode", String(enabled));
    } catch {
      /* ignore */
    }
    set({ verboseMode: enabled });
  },
  setShowShortcuts: (open) => set({ showShortcuts: open }),
}));
