import { Children, isValidElement } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { SyntaxHighlighter } from "./SyntaxHighlighter";
import { TypingIndicator } from "./TypingIndicator";

interface TextBlockProps {
  text: string;
  isStreaming?: boolean;
}

/** Extract plain text from React children (ReactMarkdown wraps code content in child nodes) */
function extractText(children: React.ReactNode): string {
  return Children.toArray(children)
    .map((child) => {
      if (typeof child === "string") return child;
      if (isValidElement(child)) {
        const props = child.props as Record<string, unknown> | null;
        if (props != null && "children" in props) {
          return extractText(props.children as React.ReactNode);
        }
      }
      return "";
    })
    .join("");
}

export function TextBlock({ text, isStreaming }: TextBlockProps) {
  if (!text.trim()) return null;

  return (
    <div className="claude-markdown my-1 text-sm leading-relaxed text-on-surface">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          // Code blocks
          code: ({ className, children, ...props }) => {
            const match = /language-(\w+)/.exec(className ?? "");
            const isInline = !match && !className;

            if (isInline) {
              return (
                <code
                  className="rounded bg-hover px-1 py-0.5 font-mono text-xs text-on-surface"
                  {...props}
                >
                  {children}
                </code>
              );
            }

            const lang = match ? match[1] : "";
            const codeText = extractText(children).replace(/\n$/, "");

            return (
              <div className="my-2 overflow-hidden rounded-sm border border-outline">
                {lang && (
                  <div className="border-b border-outline bg-surface-sunken px-3 py-1 text-[10px] font-medium uppercase tracking-wide text-on-surface-faint">
                    {lang}
                  </div>
                )}
                <pre className="overflow-x-auto bg-surface-sunken p-3 will-change-transform">
                  {lang ? (
                    <SyntaxHighlighter code={codeText} language={lang} />
                  ) : (
                    <code className="font-mono text-xs leading-relaxed text-on-surface" {...props}>
                      {children}
                    </code>
                  )}
                </pre>
              </div>
            );
          },
          // Links
          a: ({ children, ...props }) => (
            <a
              className="text-brand underline decoration-brand/40 hover:text-brand/80"
              target="_blank"
              rel="noopener noreferrer"
              {...props}
            >
              {children}
            </a>
          ),
          // Paragraphs
          p: ({ children }) => <p className="my-1.5">{children}</p>,
          // Lists
          ul: ({ children }) => <ul className="my-1.5 list-disc space-y-0.5 pl-5">{children}</ul>,
          ol: ({ children }) => (
            <ol className="my-1.5 list-decimal space-y-0.5 pl-5">{children}</ol>
          ),
          // Blockquotes
          blockquote: ({ children }) => (
            <blockquote className="my-2 border-l-2 border-outline-strong pl-3 italic text-on-surface-muted">
              {children}
            </blockquote>
          ),
          // Tables
          table: ({ children }) => (
            <div className="my-2 overflow-x-auto">
              <table className="min-w-full border-collapse text-xs">{children}</table>
            </div>
          ),
          th: ({ children }) => (
            <th className="border border-outline bg-surface-sunken px-3 py-1.5 text-left font-semibold">
              {children}
            </th>
          ),
          td: ({ children }) => <td className="border border-outline px-3 py-1.5">{children}</td>,
          // Headings
          h1: ({ children }) => (
            <h1 className="mb-2 mt-4 text-lg font-bold text-on-surface">{children}</h1>
          ),
          h2: ({ children }) => (
            <h2 className="mb-1.5 mt-3 text-base font-bold text-on-surface">{children}</h2>
          ),
          h3: ({ children }) => (
            <h3 className="mb-1 mt-2.5 text-sm font-bold text-on-surface">{children}</h3>
          ),
          // Horizontal rule
          hr: () => <hr className="my-3 border-outline" />,
        }}
      >
        {text}
      </ReactMarkdown>
      {isStreaming && <TypingIndicator className="ml-1 align-middle" />}
    </div>
  );
}
