/**
 * Runtime environment detection.
 *
 * When running inside a Tauri webview `window.__TAURI_INTERNALS__` is defined.
 * When running in a plain browser (`vite dev` without Tauri), it isn't — so
 * every call to `@tauri-apps/api` would blow up with
 *   "Cannot read properties of undefined (reading 'transformCallback')"
 *
 * We expose a single predicate and safe wrappers so the rest of the app can
 * run in both contexts without try/catch noise everywhere.
 */

declare global {
  interface Window {
    __TAURI_INTERNALS__?: unknown;
  }
}

/** True when running inside the Tauri webview. */
export function isTauri(): boolean {
  return typeof window !== "undefined" && window.__TAURI_INTERNALS__ !== undefined;
}
