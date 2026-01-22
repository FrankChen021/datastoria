import * as React from "react";

export interface Comparator {
  name: string;
  display: React.ReactNode;

  // If not given, default to false
  allowMultiValue?: boolean;
}

export class ComparatorManager {
  private static readonly comparatorGroups: Comparator[][] = [
    // Note: the EQ must be the first so that it's the default
    [
      { name: "=", display: "=" },
      { name: "!=", display: "!=" },
    ],
    [
      { name: "in", display: "in", allowMultiValue: true },
      { name: "not in", display: "ni", allowMultiValue: true },
    ],
    [
      { name: "<", display: "<" },
      { name: "<=", display: "<=" },
      { name: ">", display: ">" },
      { name: ">=", display: ">=" },
    ],
    [
      { name: "contains", display: "c" },
      { name: "not contains", display: "nc" },
    ],
    [
      { name: "startsWith", display: "s" },
      { name: "not startsWith", display: "ns" },
      { name: "endsWith", display: "e" },
      { name: "not endsWith", display: "ne" },
    ],
  ];

  public static getComparatorGroups(comparators: string[]): Comparator[][] {
    if (!comparators || comparators.length === 0) {
      return this.comparatorGroups;
    }

    const filteredGroups: Comparator[][] = [];
    for (const group of this.comparatorGroups) {
      const matchingComparators = group.filter(
        (comparator) => comparator.name && comparators.includes(comparator.name)
      );

      if (matchingComparators.length > 0) {
        filteredGroups.push(matchingComparators);
      }
    }

    if (filteredGroups.length === 0) {
      // If no comparators match, return only the default equals comparator
      return [[this.comparatorGroups[0][0]]];
    }

    return filteredGroups;
  }

  public static parseComparator(name: string): Comparator {
    if (name === undefined || name === "") {
      // default to EQ
      return this.comparatorGroups[0][0];
    }
    for (const comparators of this.comparatorGroups) {
      for (const comparator of comparators) {
        if (comparator.name === name) {
          return comparator;
        }
      }
    }

    // default to EQ
    return this.comparatorGroups[0][0];
  }
}

function escapeSingleQuotes(str: string): string {
  return str.replace(/'/g, "\\'");
}

export class QueryPattern {
  // If the value is multi value
  isMultiValue: boolean;
  comparator: string;
  values: string[];

  /**
   * We can use the values.length to determine if it's multi value because for multi values, the values will be an array of a single value
   */
  public constructor(isMultiValue: boolean, comparator: string, values: string[]) {
    this.isMultiValue = isMultiValue === undefined ? false : isMultiValue;
    this.comparator = comparator;
    this.values = values;
  }

  public toQueryString(name: string): string {
    if (this.values.length === 0) {
      return "";
    }
    if (this.isMultiValue) {
      return `${name} ${this.comparator} (${this.values.map((v) => `'${escapeSingleQuotes(v ?? "")}'`).join(",")})`;
    } else {
      return `${name} ${this.comparator} '${escapeSingleQuotes(this.values[0] ?? "")}'`;
    }
  }

  public static fromSearchParams(
    searchParams: URLSearchParams,
    filter: (param: string) => boolean
  ): Map<string, QueryPattern> {
    const queryParams: Map<string, QueryPattern> = new Map();
    searchParams.forEach((value, key) => {
      if (value === "") {
        return;
      }
      if (filter && !filter(key)) {
        return;
      }

      const comparator = ComparatorManager.parseComparator(
        searchParams.get(key + "_comparator") ?? "="
      );
      const values =
        (comparator.allowMultiValue ?? false) ? value.split(",").map((v) => v.trim()) : [value];
      queryParams.set(
        key,
        new QueryPattern(comparator.allowMultiValue ?? false, comparator.name, values)
      );
    });
    return queryParams;
  }
}

/**
 * Replace unqualified table names in SQL with fully qualified names.
 * Only replaces table references (after FROM, JOIN, INTO, etc.), not column references.
 *
 * @param sql - The SQL query string
 * @param tables - Array of fully qualified table names (e.g., ["bithon.bithon_trace_span"])
 * @returns SQL with fully qualified table names
 */
export function qualifyTableNames(sql: string, tables: string[]): string {
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
