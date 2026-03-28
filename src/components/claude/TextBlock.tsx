import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

interface TextBlockProps {
  text: string;
  isStreaming?: boolean;
}

export function TextBlock({ text, isStreaming }: TextBlockProps) {
  if (!text.trim()) return null;

  return (
    <div className="claude-markdown my-1 text-sm leading-relaxed text-gray-800 dark:text-gray-200">
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
                  className="rounded bg-gray-100 px-1 py-0.5 font-mono text-xs text-gray-800 dark:bg-gray-800 dark:text-gray-200"
                  {...props}
                >
                  {children}
                </code>
              );
            }

            return (
              <div className="my-2 overflow-hidden rounded-md border border-gray-200 dark:border-gray-700">
                {match && (
                  <div className="border-b border-gray-200 bg-gray-50 px-3 py-1 text-[10px] font-medium uppercase tracking-wide text-gray-400 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-500">
                    {match[1]}
                  </div>
                )}
                <pre className="overflow-x-auto bg-gray-50 p-3 dark:bg-gray-900">
                  <code
                    className="font-mono text-xs leading-relaxed text-gray-800 dark:text-gray-200"
                    {...props}
                  >
                    {children}
                  </code>
                </pre>
              </div>
            );
          },
          // Links
          a: ({ children, ...props }) => (
            <a
              className="text-blue-600 underline decoration-blue-300 hover:text-blue-700 dark:text-blue-400 dark:decoration-blue-700 dark:hover:text-blue-300"
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
            <blockquote className="my-2 border-l-2 border-gray-300 pl-3 italic text-gray-600 dark:border-gray-600 dark:text-gray-400">
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
            <th className="border border-gray-200 bg-gray-50 px-3 py-1.5 text-left font-semibold dark:border-gray-700 dark:bg-gray-800">
              {children}
            </th>
          ),
          td: ({ children }) => (
            <td className="border border-gray-200 px-3 py-1.5 dark:border-gray-700">{children}</td>
          ),
          // Headings
          h1: ({ children }) => (
            <h1 className="mb-2 mt-4 text-lg font-bold text-gray-900 dark:text-gray-100">
              {children}
            </h1>
          ),
          h2: ({ children }) => (
            <h2 className="mb-1.5 mt-3 text-base font-bold text-gray-900 dark:text-gray-100">
              {children}
            </h2>
          ),
          h3: ({ children }) => (
            <h3 className="mb-1 mt-2.5 text-sm font-bold text-gray-900 dark:text-gray-100">
              {children}
            </h3>
          ),
          // Horizontal rule
          hr: () => <hr className="my-3 border-gray-200 dark:border-gray-700" />,
        }}
      >
        {text}
      </ReactMarkdown>
      {isStreaming && (
        <span className="ml-0.5 inline-block h-4 w-0.5 animate-pulse bg-gray-600 dark:bg-gray-300" />
      )}
    </div>
  );
}
