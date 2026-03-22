import type { DiffFile, DiffLine } from "./types";

export function timeAgo(timestamp: number): string {
  const now = Date.now();
  const diff = Math.floor((now - timestamp) / 1000);

  if (diff < 60) return `${String(diff)}s ago`;
  if (diff < 3600) return `${String(Math.floor(diff / 60))}m ago`;
  if (diff < 86400) return `${String(Math.floor(diff / 3600))}h ago`;
  return `${String(Math.floor(diff / 86400))}d ago`;
}

export function parseDiff(raw: string): DiffFile[] {
  const files: DiffFile[] = [];
  const fileChunks = raw.split(/^diff --git /m).filter(Boolean);

  for (const chunk of fileChunks) {
    const lines = chunk.split("\n");
    const headerLine = lines[0];
    const aMatch = headerLine.match(/a\/(.*?) b\//);
    const bMatch = headerLine.match(/b\/(.*)$/);
    const oldPath = aMatch ? aMatch[1] : "unknown";
    const newPath = bMatch ? bMatch[1] : "unknown";

    const diffLines: DiffLine[] = [];
    let additions = 0;
    let deletions = 0;
    let oldLineNo = 0;
    let newLineNo = 0;

    let bodyStarted = false;

    for (const line of lines.slice(1)) {
      if (line.startsWith("--- ") || line.startsWith("+++ ")) {
        continue;
      }

      if (line.startsWith("@@ ")) {
        const match = line.match(/@@ -(\d+)(?:,\d+)? \+(\d+)(?:,\d+)? @@/);
        if (match) {
          oldLineNo = parseInt(match[1], 10);
          newLineNo = parseInt(match[2], 10);
        }
        diffLines.push({ type: "header", content: line });
        bodyStarted = true;
        continue;
      }

      if (!bodyStarted) continue;

      if (line.startsWith("+")) {
        diffLines.push({
          type: "add",
          content: line.slice(1),
          newLineNo: newLineNo++,
        });
        additions++;
      } else if (line.startsWith("-")) {
        diffLines.push({
          type: "remove",
          content: line.slice(1),
          oldLineNo: oldLineNo++,
        });
        deletions++;
      } else if (line.startsWith(" ") || line === "") {
        diffLines.push({
          type: "context",
          content: line.slice(1),
          oldLineNo: oldLineNo++,
          newLineNo: newLineNo++,
        });
      }
    }

    files.push({ oldPath, newPath, additions, deletions, lines: diffLines });
  }

  return files;
}
