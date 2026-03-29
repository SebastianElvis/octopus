import { useState, useMemo, useEffect } from "react";
import { parseDiff } from "../lib/utils";
import type { DiffFile, DiffLine } from "../lib/types";
import type { Highlighter, ThemedToken } from "shiki";

interface DiffViewerProps {
  diff: string;
  filePath: string;
}

const COLLAPSE_THRESHOLD = 4;

interface ViewSection {
  type: "lines" | "collapsed";
  lines: DiffLine[];
  /** Index of first line in the flat lines array (for token lookup) */
  startIndex: number;
  count: number;
}

// ---------------------------------------------------------------------------
// Shiki highlighter (shared singleton)
// ---------------------------------------------------------------------------

let highlighterPromise: Promise<Highlighter> | null = null;

function getHighlighter(): Promise<Highlighter> {
  highlighterPromise ??= import("shiki").then((shiki) =>
    shiki.createHighlighter({
      themes: ["github-dark"],
      langs: [
        "javascript",
        "typescript",
        "jsx",
        "tsx",
        "python",
        "rust",
        "go",
        "bash",
        "shell",
        "json",
        "yaml",
        "toml",
        "html",
        "css",
        "sql",
        "markdown",
        "c",
        "cpp",
        "java",
        "ruby",
        "swift",
        "kotlin",
        "dockerfile",
        "graphql",
        "xml",
        "svg",
      ],
    }),
  );
  return highlighterPromise;
}

/** Map file extension to Shiki language id */
function detectLang(filePath: string): string {
  const ext = filePath.split(".").pop()?.toLowerCase() ?? "";
  const map: Record<string, string> = {
    ts: "typescript",
    tsx: "tsx",
    js: "javascript",
    jsx: "jsx",
    rs: "rust",
    py: "python",
    go: "go",
    rb: "ruby",
    json: "json",
    yaml: "yaml",
    yml: "yaml",
    toml: "toml",
    md: "markdown",
    mdx: "markdown",
    html: "html",
    htm: "html",
    css: "css",
    scss: "css",
    sh: "bash",
    bash: "bash",
    zsh: "bash",
    sql: "sql",
    java: "java",
    kt: "kotlin",
    swift: "swift",
    c: "c",
    cpp: "cpp",
    h: "c",
    hpp: "cpp",
    xml: "xml",
    svg: "xml",
    dockerfile: "dockerfile",
    graphql: "graphql",
  };
  return map[ext] ?? "text";
}

// ---------------------------------------------------------------------------
// Section builder
// ---------------------------------------------------------------------------

