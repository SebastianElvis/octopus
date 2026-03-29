import { useThemeStore, type ThemePreference } from "../stores/themeStore";

const CYCLE: { value: ThemePreference; label: string; title: string }[] = [
  { value: "light", label: "○", title: "Light mode" },
  { value: "dark", label: "●", title: "Dark mode" },
  { value: "system", label: "◐", title: "System theme" },
];

export function ThemeToggle() {
  const theme = useThemeStore((s) => s.theme);
  const setTheme = useThemeStore((s) => s.setTheme);

  const idx = CYCLE.findIndex((o) => o.value === theme);
  const current = CYCLE[idx >= 0 ? idx : 2];
  const next = CYCLE[(idx + 1) % CYCLE.length];

  return (
    <button
      onClick={() => setTheme(next.value)}
      className="rounded-sm px-2 py-1.5 text-base transition-colors hover:bg-hover"
      title={current.title}
    >
      {current.label}
    </button>
  );
}
