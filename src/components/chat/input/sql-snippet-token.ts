import { InlineToken, type InlineTokenMatch } from "./inline-token";

const SQL_SNIPPET_TOKEN_PREFIX = "<<sql:";
const SQL_SNIPPET_TOKEN_SUFFIX = ">>";
const SQL_SNIPPET_TOKEN_REGEX = /<<sql:([^>]+)>>/g;

export interface SqlSnippetMatch extends InlineTokenMatch {
  sql: string;
  label: string;
}

export class SqlSnippetToken extends InlineToken<string, SqlSnippetMatch> {
  constructor() {
    super(SQL_SNIPPET_TOKEN_PREFIX, SQL_SNIPPET_TOKEN_SUFFIX, SQL_SNIPPET_TOKEN_REGEX);
  }

  expand(input: string): string {
    let cursor = 0;
    let output = "";

    for (const match of this.getMatches(input)) {
      const before = input.slice(cursor, match.start);
      const after = input.slice(match.end);
      const needsLeadingBlankLine = before.length > 0 && !before.endsWith("\n\n");
      const needsTrailingBlankLine = after.length > 0 && !after.startsWith("\n");

      output += needsLeadingBlankLine ? before.replace(/[ \t]+$/, "") : before;
      if (needsLeadingBlankLine) {
        output += before.endsWith("\n") ? "\n" : "\n\n";
      }
      output += `\`\`\`sql\n${match.sql}\n\`\`\``;
      if (needsTrailingBlankLine) {
        output += "\n";
      }
      cursor = match.end;
    }

    output += input.slice(cursor);
    return output;
  }

  protected decode(encodedPayload: string): string {
    try {
      return decodeURIComponent(encodedPayload);
    } catch {
      return encodedPayload;
    }
  }

  protected createMatch(
    text: string,
    start: number,
    end: number,
    payload: string
  ): SqlSnippetMatch {
    return {
      text,
      start,
      end,
      sql: payload,
      label: this.normalizeLabel(payload),
    };
  }

  private normalizeLabel(sql: string): string {
    const lines = sql
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter((line) => line.length > 0);

    const firstLine = (lines[0] ?? "SQL selection").replace(/\s+/g, " ");
    const truncated = firstLine.length > 36 ? `${firstLine.slice(0, 33)}...` : firstLine;
    const extraLineCount = Math.max(lines.length - 1, 0);

    if (extraLineCount === 0) {
      return truncated;
    }

    return `${truncated} (+${extraLineCount} line${extraLineCount === 1 ? "" : "s"})`;
  }
}

export const sqlSnippetTokenCodec = new SqlSnippetToken();