function buildSections(lines: DiffLine[]): ViewSection[] {
  const sections: ViewSection[] = [];
  let i = 0;
  let flatIndex = 0;

  while (i < lines.length) {
    if (lines[i].type === "header") {
      i++;
      continue;
    }

    if (lines[i].type === "context") {
      const start = i;
      while (i < lines.length && lines[i].type === "context") i++;
      const contextLines = lines.slice(start, i);

      if (contextLines.length > COLLAPSE_THRESHOLD * 2) {
        const leading = contextLines.slice(0, COLLAPSE_THRESHOLD);
        const middle = contextLines.slice(COLLAPSE_THRESHOLD, -COLLAPSE_THRESHOLD);
        const trailing = contextLines.slice(-COLLAPSE_THRESHOLD);

        sections.push({
          type: "lines",
          lines: leading,
          startIndex: flatIndex,
          count: leading.length,
        });
        flatIndex += leading.length;
        sections.push({
          type: "collapsed",
          lines: middle,
          startIndex: flatIndex,
          count: middle.length,
        });
        flatIndex += middle.length;
        sections.push({
          type: "lines",
          lines: trailing,
          startIndex: flatIndex,
          count: trailing.length,
        });
        flatIndex += trailing.length;
      } else {
        sections.push({
          type: "lines",
          lines: contextLines,
          startIndex: flatIndex,
          count: contextLines.length,
        });
        flatIndex += contextLines.length;
      }
    } else {
      const start = i;
      while (i < lines.length && (lines[i].type === "add" || lines[i].type === "remove")) i++;
      const changed = lines.slice(start, i);
      sections.push({
        type: "lines",
        lines: changed,
        startIndex: flatIndex,
        count: changed.length,
      });
      flatIndex += changed.length;
    }
  }
  return sections;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

function findParsedFile(diff: string, filePath: string): DiffFile | undefined {
  const files = parseDiff(diff);
  return files.find((f) => filePath.endsWith(f.newPath)) ?? files[0];
}

export function DiffViewer({ diff, filePath }: DiffViewerProps) {
  const parsed = useMemo(() => findParsedFile(diff, filePath), [diff, filePath]);

  // Flatten lines (skip headers) for token indexing
  const flatLines = useMemo(
    () => (parsed ? parsed.lines.filter((l) => l.type !== "header") : []),
    [parsed],
  );

  const sections = useMemo(
    () => (parsed ? buildSections(parsed.lines) : []),
    [parsed],
  );

  const [expandedSections, setExpandedSections] = useState<Set<number>>(new Set());

  // Shiki tokenization: one array of tokens per flat line
  const [tokensByLine, setTokensByLine] = useState<ThemedToken[][] | null>(null);

  useEffect(() => {
    if (flatLines.length === 0) return;

    const code = flatLines.map((l) => l.content).join("\n");
    const lang = detectLang(filePath);
    const state = { cancelled: false };

    void getHighlighter().then((highlighter) => {
      if (state.cancelled) return;
      const loadedLangs = highlighter.getLoadedLanguages();
      const resolvedLang = loadedLangs.includes(lang) ? lang : "text";
      try {
        const result = highlighter.codeToTokens(code, {
          lang: resolvedLang as Parameters<typeof highlighter.codeToTokens>[1]["lang"],
          theme: "github-dark",
        });
        // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- async cancellation
        if (!state.cancelled) {
          setTokensByLine(result.tokens);
        }
      } catch {
        // Fallback: no highlighting
      }
    });

    return () => {
      state.cancelled = true;
    };
  }, [flatLines, filePath]);

  if (!parsed) {
    return (
      <div className="flex h-full items-center justify-center bg-[#0d1117]">
        <p className="text-sm text-gray-500">No diff to display</p>
      </div>
    );
  }

  function toggleSection(idx: number) {
    setExpandedSections((prev) => {
      const next = new Set(prev);
      if (next.has(idx)) next.delete(idx);
      else next.add(idx);
      return next;
    });
  }

  return (
    <div className="h-full overflow-auto bg-[#0d1117]">
      {/* File header */}
      <div className="sticky top-0 z-10 flex items-center gap-2 border-b border-gray-800 bg-[#161b22] px-4 py-2">
        <span className="font-mono text-xs text-gray-400">{parsed.newPath}</span>
        <div className="ml-auto flex items-center gap-3">
          <span className="text-xs font-medium text-green-500">+{parsed.additions}</span>
          <span className="text-xs font-medium text-red-500">-{parsed.deletions}</span>
        </div>
      </div>

      {/* Diff content */}
      <table className="w-full border-collapse font-mono text-[13px] leading-[20px]">
        <tbody>
          {sections.map((section, sIdx) => {
            if (section.type === "collapsed" && !expandedSections.has(sIdx)) {
              return (
                <tr key={sIdx}>
                  <td colSpan={3}>
                    <button
                      onClick={() => toggleSection(sIdx)}
                      className="flex w-full cursor-pointer items-center gap-2 border-y border-gray-800 bg-[#161b22] px-4 py-1 text-xs text-blue-400 hover:bg-[#1c2128] hover:text-blue-300"
                    >
                      <svg
                        className="h-3 w-3"
                        fill="none"
                        viewBox="0 0 24 24"
                        stroke="currentColor"
                        strokeWidth={2}
                      >
                        <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                      </svg>
                      {section.count} unmodified lines
                    </button>
                  </td>
                </tr>
              );
            }

            return section.lines.map((line, lIdx) => {
              const flatIdx = section.startIndex + lIdx;
              const key = `${sIdx}-${lIdx}`;
              const rowBg =
                line.type === "add" ? "bg-[#0d2818]" : line.type === "remove" ? "bg-[#2d1117]" : "";
              const lineNumColor =
                line.type === "add"
                  ? "text-green-800"
                  : line.type === "remove"
                    ? "text-red-900"
                    : "text-gray-600";
              const prefix = line.type === "add" ? "+" : line.type === "remove" ? "-" : " ";

              const tokens = tokensByLine?.[flatIdx];

              return (
                <tr key={key} className={rowBg}>
                  <td
                    className={`w-[1px] select-none whitespace-nowrap px-2 text-right ${lineNumColor}`}
                  >
                    {line.oldLineNo ?? ""}
                  </td>
                  <td
                    className={`w-[1px] select-none whitespace-nowrap px-2 text-right ${lineNumColor}`}
                  >
                    {line.newLineNo ?? ""}
                  </td>
                  <td className="whitespace-pre px-3">
                    <span className="select-none text-gray-600">{prefix}</span>
                    {tokens ? (
                      tokens.map((token, tIdx) => (
                        <span key={tIdx} style={{ color: token.color }}>
                          {token.content}
                        </span>
                      ))
                    ) : (
                      <span
                        className={
                          line.type === "add"
                            ? "text-green-300"
                            : line.type === "remove"
                              ? "text-red-300"
                              : "text-gray-300"
                        }
                      >
                        {line.content}
                      </span>
                    )}
                  </td>
                </tr>
              );
            });
          })}
        </tbody>
      </table>
    </div>
  );
}
