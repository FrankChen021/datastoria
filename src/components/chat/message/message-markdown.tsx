import { useClickHouseSettings } from "@/components/chat/use-clickhouse-settings";
import { useConnection } from "@/components/connection/connection-context";
import { OpenNodeTabButton } from "@/components/node-tab/open-node-tab-button";
import { ClickHouseSettingDescription } from "@/components/settings/query-context/settings-description";
import { showSettingsDialog } from "@/components/settings/settings-dialog";
import { ThemedSyntaxHighlighter } from "@/components/shared/themed-syntax-highlighter";
import { OpenDatabaseTabButton } from "@/components/table-tab/open-database-tab-button";
import { OpenTableTabButton } from "@/components/table-tab/open-table-tab-button";
import { Button } from "@/components/ui/button";
import { HoverCard, HoverCardContent, HoverCardTrigger } from "@/components/ui/hover-card";
import { cn } from "@/lib/utils";
import katex from "katex";
import { Children, isValidElement, memo, useEffect, useMemo, useRef } from "react";
import ReactMarkdown, { defaultUrlTransform, type Components } from "react-markdown";
import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";
import { FileLink } from "./file-link";
import { MessageMarkdownChartSpec } from "./message-markdown-chat";
import { normalizeMathMarkdown } from "./message-markdown-math";
import { MessageMarkdownSql } from "./message-markdown-sql";
import { MessageMarkdownVizlayer } from "./message-markdown-vizlayer";
import { remarkExtensions } from "./remark-extensions";

function normalizeKatexInput(math: string) {
  return math.replace(/\\text\{([^{}]*)\}/g, (_, textContent: string) => {
    const escapedText = textContent.replaceAll("_", "\\_");
    return `\\text{${escapedText}}`;
  });
}

function transformMarkdownUrl(url: string) {
  if (url.startsWith("skill://")) {
    return url;
  }
  if (url.startsWith("codefile://")) {
    return url;
  }

  return defaultUrlTransform(url);
}

/**
 * Render text message with markdown support
 */
interface MessageMarkdownProps {
  text: string;
  messageId?: string;
  customStyle?: React.CSSProperties;
  showExecuteButton?: boolean;
  showSqlActions?: boolean;
  resolveMetadataLinks?: boolean;
  /**
   * Allow expandable SQL blocks inside markdown. Default: false.
   */
  expandable?: boolean;
}

function SettingInlineCode({
  name,
  type,
  description,
  currentValue,
  readonly,
}: {
  name: string;
  type: string;
  description: string;
  currentValue: string;
  readonly: boolean | null;
}) {
  const readonlyLabel = readonly === null ? "-" : readonly ? "Yes" : "No";
  const trigger = (
    <code className="bg-muted/30 rounded px-1 py-0.5 text-[0.8em] font-mono whitespace-pre-wrap break-all underline decoration-dotted underline-offset-2">
      {name}
    </code>
  );

  return (
    <HoverCard openDelay={150} closeDelay={100}>
      <HoverCardTrigger asChild>{trigger}</HoverCardTrigger>
      <HoverCardContent side="bottom" align="start" className="w-80 p-3">
        <div className="space-y-2 text-[11px]">
          <div>
            <div className="text-muted-foreground mb-0.5">Setting</div>
            <div className="text-foreground whitespace-pre-wrap break-all">{name}</div>
          </div>
          <div>
            <div className="text-muted-foreground mb-0.5">Type</div>
            <div className="text-foreground whitespace-pre-wrap break-all">{type}</div>
          </div>
          <div>
            <div className="text-muted-foreground mb-0.5">Current value</div>
            <div className="text-foreground whitespace-pre-wrap break-all">{currentValue}</div>
          </div>
          <div>
            <div className="text-muted-foreground mb-0.5">ReadOnly</div>
            <div className="text-foreground whitespace-pre-wrap break-all">{readonlyLabel}</div>
          </div>
          <div>
            <div className="text-muted-foreground mb-0.5">Description</div>
            <ClickHouseSettingDescription
              descriptionMarkdown={description}
              className="text-[11px] [&_.admonition]:my-1 [&_p]:mb-1 [&_ul]:mb-1 [&_ol]:mb-1"
            />
          </div>
        </div>
      </HoverCardContent>
    </HoverCard>
  );
}

