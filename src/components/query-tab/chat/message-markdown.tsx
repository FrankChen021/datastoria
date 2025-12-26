import { OpenDatabaseTabButton } from "@/components/table-tab/open-database-tab-button";
import { OpenTableTabButton } from "@/components/table-tab/open-table-tab-button";
import { useConnection } from "@/lib/connection/connection-context";
import { memo } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { MessageMarkdownSql } from "./message-markdown-sql";

/**
 * Render text message with markdown support
 */
export const MessageMarkdown = memo(function MessageMarkdown({ text }: { text: string }) {
  const { connection } = useConnection();

  // Helper function to check if text is a table name
  const getTableInfo = (text: string): { database: string; table: string } | null => {
    if (!connection?.metadata?.tableNames) {
      return null;
    }

    const normalizedText = text.trim();
    if (!normalizedText) {
      return null;
    }

    // Check if it matches a qualified table name (database.table)
    const tableInfo = connection.metadata.tableNames.get(normalizedText);
    if (tableInfo) {
      return tableInfo;
    }

    return null;
  };

  // Helper function to get database info
  const getDatabaseInfo = (text: string): { name: string } | null => {
    if (!connection?.metadata?.databaseNames) {
      return null;
    }

    const normalizedText = text.trim();
    if (!normalizedText) {
      return null;
    }

    const databaseInfo = connection.metadata.databaseNames.get(normalizedText);
    if (databaseInfo) {
      return { name: databaseInfo.name };
    }

    return null;
  };

  return (
    <div className="prose prose-sm dark:prose-invert max-w-none text-sm">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          code({ className, children, ...props }: React.ComponentProps<"code">) {
            const match = /language-(\w+)/.exec(className || "");
            const language = match ? match[1] : "";
            const isInline = !className || !className.includes("language-");

            // Use SqlCodeBlock for SQL code blocks (non-inline)
            if (!isInline && (language === "sql" || language === "")) {
              const codeString = String(children).replace(/\n$/, "");
              return (
                <MessageMarkdownSql
                  code={codeString}
                  showExecuteButton={true}
                  customStyle={{
                    margin: 0,
                    borderRadius: "0.375rem",
                    fontSize: "10px",
                  }}
                />
              );
            }

            // Check if inline code is a table name or database name
            if (isInline) {
              const codeText = String(children).trim();
              
              // First check if it's a table name
              const tableInfo = getTableInfo(codeText);
              if (tableInfo) {
                return (
                  <code className={`${className || ""} inline-flex items-center`} {...props}>
                    <OpenTableTabButton
                      database={tableInfo.database}
                      table={tableInfo.table}
                      showDatabase={true}
                      variant="link"
                      className="underline decoration-dotted underline-offset-2 font-normal text-sm"
                      showLinkIcon={false}
                    />
                  </code>
                );
              }
              
              // Then check if it's a database name
              const databaseInfo = getDatabaseInfo(codeText);
              if (databaseInfo) {
                return (
                  <code className={`${className || ""} inline-flex items-center`} {...props}>
                    <OpenDatabaseTabButton
                      database={databaseInfo.name}
                      variant="link"
                      className="underline decoration-dotted underline-offset-2 font-normal text-sm"
                      showLinkIcon={false}
                    />
                  </code>
                );
              }
            }

            // Default inline code rendering
            return (
              <code className={className} {...props}>
                {children}
              </code>
            );
          },
          table: ({ children, ...props }) => (
            <div className="my-4 overflow-x-auto border rounded-lg">
              <table className="w-full border-collapse text-sm" {...props}>
                {children}
              </table>
            </div>
          ),
          thead: ({ children, ...props }) => (
            <thead className="bg-muted/50 border-b" {...props}>
              {children}
            </thead>
          ),
          tbody: ({ children, ...props }) => (
            <tbody className="divide-y divide-border" {...props}>
              {children}
            </tbody>
          ),
          tr: ({ children, ...props }) => (
            <tr className="hover:bg-muted/30 transition-colors" {...props}>
              {children}
            </tr>
          ),
          th: ({ children, ...props }) => (
            <th className="px-4 py-2 text-left font-bold text-muted-foreground border-r last:border-r-0" {...props}>
              {children}
            </th>
          ),
          td: ({ children, ...props }) => (
            <td className="px-4 py-2 border-r last:border-r-0" {...props}>
              {children}
            </td>
          ),
          h1: ({ children, ...props }) => (
            <h1 className="pt-4 pb-2" {...props}>
              {children}
            </h1>
          ),
          h2: ({ children, ...props }) => (
            <h2 className="pt-3 pb-2" {...props}>
              {children}
            </h2>
          ),
          h3: ({ children, ...props }) => (
            <h3 className="pt-3 pb-1.5" {...props}>
              {children}
            </h3>
          ),
          h4: ({ children, ...props }) => (
            <h4 className="pt-2 pb-1.5" {...props}>
              {children}
            </h4>
          ),
          h5: ({ children, ...props }) => (
            <h5 className="pt-2 pb-1" {...props}>
              {children}
            </h5>
          ),
          h6: ({ children, ...props }) => (
            <h6 className="pt-2 pb-1" {...props}>
              {children}
            </h6>
          ),
          ul: ({ children, ...props }) => (
            <ul className="list-disc my-2 pl-4" {...props}>
              {children}
            </ul>
          ),
          ol: ({ children, ...props }) => (
            <ol className="list-decimal my-2 pl-4" {...props}>
              {children}
            </ol>
          ),
          li: ({ children, ...props }) => (
            <li className="my-1" {...props}>
              {children}
            </li>
          ),
        }}
      >
        {text}
      </ReactMarkdown>
    </div>
  );
});
