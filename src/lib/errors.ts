/**
 * Safely extracts a human-readable message from an unknown thrown value.
 * Handles Error objects, Tauri error strings, plain strings, and anything else.
 */
export function formatError(err: unknown): string {
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
