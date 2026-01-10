import { useConnection } from "@/components/connection/connection-context";
import { OpenDatabaseTabButton } from "@/components/table-tab/open-database-tab-button";
import { OpenTableTabButton } from "@/components/table-tab/open-table-tab-button";
import { cn } from "@/lib/utils";
import { memo, useMemo } from "react";
import ReactMarkdown, { type Components } from "react-markdown";
import remarkGfm from "remark-gfm";
import { MessageMarkdownSql } from "./message-markdown-sql";

/**
 * Render text message with markdown support
 */
interface MessageMarkdownProps {
  text: string;
  customStyle?: React.CSSProperties;
  showExecuteButton?: boolean;
}

export const MessageMarkdown = memo(function MessageMarkdown({
  text,
  customStyle,
  showExecuteButton = true,
}: MessageMarkdownProps) {
  const { connection } = useConnection();

  // Helper function to check if text is a table name
  const getTableInfo = useMemo(
    () =>
      (text: string): { database: string; table: string } | null => {
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
      },
    [connection]
  );

  // Helper function to get database info
  const getDatabaseInfo = useMemo(
    () =>
      (text: string): { name: string } | null => {
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
      },
    [connection]
  );

  const components = useMemo<Components>(
    () => ({
      code: ({ className: codeClassName, children, ...props }: React.ComponentProps<"code">) => {
        const match = /language-(\w+)/.exec(codeClassName || "");
        const language = match ? match[1] : undefined;
        const code = String(children).replace(/\n$/, "");

        const isSql = language === "sql" || language === "clickhouse";

        if (isSql) {
          return (
            <MessageMarkdownSql
              code={code}
              language={language}
              customStyle={customStyle}
              showExecuteButton={showExecuteButton}
              showLineNumbers={false}
            />
          );
        }

        // Check if inline code is a table name or database name
        const isInline = !codeClassName || !codeClassName.includes("language-");
        if (isInline) {
          const codeText = String(children).trim();

          // First check if it's a table name
          const tableInfo = getTableInfo(codeText);
          if (tableInfo) {
            return (
              <OpenTableTabButton
                database={tableInfo.database}
                table={tableInfo.table}
                showDatabase={true}
                variant="link"
                className="underline decoration-dotted underline-offset-2 font-normal text-sm"
                showLinkIcon={false}
              />
            );
          }

          // Then check if it's a database name
          const databaseInfo = getDatabaseInfo(codeText);
          if (databaseInfo) {
            return (
              <OpenDatabaseTabButton
                database={databaseInfo.name}
                variant="link"
                className="underline decoration-dotted underline-offset-2 font-normal text-sm"
                showLinkIcon={false}
              />
            );
          }
        }

        return (
          <code
            className={cn(
              "bg-muted/30 rounded px-1 py-0.5 text-[0.8em] font-mono whitespace-pre-wrap break-all",
              codeClassName
            )}
            {...props}
          >
            {children}
          </code>
        );
      },
      a: ({ href, children, ...props }: React.AnchorHTMLAttributes<HTMLAnchorElement>) => {
        return (
          <a
            href={href}
            target="_blank"
            rel="noopener noreferrer"
            className="text-primary hover:underline underline-offset-4"
            {...props}
          >
            {children}
          </a>
        );
      },
      ul: ({ children, ...props }: React.HTMLAttributes<HTMLUListElement>) => (
        <ul className="list-disc pl-4 mb-2 space-y-1" {...props}>
          {children}
        </ul>
      ),
      ol: ({ children, ...props }: React.OlHTMLAttributes<HTMLOListElement>) => (
        <ol className="list-decimal pl-4 mb-2 space-y-1" {...props}>
          {children}
        </ol>
      ),
      li: ({ children, ...props }: React.LiHTMLAttributes<HTMLLIElement>) => (
        <li className="mb-0.5" {...props}>
          {children}
        </li>
      ),
      p: ({ children, ...props }: React.HTMLAttributes<HTMLParagraphElement>) => (
        <p className="mb-1 last:mb-0 leading-relaxed" {...props}>
          {children}
        </p>
      ),
      table: ({ children, ...props }: React.TableHTMLAttributes<HTMLTableElement>) => (
        <div className="my-2 overflow-x-auto border rounded-sm">
          <table className="w-full border-collapse text-sm" {...props}>
            {children}
          </table>
        </div>
      ),
      thead: ({ children, ...props }: React.HTMLAttributes<HTMLTableSectionElement>) => (
        <thead className="bg-muted/50 border-b" {...props}>
          {children}
        </thead>
      ),
      tbody: ({ children, ...props }: React.HTMLAttributes<HTMLTableSectionElement>) => (
        <tbody className="divide-y divide-border" {...props}>
          {children}
        </tbody>
      ),
      tr: ({ children, ...props }: React.HTMLAttributes<HTMLTableRowElement>) => (
        <tr className="hover:bg-muted/30 transition-colors" {...props}>
          {children}
        </tr>
      ),
      th: ({ children, ...props }: React.ThHTMLAttributes<HTMLTableHeaderCellElement>) => (
        <th
          className="px-4 py-2 text-left font-bold text-muted-foreground border-r last:border-r-0"
          {...props}
        >
          {children}
        </th>
      ),
      td: ({ children, ...props }: React.TdHTMLAttributes<HTMLTableDataCellElement>) => (
        <td className="px-4 py-2 border-r last:border-r-0" {...props}>
          {children}
        </td>
      ),
      h1: ({ children, ...props }: React.HTMLAttributes<HTMLHeadingElement>) => (
        <h1 className="text-2xl font-semibold" {...props}>
          {children}
        </h1>
      ),
      h2: ({ children, ...props }: React.HTMLAttributes<HTMLHeadingElement>) => (
        <h2 className="text-xl font-semibold" {...props}>
          {children}
        </h2>
      ),
      h3: ({ children, ...props }: React.HTMLAttributes<HTMLHeadingElement>) => (
        <h3 className="text-lg font-semibold" {...props}>
          {children}
        </h3>
      ),
      h4: ({ children, ...props }: React.HTMLAttributes<HTMLHeadingElement>) => (
        <h4 className="text-base font-semibold" {...props}>
          {children}
        </h4>
      ),
      h5: ({ children, ...props }: React.HTMLAttributes<HTMLHeadingElement>) => (
        <h5 className="text-sm font-semibold" {...props}>
          {children}
        </h5>
      ),
      h6: ({ children, ...props }: React.HTMLAttributes<HTMLHeadingElement>) => (
        <h6 className="text-sm font-semibold" {...props}>
          {children}
        </h6>
      ),
    }),
    [customStyle, showExecuteButton, getTableInfo, getDatabaseInfo]
  );

  return (
    <div className="prose prose-sm dark:prose-invert max-w-none text-sm">
      <ReactMarkdown remarkPlugins={[remarkGfm]} components={components}>
        {text}
      </ReactMarkdown>
    </div>
  );
});
