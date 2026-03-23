import { create } from "zustand";

export type ThemePreference = "light" | "dark" | "system";
export type ResolvedTheme = "light" | "dark";

function getSystemTheme(): ResolvedTheme {
  if (typeof window === "undefined" || typeof window.matchMedia !== "function") return "light";
  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

function resolveTheme(preference: ThemePreference): ResolvedTheme {
  if (preference === "system") return getSystemTheme();
  return preference;
}

function loadPersistedTheme(): ThemePreference {
  try {
    const stored = localStorage.getItem("theme-preference");
    if (stored === "light" || stored === "dark" || stored === "system") {
      return stored;
    }
  } catch {
    // localStorage may be unavailable in some environments
  }
  return "system";
}

interface ThemeState {
  theme: ThemePreference;
  resolvedTheme: ResolvedTheme;

  // Actions
  setTheme: (theme: ThemePreference) => void;
  /** Called internally when the OS preference changes */
  _syncSystemTheme: () => void;
}

const initialPreference = loadPersistedTheme();

export const useThemeStore = create<ThemeState>((set, get) => ({
  theme: initialPreference,
  resolvedTheme: resolveTheme(initialPreference),

  setTheme: (theme) => {
    try {
      localStorage.setItem("theme-preference", theme);
    } catch {
      // ignore
    }
    set({ theme, resolvedTheme: resolveTheme(theme) });
  },

  _syncSystemTheme: () => {
    const { theme } = get();
    if (theme === "system") {
      set({ resolvedTheme: getSystemTheme() });
    }
  },
}));
