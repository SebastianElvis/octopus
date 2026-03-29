import { useEffect, useState } from "react";
import type { Highlighter } from "shiki";

let highlighterPromise: Promise<Highlighter> | null = null;

/** Lazy-load a single shared Shiki highlighter instance */
function getHighlighter(): Promise<Highlighter> {
  highlighterPromise ??= import("shiki").then((shiki) =>
      shiki.createHighlighter({
        themes: ["github-light", "github-dark"],
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
          "diff",
          "c",
          "cpp",
          "java",
          "ruby",
          "swift",
          "kotlin",
          "dockerfile",
          "graphql",
        ],
      }),
    );
  return highlighterPromise;
}

interface SyntaxHighlighterProps {
  code: string;
  language: string;
}

export function SyntaxHighlighter({ code, language }: SyntaxHighlighterProps) {
  const [html, setHtml] = useState<string | null>(null);

  useEffect(() => {
    const state = { cancelled: false };
    void getHighlighter().then((highlighter) => {
      if (state.cancelled) return;
      const loadedLangs = highlighter.getLoadedLanguages();
      const lang = loadedLangs.includes(language) ? language : "text";
      try {
        // Shiki's codeToHtml produces sanitized HTML (only <span> tags with
        // style attributes for syntax coloring). The input is code content from
        // Claude's conversation, not arbitrary user HTML.
        const result = highlighter.codeToHtml(code, {
          lang,
          themes: { light: "github-light", dark: "github-dark" },
        });
        if (!state.cancelled) setHtml(result); // eslint-disable-line @typescript-eslint/no-unnecessary-condition -- async cancellation
      } catch {
        // Fallback: render as plain text
        if (!state.cancelled) setHtml(null); // eslint-disable-line @typescript-eslint/no-unnecessary-condition -- async cancellation
      }
    });
    return () => {
      state.cancelled = true;
    };
  }, [code, language]);

  if (!html) {
    // Fallback while loading or for unsupported languages
    return (
      <code className="font-mono text-xs leading-relaxed text-on-surface">
        {code}
      </code>
    );
  }

  return (
    <div
      className="shiki-wrapper font-mono text-xs leading-relaxed [&_pre]:!bg-transparent [&_pre]:!p-0 [&_code]:!bg-transparent"
      // Safe: Shiki generates sanitized HTML with only <span> + style attributes
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}
