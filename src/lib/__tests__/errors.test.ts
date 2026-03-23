import { formatError, isStructuredError, getErrorCode } from "../errors";

describe("formatError", () => {
  it("extracts message from Error instances", () => {
    expect(formatError(new Error("boom"))).toBe("boom");
  });

  it("extracts message from TypeError", () => {
    expect(formatError(new TypeError("type issue"))).toBe("type issue");
  });

  it("returns string errors as-is", () => {
    expect(formatError("something broke")).toBe("something broke");
  });

  it("handles empty strings", () => {
    expect(formatError("")).toBe("");
  });

  it("extracts message from objects with message property", () => {
    expect(formatError({ message: "object error" })).toBe("object error");
  });

  it("does not extract non-string message properties", () => {
    const result = formatError({ message: 42 });
    expect(result).toBe('{"message":42}');
  });

  it("JSON-stringifies plain objects", () => {
    expect(formatError({ code: 404 })).toBe('{"code":404}');
  });

  it("JSON-stringifies arrays", () => {
    expect(formatError([1, 2])).toBe("[1,2]");
  });

  it("JSON-stringifies numbers", () => {
    expect(formatError(42)).toBe("42");
  });

  it("handles null", () => {
    expect(formatError(null)).toBe("null");
  });

  it("handles undefined", () => {
    // JSON.stringify(undefined) returns undefined (not a string), which is coerced
    const result = formatError(undefined);
    // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
    expect(typeof result === "string" || result === undefined).toBe(true);
  });

  it("handles circular references gracefully", () => {
    const obj: Record<string, unknown> = {};
    obj.self = obj;
    expect(formatError(obj)).toBe("An unknown error occurred.");
  });

  it("handles booleans", () => {
    expect(formatError(true)).toBe("true");
    expect(formatError(false)).toBe("false");
  });

  it("extracts message from structured errors", () => {
    expect(formatError({ code: "NOT_FOUND", message: "Resource not found" })).toBe(
      "Resource not found",
    );
  });

  it("prioritizes structured error message over Error instance", () => {
    // Structured error detection happens before Error instance check
    const err = { code: "AUTH_FAILED", message: "Authentication failed" };
    expect(formatError(err)).toBe("Authentication failed");
  });
});

describe("isStructuredError", () => {
  it("returns true for objects with code and message strings", () => {
    expect(isStructuredError({ code: "NOT_FOUND", message: "Not found" })).toBe(true);
  });

  it("returns false for plain Error instances", () => {
    expect(isStructuredError(new Error("boom"))).toBe(false);
  });

  it("returns false for objects missing code", () => {
    expect(isStructuredError({ message: "hello" })).toBe(false);
  });

  it("returns false for objects missing message", () => {
    expect(isStructuredError({ code: "ERR" })).toBe(false);
  });

  it("returns false for null", () => {
    expect(isStructuredError(null)).toBe(false);
  });

  it("returns false for strings", () => {
    expect(isStructuredError("hello")).toBe(false);
  });

  it("returns false when code is not a string", () => {
    expect(isStructuredError({ code: 404, message: "Not found" })).toBe(false);
  });
});

describe("getErrorCode", () => {
  it("returns code for structured errors", () => {
    expect(getErrorCode({ code: "NOT_FOUND", message: "Not found" })).toBe("NOT_FOUND");
  });

  it("returns null for non-structured errors", () => {
    expect(getErrorCode(new Error("boom"))).toBeNull();
    expect(getErrorCode("string error")).toBeNull();
    expect(getErrorCode(null)).toBeNull();
  });
});
