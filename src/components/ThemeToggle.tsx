import { useThemeStore, type ThemePreference } from "../stores/themeStore";

const CYCLE: { value: ThemePreference; icon: string; title: string }[] = [
  { value: "light", icon: "☀️", title: "Light mode" },
  { value: "dark", icon: "🌙", title: "Dark mode" },
  { value: "system", icon: "💻", title: "System theme" },
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
      className="rounded-md px-2 py-1.5 text-base transition-colors hover:bg-gray-100 dark:hover:bg-gray-800/50"
      title={current.title}
    >
      {current.icon}
    </button>
  );
}
