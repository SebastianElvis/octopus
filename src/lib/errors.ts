export interface StructuredError {
  code: string;
  message: string;
}

export function isStructuredError(err: unknown): err is StructuredError {
  return (
    typeof err === "object" &&
    err !== null &&
    "code" in err &&
    "message" in err &&
    typeof (err as Record<string, unknown>).code === "string" &&
    typeof (err as Record<string, unknown>).message === "string"
  );
}

export function getErrorCode(err: unknown): string | null {
  if (isStructuredError(err)) return err.code;
  return null;
}

/** Check if error is a GitHub auth failure (needs re-auth). */
export function isAuthError(err: unknown): boolean {
  const code = getErrorCode(err);
  return code === "AUTH_FAILED" || code === "GITHUB_AUTH_FAILED";
}

/** Check if error is a rate limit (should auto-retry). */
export function isRateLimited(err: unknown): boolean {
  return getErrorCode(err) === "RATE_LIMITED";
}

/** Check if error is retryable (rate limit, server error, network). */
export function isRetryable(err: unknown): boolean {
  const code = getErrorCode(err);
  return code === "RATE_LIMITED" || code === "HTTP_ERROR";
}

/**
 * Safely extracts a human-readable message from an unknown thrown value.
 * Handles structured errors, Error objects, Tauri error strings, plain strings, and anything else.
 */
export function formatError(err: unknown): string {
  if (isStructuredError(err)) {
    return err.message;
  }
  if (err instanceof Error) {
    return err.message;
  }
  if (typeof err === "string") {
    return err;
  }
  if (
    typeof err === "object" &&
    err !== null &&
    "message" in err &&
    typeof (err as Record<string, unknown>).message === "string"
  ) {
    return (err as Record<string, unknown>).message as string;
  }
  try {
    return JSON.stringify(err);
  } catch {
    return "An unknown error occurred.";
  }
}
