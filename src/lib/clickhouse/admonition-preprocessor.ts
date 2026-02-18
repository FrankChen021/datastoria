/**
 * Admonition blocks (:::note, :::warning, etc.) for markdown.
 * Used by marked extension (query-suggestion-manager) and preprocessor (ReactMarkdown).
 */
import { marked } from "marked";

/** Regex for a single admonition block. Use with exec() or add 'g' for replace(). */
const ADMONITION_REGEX = /^(\s*):::([a-zA-Z]+)\s*\n([\s\S]*?)\n\s*:::/;

function stripIndentation(content: string, indentation: string): string {
  if (!indentation) return content;
  const lines = content.split("\n");
  return lines
    .map((line: string) => (line.startsWith(indentation) ? line.slice(indentation.length) : line))
    .join("\n");
}

function formatAdmonitionTitle(type: string): string {
  return type.charAt(0).toUpperCase() + type.slice(1);
}

/** Build admonition HTML. Classes include both "admonition-note" (Tailwind) and "note" (ACE editor CSS). */
function buildAdmonitionHtml(type: string, title: string, contentHtml: string): string {
  return `<div class="admonition admonition-${type} ${type}"><div class="admonition-title">${title}</div><div class="admonition-content">${contentHtml.trim()}</div></div>`;
}

/** Marked extension for :::type blocks. Pass to marked.use({ extensions: [markedAdmonitionExtension] }). */
export const markedAdmonitionExtension = {
  name: "admonition",
  level: "block" as const,
  start(src: string) {
    return src.match(/^\s*:::([a-zA-Z]+)/)?.index;
  },
  tokenizer(src: string) {
    const match = ADMONITION_REGEX.exec(src);
    if (!match) return undefined;
    const [, indentation, type, content] = match;
    const text = stripIndentation(content, indentation || "").trim();
    const token = {
      type: "admonition",
      raw: match[0],
      text,
      displayType: type,
      tokens: [] as unknown[],
    };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- marked extension context
    (this as any).lexer.blockTokens(token.text, token.tokens);
    return token;
  },
  renderer(token: { displayType?: string; tokens?: unknown[] }) {
    const type = token.displayType || "note";
    const title = formatAdmonitionTitle(type);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- marked extension context
    const contentHtml = ((this as any).parser.parse(token.tokens || []) as string).trim();
    return buildAdmonitionHtml(type, title, contentHtml);
  },
};

/** Custom renderer so links in admonition content open in new tab */
const admonitionRenderer = new marked.Renderer();
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- marked link renderer uses internal token types
admonitionRenderer.link = function ({
  href,
  title,
  tokens,
}: {
  href: string | null;
  title?: string | null;
  tokens: any;
}) {
  const text = this.parser
    ? this.parser.parseInline(tokens)
    : (tokens as Array<{ raw?: string; text?: string }>).map((t) => t.raw ?? t.text ?? "").join("");
  if (!href) return text;
  const titleAttr = title ? ` title="${title}"` : "";
  return `<a href="${href}" target="_blank" rel="noopener noreferrer"${titleAttr}>${text}</a>`;
};

/**
 * Preprocesses markdown to convert :::type blocks (e.g. :::note, :::warning) into HTML
 * that can be rendered by ReactMarkdown with rehype-raw.
 *
 * Matches the same syntax as ClickHouse docs and query-suggestion-manager.
 */
export function preprocessAdmonitions(markdown: string): string {
  if (!markdown) return markdown;

  const rule = new RegExp(ADMONITION_REGEX.source, "gm");

  return markdown.replace(rule, (_match, indentation, type, content) => {
    const text = stripIndentation(content, indentation || "").trim();
    const htmlContent = marked.parse(text, {
      async: false,
      renderer: admonitionRenderer,
    }) as string;
    const title = formatAdmonitionTitle(type);
    return buildAdmonitionHtml(type, title, htmlContent);
  });
}
