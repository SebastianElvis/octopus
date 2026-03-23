import { useEffect } from "react";
import { useThemeStore } from "../stores/themeStore";

/**
 * Applies the resolved theme to the document root as a CSS class (`dark` or
 * nothing), and keeps it in sync when the OS preference changes.
 *
 * Call this once at the top of the component tree (e.g. in App.tsx).
 */
export function useTheme(): void {
  const resolvedTheme = useThemeStore((s) => s.resolvedTheme);
  const theme = useThemeStore((s) => s.theme);
  const syncSystemTheme = useThemeStore((s) => s._syncSystemTheme);

  // Apply / remove the `dark` class on <html>
  useEffect(() => {
    const root = document.documentElement;
    if (resolvedTheme === "dark") {
      root.classList.add("dark");
    } else {
      root.classList.remove("dark");
    }
  }, [resolvedTheme]);

  // Listen for OS-level preference changes when theme === "system"
  useEffect(() => {
    if (theme !== "system") return;

    const mql = window.matchMedia("(prefers-color-scheme: dark)");
    const handler = () => syncSystemTheme();
    mql.addEventListener("change", handler);
    return () => mql.removeEventListener("change", handler);
  }, [theme, syncSystemTheme]);
}
