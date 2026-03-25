"use client";

import { MessageMarkdownSql } from "@/components/chat/message/message-markdown-sql";
import matter from "gray-matter";
import { memo } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

export const SkillMarkdownRenderer = memo(function SkillMarkdownRenderer({ raw }: { raw: string }) {
  const { content } = raw.trimStart().startsWith("---") ? matter(raw) : { content: raw };

  return (
    <ReactMarkdown
      remarkPlugins={[remarkGfm]}
      components={{
        h1: ({ children }) => (
          <h1 className="text-lg font-bold mt-4 mb-2 first:mt-0">{children}</h1>
        ),
        h2: ({ children }) => <h2 className="text-base font-semibold mt-3 mb-1.5">{children}</h2>,
        h3: ({ children }) => <h3 className="text-sm font-semibold mt-2.5 mb-1">{children}</h3>,
        p: ({ children }) => <p className="text-sm mb-2 leading-relaxed">{children}</p>,
        ul: ({ children }) => (
          <ul className="text-sm list-disc ml-4 mb-2 space-y-0.5">{children}</ul>
        ),
        ol: ({ children }) => (
          <ol className="text-sm list-decimal ml-4 mb-2 space-y-0.5">{children}</ol>
        ),
        li: ({ children }) => <li className="leading-relaxed">{children}</li>,
        code: ({ className, children, ...props }) => {
          if (className === "language-sql") {
            return (
              <MessageMarkdownSql
                className="pb-2"
                code={String(children).replace(/\n$/, "")}
                language="sql"
                showExecuteButton={false}
                showLineNumbers={false}
                expandable={false}
              />
            );
          }
          const isBlock = className?.includes("language-");
          if (isBlock) {
            return (
              <pre className="bg-muted rounded p-3 overflow-x-auto my-2">
                <code className="text-xs font-mono">{children}</code>
              </pre>
            );
          }
          return (
            <code className="bg-muted rounded px-1 py-0.5 text-xs font-mono" {...props}>
              {children}
            </code>
          );
        },
        blockquote: ({ children }) => (
          <blockquote className="border-l-2 border-muted pl-3 text-muted-foreground italic my-2">
            {children}
          </blockquote>
        ),
        table: ({ children }) => (
          <div className="overflow-x-auto my-2">
            <table className="text-xs border-collapse w-full">{children}</table>
          </div>
        ),
        th: ({ children }) => (
          <th className="border border-border px-2 py-1 bg-muted font-semibold text-left">
            {children}
          </th>
        ),
        td: ({ children }) => <td className="border border-border px-2 py-1">{children}</td>,
        hr: () => <hr className="my-3 border-border" />,
      }}
    >
      {content}
    </ReactMarkdown>
  );
});
