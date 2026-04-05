import type { Connection } from "@/lib/connection/connection";

/**
 * Regular expression to match table mentions in the format @database.table
 * Matches when followed by:
 * - Whitespace characters
 * - Common punctuation: ? ! . , ; : ) ] }
 * - End of string
 *
 * Examples that match:
 * - "@system.query_log" (followed by space or end)
 * - "@system.query_log?" (followed by question mark)
 * - "@system.query_log!" (followed by exclamation)
 * - "@system.query_log." (followed by period)
 */
export const TABLE_MENTION_REGEX = /@([\w]+\.[\w]+)(?=[\s?!.,;:)\]}]|$)/g;

export interface TableMentionMatch {
  value: string;
  text: string;
  start: number;
  end: number;
}

export function extractTableMentions(text: string): string[] {
  const matches = text.match(TABLE_MENTION_REGEX);
  return matches ? Array.from(new Set(matches.map((m) => m.substring(1)))) : [];
}

export function getTableMentionMatches(text: string): TableMentionMatch[] {
  const regex = new RegExp(TABLE_MENTION_REGEX.source, TABLE_MENTION_REGEX.flags);
  const matches: TableMentionMatch[] = [];

  for (const match of text.matchAll(regex)) {
    const start = match.index ?? 0;
    const tokenText = match[0];

    matches.push({
      value: match[1],
      text: tokenText,
      start,
      end: start + tokenText.length,
    });
  }

  return matches;
}

export function removeTableMentionAt(text: string, start: number, end: number): string {
  const before = text.slice(0, start);
  const after = text.slice(end);

  if (before.endsWith(" ") && after.startsWith(" ")) {
    return before + after.slice(1);
  }

  return before + after;
}

export const MAX_COLUMNS_PER_TABLE = 100;

export function getTableContextByMentions(
  text: string,
  connection: Connection
):
  | Array<{
      name: string;
      columns: Array<{ name: string; type: string }>;
      totalColumns?: number;
    }>
  | undefined {
  const mentions = extractTableMentions(text);
  if (mentions.length === 0) return undefined;

  const tableNames = connection.metadata.tableNames;
  if (!tableNames) return undefined;

  const results: Array<{
    name: string;
    columns: Array<{ name: string; type: string }>;
    totalColumns?: number;
  }> = [];

  for (const mention of mentions) {
    const tableInfo = tableNames.get(mention);
    if (tableInfo && tableInfo.columns) {
      // Handle both old format (string[]) and new format (Array<{name, type}>)
      const allColumns =
        typeof tableInfo.columns[0] === "string"
          ? (tableInfo.columns as string[]).map((name) => ({ name, type: "Unknown" }))
          : (tableInfo.columns as Array<{ name: string; type: string }>);

      const totalColumns = allColumns.length;
      const isTruncated = totalColumns > MAX_COLUMNS_PER_TABLE;
      const columns = isTruncated ? allColumns.slice(0, MAX_COLUMNS_PER_TABLE) : allColumns;

      results.push({
        name: mention,
        columns: columns,
        totalColumns: totalColumns,
      });
    }
  }

  return results.length > 0 ? results : undefined;
}
