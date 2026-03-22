import { useState, useEffect, useCallback, type DependencyList } from "react";
import { formatError } from "../lib/errors";

export interface AsyncState<T> {
  data: T | null;
  loading: boolean;
  error: string | null;
}

/**
 * Runs an async factory function and tracks loading / error / data states.
 * Re-runs whenever `deps` change (same semantics as useEffect deps).
 *
 * @param factory  A function that returns a Promise<T>. Pass a stable reference
 *                 (e.g. useCallback) or accept the re-run on every render.
 * @param deps     Dependency array — the factory is re-invoked when any dep changes.
 */
export function useAsync<T>(
  factory: () => Promise<T>,
  deps: DependencyList,
): AsyncState<T> & { reload: () => void } {
  const [state, setState] = useState<AsyncState<T>>({
    data: null,
    loading: true,
    error: null,
  });

  const run = useCallback(() => {
    let cancelled = false;
    setState((prev) => ({ ...prev, loading: true, error: null }));

    factory()
      .then((data) => {
        if (!cancelled) setState({ data, loading: false, error: null });
      })
      .catch((err: unknown) => {
        if (!cancelled) setState({ data: null, loading: false, error: formatError(err) });
      });

    return () => {
      cancelled = true;
    };
    // factory is intentionally excluded; callers control re-runs via deps
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);

  useEffect(() => {
    return run();
  }, [run]);

  return { ...state, reload: run };
}
