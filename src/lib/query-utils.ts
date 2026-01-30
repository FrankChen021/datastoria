import { format as formatSQL } from "sql-formatter";

export class QueryUtils {
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
   * Comment out the trailing FORMAT &lt;format_name&gt; clause so it is preserved for debugging
   * but does not affect execution. Case-insensitive.
   */
  public static commentOutFormatClause(sql: string): string {
    return sql.replace(/\s+(FORMAT\s+\w+)\s*$/i, " /* $1 */");
  }

  /**
   * Build EXPLAIN query string from SQL. Strips comments, trailing \G, comments out trailing
   * FORMAT clause, then prefixes with EXPLAIN &lt;type&gt;. Returns { explainSQL, rawSQL };
   * rawSQL is empty when input yields no SQL.
   */
  public static toExplainSQL(type: string, sql: string): { explainSQL: string; rawSQL: string } {
    let rawSQL = QueryUtils.removeComments(sql);
    if (rawSQL.endsWith("\\G")) {
      rawSQL = rawSQL.substring(0, rawSQL.length - 2);
    }
    rawSQL = QueryUtils.commentOutFormatClause(rawSQL);
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
}
