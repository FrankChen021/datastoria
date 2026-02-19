import { format as formatSQL } from "sql-formatter";

export interface ResolveExecutionSqlInput {
  selectedText: string;
  text: string;
  cursorRow: number;
  cursorColumn: number;
}

export type SqlStatementSplitter = "semicolon" | "newline" | "custom";
export interface SqlCustomSplitterOptions {
  value: string;
  isRegex: boolean;
}

export class SqlUtils {
  /**
   * Resolve which SQL should run from editor context.
   * - If text is selected, run selected text.
   * - Otherwise run current cursor line.
   */
  public static resolveExecutionSql(input: ResolveExecutionSqlInput): string {
    const selected = input.selectedText.trim();
    if (selected.length > 0) {
      return selected;
    }

    const allText = input.text;
    if (allText.trim().length === 0) {
      return "";
    }

    const lines = allText.split("\n");
    if (lines.length === 0) {
      return "";
    }

    const row = Math.max(0, Math.min(input.cursorRow, lines.length - 1));
    return (lines[row] || "").trim();
  }

  /**
   * Split SQL script text into executable statements.
   *
   * Strategy:
   * - `semicolon`: semicolon-aware split (ignores semicolons inside quotes/comments).
   * - `newline`: split by non-empty lines.
   *
   * Examples:
   * - splitSqlStatements("SELECT 1; SELECT 2;", "semicolon") -> ["SELECT 1;", "SELECT 2;"]
   * - splitSqlStatements("SELECT 1\nSELECT 2", "newline") -> ["SELECT 1", "SELECT 2"]
   */
  public static splitSqlStatements(
    text: string,
    splitter: SqlStatementSplitter = "semicolon",
    customSplitter?: SqlCustomSplitterOptions
  ): string[] {
    text = text.trim();
    if (text.length === 0) {
      return [];
    }

    if (splitter === "newline") {
      return text
        .split("\n")
        .map((line) => line.trim())
        .filter((line) => line.length > 0);
    }

    if (splitter === "custom") {
      return SqlUtils.splitByCustom(text, customSplitter);
    }

    return SqlUtils.splitBySemicolon(text);
  }

  /**
   * Format SQL query for pretty-printing using sql-formatter.
   */
  public static prettyFormatQuery(query: string): string {
    try {
      return formatSQL(query);
    } catch {
      return query;
    }
  }

  /**
   * Comment out the FORMAT &lt;format_name&gt; clause so it is preserved for debugging
   * but does not affect execution. Case-insensitive. Matches FORMAT &lt;word&gt; at end
   * or when followed by more SQL (e.g. SETTINGS).
   */
  public static commentOutFormatClause(sql: string): string {
    return sql.replace(/\s+(FORMAT\s+\w+)(?=\s|$)/gi, " /* $1 */");
  }

  /**
   * Build EXPLAIN query string from SQL. Strips comments, trailing \G, comments out trailing
   * FORMAT clause, then prefixes with EXPLAIN &lt;type&gt;. Returns { explainSQL, rawSQL };
   * rawSQL is empty when input yields no SQL.
   */
  public static toExplainSQL(type: string, sql: string): { explainSQL: string; rawSQL: string } {
    let rawSQL = SqlUtils.removeComments(sql);
    if (rawSQL.endsWith("\\G")) {
      rawSQL = rawSQL.substring(0, rawSQL.length - 2);
    }
    rawSQL = SqlUtils.commentOutFormatClause(rawSQL);
    if (rawSQL.length === 0) {
      return { explainSQL: "", rawSQL: "" };
    }
    let explainSQL: string;
    if (type === "pipeline") {
      explainSQL = `EXPLAIN pipeline graph = 1\n${rawSQL}`;
    } else if (type === "plan-indexes") {
      explainSQL = `EXPLAIN plan indexes = 1\n${rawSQL}`;
    } else if (type === "plan-actions") {
      explainSQL = `EXPLAIN plan actions = 1\n${rawSQL}`;
    } else {
      explainSQL = `EXPLAIN ${type}\n${rawSQL}`;
    }
    return { explainSQL, rawSQL };
  }

