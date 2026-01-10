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
    if (this.isMultiValue) {
      return `${name} ${this.comparator} (${this.values.map((v) => `'${escapeSingleQuotes(v)}'`).join(",")})`;
    } else {
      return `${name} ${this.comparator} '${escapeSingleQuotes(this.values[0])}'`;
    }
  }

  public static fromSearchParams(
    searchParams: URLSearchParams,
    filter: (param) => boolean
  ): Map<string, QueryPattern> {
    const queryParams: Map<string, QueryPattern> = new Map();
    searchParams.forEach((value, key) => {
      if (value === "") {
        return;
      }
      if (filter && !filter(key)) {
        return;
      }

      const comparator = ComparatorManager.parseComparator(searchParams.get(key + "_comparator"));
      const values = comparator.allowMultiValue ? value.split(",").map((v) => v.trim()) : [value];
      queryParams.set(key, new QueryPattern(comparator.allowMultiValue, comparator.name, values));
    });
    return queryParams;
  }
}
