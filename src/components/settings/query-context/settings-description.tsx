import { preprocessAdmonitions } from "@/lib/clickhouse/admonition-preprocessor";
import { transformMarkdownLink } from "@/lib/clickhouse/clickhouse-docs-link";
import { cn } from "@/lib/utils";
import type { HTMLAttributes, ReactNode } from "react";
import ReactMarkdown from "react-markdown";
import rehypeRaw from "rehype-raw";

/**
 * Transforms markdown links in descriptions from relative URLs to absolute ClickHouse documentation URLs.
 */
export function transformSettingMarkdownLinks(description: string): string {
  if (!description) return description;

  const markdownLinkRegex = /\[([^\]]+)\]\(([^)]+)\)/g;

  return description.replace(markdownLinkRegex, (match, linkText, url) => {
    const absoluteUrl = transformMarkdownLink("setting", url);
    return absoluteUrl !== url ? `[${linkText}](${absoluteUrl})` : match;
  });
}

const ALLOWED_RAW_TAGS = new Set([
  "a",
  "abbr",
  "b",
  "blockquote",
  "br",
  "code",
  "dd",
  "del",
  "details",
  "div",
  "dl",
  "dt",
  "em",
  "i",
  "img",
  "kbd",
  "li",
  "ol",
  "p",
  "pre",
  "s",
  "section",
  "small",
  "span",
  "strong",
  "sub",
  "summary",
  "sup",
  "table",
  "tbody",
  "td",
  "th",
  "thead",
  "tr",
  "u",
  "ul",
]);

function sanitizeUnknownInlineTags(description: string): string {
  if (!description.includes("<")) {
    return description;
  }

  return description
    .replace(/<([a-z][a-z0-9_-]*)>([^<]+)<\/\1>/gi, (match, tagName, innerText) => {
      const normalizedTagName = String(tagName).toLowerCase();
      if (ALLOWED_RAW_TAGS.has(normalizedTagName)) {
        return match;
      }
      return `\`${innerText.trim()}\``;
    })
    .replace(/<([a-z][a-z0-9_-]*)>/gi, (match, tagName) => {
      const normalizedTagName = String(tagName).toLowerCase();
      if (ALLOWED_RAW_TAGS.has(normalizedTagName)) {
        return match;
      }
      return `\`${normalizedTagName}\``;
    })
    .replace(/<\/([a-z][a-z0-9_-]*)>/gi, (match, tagName) => {
      const normalizedTagName = String(tagName).toLowerCase();
      return ALLOWED_RAW_TAGS.has(normalizedTagName) ? match : "";
    });
}

export function normalizeSettingDescriptionMarkdown(description: string): string {
  return preprocessAdmonitions(sanitizeUnknownInlineTags(transformSettingMarkdownLinks(description)));
}

function SettingInlineTag({
  children,
  className,
  ...props
}: {
  children?: ReactNode;
  className?: string;
} & HTMLAttributes<HTMLElement>) {
  return (
    <code
      {...props}
      className={cn("bg-muted px-1 py-0.5 rounded text-xs font-mono", className)}
    >
      {children}
    </code>
  );
}

function InlineTagComponent({
  children,
  className,
  ...props
}: HTMLAttributes<HTMLElement> & { children?: ReactNode }) {
  return (
    <SettingInlineTag className={className} {...props}>
      {children}
    </SettingInlineTag>
  );
}

const markdownComponents = {
  a: ({ className: anchorClassName, ...props }: HTMLAttributes<HTMLAnchorElement>) => (
    <a
      {...props}
      className={cn("text-primary underline", anchorClassName)}
      target="_blank"
      rel="noopener noreferrer"
    />
  ),
} as never;

/* Match query-input-view.css admonition styles (query-suggestion-manager ACE editor) */
const admonitionStyles =
  "[&_.admonition]:my-2 [&_.admonition]:py-2 [&_.admonition]:px-3 [&_.admonition]:text-xs [&_.admonition]:border-l [&_.admonition]:border-l-border [&_.admonition]:rounded-r [&_.admonition]:rounded-l-none " +
  "[&_.admonition-title]:font-bold [&_.admonition-title]:mb-1 [&_.admonition-title]:uppercase [&_.admonition-title]:text-[11px] [&_.admonition-title]:opacity-90 " +
  "[&_.admonition-content]:whitespace-normal [&_.admonition-content_p]:mb-2 [&_.admonition-content_p:last-child]:mb-0 " +
  "[&_.admonition.note]:border-l-blue-400 [&_.admonition.note]:bg-blue-400/10 dark:[&_.admonition.note]:border-l-blue-500 dark:[&_.admonition.note]:bg-blue-500/15 " +
  "[&_.admonition.warning]:border-l-amber-500 [&_.admonition.warning]:bg-amber-500/15 dark:[&_.admonition.warning]:border-l-amber-400 dark:[&_.admonition.warning]:bg-amber-400/20 " +
  "[&_.admonition.tip]:border-l-emerald-500 [&_.admonition.tip]:bg-emerald-500/15 dark:[&_.admonition.tip]:border-l-emerald-400 dark:[&_.admonition.tip]:bg-emerald-400/20 " +
  "[&_.admonition.danger]:border-l-red-500 [&_.admonition.danger]:bg-red-500/15 dark:[&_.admonition.danger]:border-l-red-400 dark:[&_.admonition.danger]:bg-red-400/20 " +
  "[&_.admonition.important]:border-l-violet-500 [&_.admonition.important]:bg-violet-500/15 dark:[&_.admonition.important]:border-l-violet-400 dark:[&_.admonition.important]:bg-violet-400/20";

/** Expects descriptionMarkdown to already be normalized by normalizeSettingDescriptionMarkdown. */
export function ClickHouseSettingDescription({
  descriptionMarkdown,
  className,
}: {
  descriptionMarkdown: string;
  className?: string;
}) {
  return (
    <div
      className={cn(
        `text-sm text-foreground [&_p]:mb-2 [&_p:last-child]:mb-0 [&_ul]:list-disc [&_ul]:ml-4 [&_ul]:mb-2 [&_ol]:list-decimal [&_ol]:ml-4 [&_ol]:mb-2 [&_code]:bg-muted [&_code]:px-1 [&_code]:py-0.5 [&_code]:rounded [&_code]:text-xs [&_code]:font-mono [&_pre]:bg-muted [&_pre]:p-2 [&_pre]:rounded [&_pre]:overflow-x-auto [&_pre]:mb-2 [&_pre_code]:block [&_pre_code]:p-0 [&_pre_code]:bg-transparent [&_pre_code]:m-0 [&_strong]:font-semibold [&_em]:italic ${admonitionStyles}`,
        className
      )}
    >
      <ReactMarkdown
        rehypePlugins={[rehypeRaw]}
        components={markdownComponents}
      >
        {descriptionMarkdown || "No description available."}
      </ReactMarkdown>
    </div>
  );
}