  /**
   * Remove single-line (--) and multiline (/* *\/) comments from SQL, then trim.
   */
  public static removeComments(sql: string): string {
    return (
      sql
        // Remove single-line comments
        .replace(/^--.*$/gm, "")
        // Remove multiline comments
        .replace(/\/\*[\s\S]*?\*\//g, "")
        // Replace multiple newlines (2+) with single newline
        .replace(/\n{2,}/g, "\n")
        .trim()
    );
  }

  /**
   * Escape single quotes in SQL strings to reduce SQL injection risk when embedding values into
   * single-quoted SQL literals.
   *
   * Note: Prefer parameterized queries when possible. When interpolating is unavoidable, this
   * follows SQL-standard escaping by doubling single quotes.
   */
  public static escapeSqlString(value: string): string {
    return String(value).replaceAll("'", "''");
  }

  /**
   * Escape a SQL identifier with backticks for ClickHouse and escape embedded backticks.
   */
  public static escapeSqlIdentifier(identifier: string): string {
    return `\`${String(identifier).replaceAll("`", "``")}\``;
  }

  /**
   * Replace unqualified table names in SQL with fully qualified names.
   * Only replaces table references (after FROM, JOIN, INTO, etc.), not column references.
   *
   * @param sql - The SQL query string
   * @param tables - Array of fully qualified table names (e.g., ["bithon.bithon_trace_span"])
   * @returns SQL with fully qualified table names
   */
  public static qualifyTableNames(sql: string, tables: string[]): string {
    if (!tables || tables.length === 0) {
      return sql;
    }

    // Build a map from unqualified name to fully qualified name
    const tableMap = new Map<string, string>();
    for (const fqn of tables) {
      const dotIndex = fqn.indexOf(".");
      if (dotIndex > 0) {
        const unqualifiedName = fqn.slice(dotIndex + 1);
        // Only add if not already mapped (first occurrence wins)
        if (!tableMap.has(unqualifiedName)) {
          tableMap.set(unqualifiedName, fqn);
        }
      }
    }

    if (tableMap.size === 0) {
      return sql;
    }

    // Replace unqualified table names that appear after table reference keywords
    // Keywords: FROM, JOIN, INTO, UPDATE, TABLE (case-insensitive)
    // Pattern matches: keyword + whitespace + unqualified_table_name (not already qualified)
    // Handles table names with or without quotes (double quotes or backticks)
    let result = sql;
    for (const [unqualified, qualified] of tableMap) {
      // Escape special regex characters in the unqualified table name
      const escapedUnqualified = unqualified.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

      // Match table name after keywords, ensuring it's not already qualified (no dot before it)
      // Handles: table_name, "table_name", `table_name`
      // Pattern: (keyword + whitespace) + (optional quote/backtick) + table_name + (optional matching quote/backtick)
      // and is followed by whitespace, newline, comma, parenthesis, or end of string
      const pattern = new RegExp(
        `(\\b(?:FROM|JOIN|INTO|UPDATE|TABLE)\\s+)(?!\\w+\\.)(["\`]?)(${escapedUnqualified})\\2(?=\\s|$|,|\\(|\\))`,
        "gi"
      );

      // Replace with qualified name, preserving quote style if present
      result = result.replace(pattern, (match, keyword, quote) => {
        if (quote) {
          // If the original had quotes, apply quotes to each part of the qualified name
          const [database, table] = qualified.split(".");
          return `${keyword}${quote}${database}${quote}.${quote}${table}${quote}`;
        }
        // No quotes, just use the qualified name as-is
        return `${keyword}${qualified}`;
      });
    }

    return result;
  }

  private static splitBySemicolon(sql: string): string[] {
    const statements: string[] = [];
    let statementStart = 0;

    let inSingleQuote = false;
    let inDoubleQuote = false;
    let inBacktick = false;
    let inLineComment = false;
    let inBlockComment = false;

    const pushStatement = (start: number, end: number) => {
      const part = sql.slice(start, end).trim();
      if (part.length > 0) {
        statements.push(part);
      }
    };

    // Single-pass scanner for statement boundaries while tracking SQL lexical states.
    for (let i = 0; i < sql.length; i++) {
      const ch = sql[i];
      const next = i + 1 < sql.length ? sql[i + 1] : "";

      if (inLineComment) {
        if (ch === "\n") {
          inLineComment = false;
        }
        continue;
      }

      if (inBlockComment) {
        if (ch === "*" && next === "/") {
          inBlockComment = false;
          i++;
        }
        continue;
      }

      if (inSingleQuote) {
        if (ch === "'" && next === "'") {
          i++;
          continue;
        }
        if (ch === "'") {
          inSingleQuote = false;
        }
        continue;
      }

      if (inDoubleQuote) {
        if (ch === '"' && next === '"') {
          i++;
          continue;
        }
        if (ch === '"') {
          inDoubleQuote = false;
        }
        continue;
      }

      if (inBacktick) {
        if (ch === "`" && next === "`") {
          i++;
          continue;
        }
        if (ch === "`") {
          inBacktick = false;
        }
        continue;
      }

      if (ch === "-" && next === "-") {
        inLineComment = true;
        i++;
        continue;
      }

      if (ch === "/" && next === "*") {
        inBlockComment = true;
        i++;
        continue;
      }

      if (ch === "'") {
        inSingleQuote = true;
        continue;
      }

      if (ch === '"') {
        inDoubleQuote = true;
        continue;
      }

      if (ch === "`") {
        inBacktick = true;
        continue;
      }

      if (ch === ";") {
        pushStatement(statementStart, i);
        statementStart = i + 1;
      }
    }

    pushStatement(statementStart, sql.length);
    return statements;
  }

  private static splitByCustom(sql: string, customSplitter?: SqlCustomSplitterOptions): string[] {
    const splitterValue = customSplitter?.value ?? "";
    if (splitterValue.trim().length === 0) {
      return [sql];
    }

    if (splitterValue === ";") {
      return SqlUtils.splitBySemicolon(sql);
    }

    try {
      const pattern = customSplitter?.isRegex
        ? new RegExp(splitterValue)
        : new RegExp(splitterValue.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));

      return sql
        .split(pattern)
        .map((part) => part.trim())
        .filter((part) => part.length > 0);
    } catch {
      // Invalid custom regex should not break flow; keep as single statement.
      return [sql];
    }
  }
}
