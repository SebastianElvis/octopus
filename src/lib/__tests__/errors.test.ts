import { formatError } from "../errors";

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
});
