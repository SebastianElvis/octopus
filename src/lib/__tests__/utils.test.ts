import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { timeAgo, parseDiff } from "../utils";

describe("timeAgo", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("returns seconds ago for timestamps under 60s", () => {
    const now = Date.now();
    vi.setSystemTime(now);
    expect(timeAgo(now - 30_000)).toBe("30s ago");
  });

  it("returns minutes ago for timestamps under 1h", () => {
    const now = Date.now();
    vi.setSystemTime(now);
    expect(timeAgo(now - 5 * 60_000)).toBe("5m ago");
  });

  it("returns hours ago for timestamps under 24h", () => {
    const now = Date.now();
    vi.setSystemTime(now);
    expect(timeAgo(now - 3 * 3_600_000)).toBe("3h ago");
  });

  it("returns days ago for timestamps over 24h", () => {
    const now = Date.now();
    vi.setSystemTime(now);
    expect(timeAgo(now - 2 * 86_400_000)).toBe("2d ago");
  });

  it("returns 0s ago for same timestamp", () => {
    const now = Date.now();
    vi.setSystemTime(now);
    expect(timeAgo(now)).toBe("0s ago");
  });
});

describe("parseDiff", () => {
  const SAMPLE_DIFF = `diff --git a/src/foo.ts b/src/foo.ts
index abc1234..def5678 100644
--- a/src/foo.ts
+++ b/src/foo.ts
@@ -1,4 +1,5 @@
 import { bar } from "./bar";
-const x = 1;
+const x = 2;
+const y = 3;
 export { x };
`;

  it("parses a single-file diff", () => {
    const files = parseDiff(SAMPLE_DIFF);
    expect(files).toHaveLength(1);
    expect(files[0].oldPath).toBe("src/foo.ts");
    expect(files[0].newPath).toBe("src/foo.ts");
  });

  it("counts additions and deletions correctly", () => {
    const files = parseDiff(SAMPLE_DIFF);
    expect(files[0].additions).toBe(2);
    expect(files[0].deletions).toBe(1);
  });

  it("parses diff lines with correct types", () => {
    const files = parseDiff(SAMPLE_DIFF);
    const lines = files[0].lines;
    const types = lines.map((l) => l.type);
    expect(types).toContain("header");
    expect(types).toContain("add");
    expect(types).toContain("remove");
    expect(types).toContain("context");
  });

  it("returns empty array for empty input", () => {
    expect(parseDiff("")).toEqual([]);
  });

  it("parses multiple files", () => {
    const multiDiff = `diff --git a/a.ts b/a.ts
--- a/a.ts
+++ b/a.ts
@@ -1,1 +1,1 @@
-old
+new
diff --git a/b.ts b/b.ts
--- a/b.ts
+++ b/b.ts
@@ -1,1 +1,1 @@
-foo
+bar
`;
    const files = parseDiff(multiDiff);
    expect(files).toHaveLength(2);
    expect(files[0].oldPath).toBe("a.ts");
    expect(files[1].oldPath).toBe("b.ts");
  });
});