export const MessageMarkdown = memo(function MessageMarkdown({
  text,
  customStyle,
  showExecuteButton = true,
  showSqlActions = true,
  resolveMetadataLinks = true,
  expandable = false,
}: MessageMarkdownProps) {
  const { connection } = useConnection();
  const { settingsByName: clickHouseSettingsByName } = useClickHouseSettings();
  const normalizedText = useMemo(() => normalizeMathMarkdown(text), [text]);

  const codeBlockStyle = useMemo<React.CSSProperties>(
    () => ({
      margin: "0rem",
      padding: "0rem",
      fontSize: "0.85rem",
      ...customStyle,
    }),
    [customStyle]
  );

  // Use refs to store stable references to metadata maps to avoid infinite loops
  // The connection object may be mutated, but we only care about the map references
  const tableNamesRef = useRef(connection?.metadata?.tableNames);
  const databaseNamesRef = useRef(connection?.metadata?.databaseNames);
  const nodeNamesRef = useRef(connection?.metadata?.hostNames);

  // Update refs when connection metadata changes
  useEffect(() => {
    tableNamesRef.current = connection?.metadata?.tableNames;
    databaseNamesRef.current = connection?.metadata?.databaseNames;
    nodeNamesRef.current = connection?.metadata?.hostNames;
  }, [
    connection?.metadata?.tableNames,
    connection?.metadata?.databaseNames,
    connection?.metadata?.hostNames,
  ]);

  const components = useMemo<Components>(
    () => ({
      code: ({ className: codeClassName, children, ...props }: React.ComponentProps<"code">) => {
        if (codeClassName?.includes("language-math")) {
          const math = normalizeKatexInput(String(children).replace(/\n$/, ""));
          const displayMode = codeClassName.includes("math-display");

          return (
            <span
              data-math-display={displayMode ? "true" : undefined}
              dangerouslySetInnerHTML={{
                __html: katex.renderToString(math, {
                  displayMode,
                  output: "htmlAndMathml",
                  strict: "ignore",
                  throwOnError: false,
                }),
              }}
            />
          );
        }

        if (codeClassName === "language-sql" || codeClassName === "language-clickhouse") {
          return (
            <MessageMarkdownSql
              code={String(children).replace(/\n$/, "")}
              language="sql"
              customStyle={customStyle}
              showExecuteButton={showExecuteButton}
              showActions={showSqlActions}
              showLineNumbers={false}
              expandable={expandable}
            />
          );
        }

        if (codeClassName === "language-chart-spec") {
          return <MessageMarkdownChartSpec spec={String(children)} />;
        }
        if (codeClassName === "language-vizlayer") {
          return <MessageMarkdownVizlayer spec={String(children)} />;
        }

        const languageMatch = codeClassName?.match(/language-([^\s]+)/);
        if (languageMatch?.[1] && languageMatch[1] !== "mermaid") {
          return (
            <ThemedSyntaxHighlighter
              language={languageMatch[1]}
              customStyle={codeBlockStyle}
              wrapLongLines={true}
            >
              {String(children).replace(/\n$/, "")}
            </ThemedSyntaxHighlighter>
          );
        }

        // Check if inline code is a table name or database name
        const isInline = !codeClassName || !codeClassName.includes("language-");
        if (isInline) {
          const codeText = String(children).trim();

          // First check if it's a table name
          const tableNames = resolveMetadataLinks ? tableNamesRef.current : undefined;
          if (tableNames && codeText) {
            const tableInfo = tableNames.get(codeText);
            if (tableInfo) {
              return (
                <OpenTableTabButton
                  database={tableInfo.database}
                  table={tableInfo.table}
                  showDatabase={true}
                  variant="link"
                  className="underline decoration-dotted underline-offset-2 font-normal text-sm gap-1"
                  showLinkIcon={true}
                  // Use a large number to make sure name is completely displayed
                  maxLength={4096}
                />
              );
            }
          }

          // Then check if it's a database name
          const databaseNames = resolveMetadataLinks ? databaseNamesRef.current : undefined;
          if (databaseNames && codeText) {
            const databaseInfo = databaseNames.get(codeText);
            if (databaseInfo) {
              return (
                <OpenDatabaseTabButton
                  database={databaseInfo.name}
                  variant="link"
                  className="underline decoration-dotted underline-offset-2 font-normal text-sm"
                  showLinkIcon={true}
                  // Use a large number to make sure name is completely displayed
                  maxLength={512}
                />
              );
            }
          }

          const nodeNames = resolveMetadataLinks ? nodeNamesRef.current : undefined;
          if (nodeNames && codeText) {
            if (nodeNames.has(codeText)) {
              return (
                <OpenNodeTabButton
                  host={codeText}
                  className="underline decoration-dotted underline-offset-2 font-normal text-sm"
                  showLinkIcon={true}
                  maxLength={512}
                />
              );
            }
          }

          const settingInfo = clickHouseSettingsByName.get(codeText);
          if (settingInfo) {
            return (
              <SettingInlineCode
                name={settingInfo.name}
                type={settingInfo.type}
                description={settingInfo.description}
                currentValue={settingInfo.value}
                readonly={settingInfo.readonly}
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
      pre: ({ children, ...props }: React.HTMLAttributes<HTMLPreElement>) => {
        const child = Children.count(children) === 1 ? Children.only(children) : null;
        const childProps =
          isValidElement<{ "data-math-display"?: string }>(child) && child.props
            ? child.props
            : null;
        if (childProps !== null && childProps["data-math-display"] === "true") {
          return <>{child}</>;
        }

        return <pre {...props}>{children}</pre>;
      },
      a: ({ href, children, ...props }: React.AnchorHTMLAttributes<HTMLAnchorElement>) => {
        if (href?.startsWith("skill://")) {
          const skillId = href.replace("skill://", "");
          const trigger = (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-6 rounded-sm px-1.5 font-mono text-primary text-xs bg-accent text-accent-foreground"
              onClick={() => {
                showSettingsDialog({
                  initialSection: "skills",
                  initialSkillId: skillId,
                });
              }}
            >
              {children}
            </Button>
          );

          if (!props.title) {
            return trigger;
          }

          return (
            <HoverCard openDelay={150} closeDelay={100}>
              <HoverCardTrigger asChild>{trigger}</HoverCardTrigger>
              <HoverCardContent
                side="bottom"
                align="start"
                className="w-80 break-words p-2 text-sm leading-relaxed"
              >
                {props.title}
              </HoverCardContent>
            </HoverCard>
          );
        }

        if (href?.startsWith("codefile://")) {
          const parsed = new URL(href);
          const filePath = parsed.searchParams.get("path") ?? "";
          const viewerUrl = FileLink.toViewerUrl(href);

          return (
            <a
              href={viewerUrl}
              target="_blank"
              rel="noopener noreferrer"
              title={filePath}
              className="inline-flex max-w-full items-center gap-1 font-mono text-xs text-primary transition-colors hover:underline underline-offset-4"
              {...props}
            >
              <span className="truncate">{children}</span>
            </a>
          );
        }

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
    [
      clickHouseSettingsByName,
      codeBlockStyle,
      customStyle,
      expandable,
      resolveMetadataLinks,
      showExecuteButton,
      showSqlActions,
    ]
  );

  return (
    <div className="prose prose-sm dark:prose-invert max-w-none text-sm relative">
      <ReactMarkdown
        remarkPlugins={[remarkGfm, remarkMath, remarkExtensions]}
        components={components}
        urlTransform={transformMarkdownUrl}
      >
        {normalizedText}
      </ReactMarkdown>
    </div>
  );
});
