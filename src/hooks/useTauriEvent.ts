import { useEffect, type DependencyList } from "react";
import { formatError } from "../lib/errors";

/**
 * Subscribes to a Tauri event listener and automatically cleans up on unmount.
 *
 * @param subscribe  A function that calls `listen(...)` (or a wrapper like
 *                   `onSessionStateChanged`) and returns its unlisten Promise.
 * @param deps       Dependency array — the subscription is re-registered when
 *                   any dep changes (same semantics as useEffect).
 */
export function useTauriEvent(subscribe: () => Promise<() => void>, deps: DependencyList): void {
  useEffect(() => {
    let unlisten: (() => void) | undefined;
    let cancelled = false;

    subscribe()
      .then((fn) => {
        if (cancelled) {
          fn(); // already unmounted — immediately clean up
        } else {
          unlisten = fn;
        }
      })
      .catch((err: unknown) => {
        console.error("[useTauriEvent] Failed to subscribe:", formatError(err));
      });

    return () => {
      cancelled = true;
      unlisten?.();
    };
    // Callers control re-runs via deps
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
}
