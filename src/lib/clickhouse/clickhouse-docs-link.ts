const DOC_BASE = "https://clickhouse.com/docs";

/**
 * Transforms a relative markdown link to an absolute ClickHouse documentation URL.
 *
 * @param type - The documentation section: "function", "setting", "server_setting", "settings", or default
 * @param link - The link URL from markdown (may be relative)
 * @returns The absolute URL
 */
export function transformMarkdownLink(type: string, link: string): string {
  if (/^https?:\/\//.test(link)) return link;

  // Remove .md suffix (e.g., "test.md" -> "test", "test.md#anchor" -> "test#anchor")
  const cleanLink = link.replace(/\.md(\/|#|\/#|$)/g, "$1");

  switch (type) {
    case "function":
      return `${DOC_BASE}/sql-reference/functions/${cleanLink.startsWith("/") ? cleanLink.slice(1) : cleanLink}`;
    case "setting":
      if (cleanLink.startsWith("#")) {
        return `${DOC_BASE}/operations/settings/settings${cleanLink}`;
      }
      if (cleanLink.startsWith("../")) {
        return `${DOC_BASE}/operations/settings/${cleanLink}`;
      } else {
        return `${DOC_BASE}/${cleanLink.startsWith("/") ? cleanLink.slice(1) : cleanLink}`;
      }
    case "server_setting":
      return `${DOC_BASE}/operations/server-configuration-parameters/settings${cleanLink.startsWith("/") ? cleanLink : "/" + cleanLink}`;
    default:
      return `${DOC_BASE}/${cleanLink.startsWith("/") ? cleanLink.slice(1) : cleanLink}`;
  }
}
