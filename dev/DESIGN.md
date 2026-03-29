## Design Context

### Users
Power users of Claude Code who need to run many AI sessions in parallel. Core audience includes ADHD developers who thrive on high-stimulus, fast-switching workflows. They want to dispatch, monitor, and coordinate multiple sessions without losing track of anything. The app should feel like a mission control center — everything visible, everything reachable, zero waiting.

### Brand Personality
**ADHD-native. Fast execution. Fast iteration.**

The interface should feel like it keeps up with a racing mind. No unnecessary friction, no slow animations, no hidden states. Information density is a feature, not a problem. The UI should reward fast switching and parallel thinking.

### Aesthetic Direction
- **Technical and utilitarian by design** — not polished for polish's sake, but sharp and functional
- **Dark-theme-first** — dark mode is the primary experience; light mode is supported but secondary
- **Monospace everywhere** — JetBrains Mono as the universal typeface reinforces the developer-tool identity
- **Reference:** Conductor (multi-session orchestration), pushed further toward extreme multitasking density
- **Status-color-driven:** Blue (running), amber (attention), green (done) — consistent, scannable, instant recognition
- **Information-dense layouts** — kanban cards, split panes, inline actions, badges, and pills pack maximum signal into minimum space
- **Yin-yang brand mark** (cyan + gold) — balance of many things in motion

### Design Principles

1. **Scannable over beautiful** — Every pixel should communicate state. Favor information density, status indicators, and at-a-glance comprehension over whitespace and decoration. A user should know the state of 10+ sessions without clicking anything.

2. **Zero-friction interaction** — Command palette (Cmd+K), keyboard shortcuts, inline actions on hover, auto-generated defaults. Never make the user fill out a form when a smart default will do. Reduce clicks to reach any action.

3. **Keep up with the user** — Fast transitions (< 200ms), no blocking modals where inline will do, streaming updates, pulse animations for active work. The UI should never feel like it's making the user wait.

4. **Consistent status language** — The color system (blue/amber/green + block-type variants) is sacred. Every component that shows state must use `statusColors.ts` as the single source of truth. New states get new entries there, not ad-hoc colors.

5. **Dark-first, contrast-aware** — Design for dark backgrounds first. Ensure all text, borders, and interactive elements have sufficient contrast in dark mode. Light mode adapts from dark, not the other way around.
