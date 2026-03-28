import { useCallback } from "react";
import { formatError, isAuthError, isRateLimited, isRetryable } from "../lib/errors";
import type { ToastItem } from "../components/Toast";

/** Error tier determines how the error is displayed to the user. */
export type ErrorTier = "inline" | "toast" | "modal";

/** Classify an error into a display tier based on its error code. */
export function classifyError(err: unknown): ErrorTier {
  if (isAuthError(err)) return "modal"; // Auth failures need user action
  if (isRateLimited(err)) return "toast"; // Rate limits are transient
  if (isRetryable(err)) return "toast"; // HTTP errors are transient
  return "toast"; // Default to toast for unknown errors
}

/** Build a toast item from an error, with appropriate type and duration. */
export function errorToToast(err: unknown, sessionId?: string): ToastItem {
  const message = isAuthError(err)
    ? "GitHub authentication failed. Run `gh auth login` to re-authenticate."
    : isRateLimited(err)
      ? "GitHub API rate limit reached. Retrying automatically…"
      : formatError(err);

  const type = isAuthError(err) ? "error" : isRetryable(err) ? "warning" : "error";
  const duration = isRateLimited(err) ? 8000 : isAuthError(err) ? 0 : 5000;

  return {
    id: `err-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    message,
    type,
    sessionId,
    duration,
  };
}

/**
 * Hook that returns a function to handle errors with appropriate notification.
 * Pass the returned handler to catch blocks instead of silently swallowing.
 */
export function useErrorNotification(
  addToast: (toast: ToastItem) => void,
): (err: unknown, sessionId?: string) => void {
  return useCallback(
    (err: unknown, sessionId?: string) => {
      const toast = errorToToast(err, sessionId);
      addToast(toast);
    },
    [addToast],
  );
}
