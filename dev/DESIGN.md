## Design Context

### Users
Power users of Claude Code who need to run many AI sessions in parallel. Core audience includes ADHD developers who benefit from calm, focused interfaces that reduce cognitive load. They want to dispatch, monitor, and coordinate multiple sessions without distraction. The app should feel like a quiet control room — essential information visible at a glance, everything else out of the way.

### Brand Personality
**Calm focus. Fast execution. Zero noise.**

The interface should feel like it keeps up with the user without overwhelming them. No unnecessary friction, no slow animations, no hidden states — but also no clutter, no competing signals, no visual noise. Minimal is a feature: show only what matters, hide what doesn't. The UI should reward fast switching while keeping the mind clear.

### Aesthetic Direction
- **Sharp and minimal** — utilitarian, not decorative. Every element earns its space
- **Dark-theme-first** — dark mode is the primary experience; light mode is supported but secondary
- **Monospace everywhere** — JetBrains Mono as the universal typeface reinforces the developer-tool identity
- **Borders over shadows** — 1px subtle outlines instead of soft shadows; `rounded-sm` over `rounded-lg`
- **Status-color-driven:** Cyan (running), gold (attention), green (done) — consistent, scannable, instant recognition
- **Minimal layouts** — show the essential state of each session cleanly; progressive disclosure for details
- **Yin-yang brand mark** (cyan + gold) — balance of many things in motion
- **OKLCH color space** — perceptually uniform colors with `color-mix()` for programmatic variants

### Design Principles

1. **Minimal over dense** — Show only what the user needs to make a decision. Whitespace is not waste — it reduces cognitive load. A user should know the state of 10+ sessions at a glance because each card is clean and scannable, not because everything is crammed in.

2. **Zero-friction interaction** — Command palette (Cmd+K), keyboard shortcuts, inline actions on hover, auto-generated defaults. Never make the user fill out a form when a smart default will do. Reduce clicks to reach any action.

3. **Keep up with the user** — Fast transitions (< 200ms), no blocking modals where inline will do, streaming updates, subtle pulse on active work. The UI should never feel like it's making the user wait.

4. **Consistent status language** — The color system (cyan/gold/green + block-type variants) is sacred. Every component that shows state must use `statusColors.ts` as the single source of truth. New states get new entries there, not ad-hoc colors.

5. **Dark-first, contrast-aware** — Design for dark backgrounds first. All CSS custom properties default to dark-mode values. Light mode adapts via `.light` class override, not the other way around. WCAG AA minimum contrast throughout.

6. **Alive but calm** — Subtle motion communicates state: a glow on streaming sessions, a flash on status changes, staggered card entrance. But never competing animations, never distracting movement. Respect `prefers-reduced-motion` always.
