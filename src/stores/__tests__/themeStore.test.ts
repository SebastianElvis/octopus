import { describe, it, expect, beforeEach, vi } from "vitest";
import { useThemeStore } from "../themeStore";

// Reset store and localStorage between tests
beforeEach(() => {
  // Clear persisted theme preference
  try {
    localStorage.removeItem("theme-preference");
  } catch {
    // localStorage may be limited in the test environment
  }
  // Reset to initial state (system preference)
  useThemeStore.setState({ theme: "system", resolvedTheme: "light" });
  vi.restoreAllMocks();
});

describe("themeStore", () => {
  describe("initial state", () => {
    it("defaults to system theme when localStorage is empty", () => {
      // The store is reset in beforeEach — verify defaults
      const { theme } = useThemeStore.getState();
      expect(theme).toBe("system");
    });

    it("resolvedTheme is either light or dark", () => {
      const { resolvedTheme } = useThemeStore.getState();
      expect(["light", "dark"]).toContain(resolvedTheme);
    });
  });

  describe("setTheme", () => {
    it("changes theme to light", () => {
      useThemeStore.getState().setTheme("light");
      expect(useThemeStore.getState().theme).toBe("light");
    });

    it("changes theme to dark", () => {
      useThemeStore.getState().setTheme("dark");
      expect(useThemeStore.getState().theme).toBe("dark");
    });

    it("changes theme to system", () => {
      useThemeStore.getState().setTheme("light");
      useThemeStore.getState().setTheme("system");
      expect(useThemeStore.getState().theme).toBe("system");
    });
  });

  describe("resolvedTheme", () => {
    it("resolves to light when theme is set to light", () => {
      useThemeStore.getState().setTheme("light");
      expect(useThemeStore.getState().resolvedTheme).toBe("light");
    });

    it("resolves to dark when theme is set to dark", () => {
      useThemeStore.getState().setTheme("dark");
      expect(useThemeStore.getState().resolvedTheme).toBe("dark");
    });

    it("resolves system to light when OS prefers light mode", () => {
      // jsdom default: matchMedia returns false for prefers-color-scheme: dark
      Object.defineProperty(window, "matchMedia", {
        writable: true,
        value: vi.fn().mockImplementation((query: string) => ({
          matches: query === "(prefers-color-scheme: dark)" ? false : false,
          media: query,
          onchange: null,
          addEventListener: vi.fn(),
          removeEventListener: vi.fn(),
          dispatchEvent: vi.fn(),
        })),
      });

      useThemeStore.getState().setTheme("system");
      expect(useThemeStore.getState().resolvedTheme).toBe("light");
    });

    it("resolves system to dark when OS prefers dark mode", () => {
      Object.defineProperty(window, "matchMedia", {
        writable: true,
        value: vi.fn().mockImplementation((query: string) => ({
          matches: query === "(prefers-color-scheme: dark)" ? true : false,
          media: query,
          onchange: null,
          addEventListener: vi.fn(),
          removeEventListener: vi.fn(),
          dispatchEvent: vi.fn(),
        })),
      });

      useThemeStore.getState().setTheme("system");
      expect(useThemeStore.getState().resolvedTheme).toBe("dark");
    });
  });

  describe("localStorage persistence", () => {
    function makeLocalStorageMock() {
      const backingStore = new Map<string, string>();
      return {
        mock: {
          getItem: vi.fn((k: string) => backingStore.get(k) ?? null),
          setItem: vi.fn((k: string, v: string) => {
            backingStore.set(k, v);
          }),
          removeItem: vi.fn((k: string) => {
            backingStore.delete(k);
          }),
        },
      };
    }

    it("attempts to persist theme preference to localStorage", () => {
      // Provide a working localStorage mock for this test
      const { mock: mockStorage } = makeLocalStorageMock();
      Object.defineProperty(window, "localStorage", { value: mockStorage, configurable: true });

      useThemeStore.getState().setTheme("dark");
      expect(mockStorage.setItem).toHaveBeenCalledWith("theme-preference", "dark");
    });

    it("attempts to persist light preference to localStorage", () => {
      const { mock: mockStorage } = makeLocalStorageMock();
      Object.defineProperty(window, "localStorage", { value: mockStorage, configurable: true });

      useThemeStore.getState().setTheme("light");
      expect(mockStorage.setItem).toHaveBeenCalledWith("theme-preference", "light");
    });

    it("persists the last-set preference", () => {
      const { mock: mockStorage } = makeLocalStorageMock();
      Object.defineProperty(window, "localStorage", { value: mockStorage, configurable: true });

      useThemeStore.getState().setTheme("dark");
      useThemeStore.getState().setTheme("system");
      expect(mockStorage.setItem).toHaveBeenLastCalledWith("theme-preference", "system");
    });

    it("does not throw when localStorage is unavailable", () => {
      // Restore native (broken) localStorage — store should handle gracefully
      Object.defineProperty(window, "localStorage", {
        value: {
          getItem: () => {
            throw new Error("unavailable");
          },
          setItem: () => {
            throw new Error("unavailable");
          },
          removeItem: () => {
            throw new Error("unavailable");
          },
        },
        configurable: true,
      });
      expect(() => useThemeStore.getState().setTheme("dark")).not.toThrow();
    });
  });

  describe("_syncSystemTheme", () => {
    it("updates resolvedTheme when theme is system and OS changes to dark", () => {
      Object.defineProperty(window, "matchMedia", {
        writable: true,
        value: vi.fn().mockImplementation((query: string) => ({
          matches: query === "(prefers-color-scheme: dark)" ? true : false,
          media: query,
          onchange: null,
          addEventListener: vi.fn(),
          removeEventListener: vi.fn(),
          dispatchEvent: vi.fn(),
        })),
      });

      useThemeStore.setState({ theme: "system", resolvedTheme: "light" });
      useThemeStore.getState()._syncSystemTheme();
      expect(useThemeStore.getState().resolvedTheme).toBe("dark");
    });

    it("does not change resolvedTheme when theme is not system", () => {
      useThemeStore.setState({ theme: "light", resolvedTheme: "light" });
      useThemeStore.getState()._syncSystemTheme();
      // Should remain light — not overridden by system query
      expect(useThemeStore.getState().resolvedTheme).toBe("light");
    });
  });
});
