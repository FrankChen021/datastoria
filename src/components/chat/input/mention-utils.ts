import type { DatabaseInfo } from "@/lib/connection/connection";

/**
 * Regular expression to match table tokens in the format `database.table`
 * Matches when followed by:
 * - Whitespace characters
 * - Common punctuation: ? ! . , ; : ) ] }
 * - End of string
 *
 * Examples that match:
 * - "`system.query_log`" (followed by space or end)
 * - "`system.query_log`?" (followed by question mark)
 * - "`system.query_log`!" (followed by exclamation)
 * - "`system.query_log`." (followed by period)
 */
export const TABLE_MENTION_REGEX = /`([\w]+\.[\w]+)`(?=[\s?!.,;:)\]}]|$)/g;

export interface TableMentionMatch {
  value: string;
  text: string;
  start: number;
  end: number;
}

export const DATABASE_MENTION_REGEX = /`([A-Za-z_][\w]*)`(?=[\s?!.,;:)\]}]|$)/g;

export interface DatabaseMentionMatch {
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

export function getDatabaseMentionMatches(
  text: string,
  databaseNames: Map<string, DatabaseInfo> | undefined
): DatabaseMentionMatch[] {
  if (!databaseNames || databaseNames.size === 0) {
    return [];
  }

  const regex = new RegExp(DATABASE_MENTION_REGEX.source, DATABASE_MENTION_REGEX.flags);
  const matches: DatabaseMentionMatch[] = [];

  for (const match of text.matchAll(regex)) {
    const value = match[1];
    if (!value || !databaseNames.has(value)) {
      continue;
    }

    const start = match.index ?? 0;
    const tokenText = match[0];

    matches.push({
      value,
      text: tokenText,
      start,
      end: start + tokenText.length,
    });
  }

  return matches;
}
