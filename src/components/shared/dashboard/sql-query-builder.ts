import { replaceTimeSpanParams as replaceTimeSpanParamsUtil } from "./sql-time-utils";
import type { TimeSpan } from "./timespan-selector";

/**
 * A fluent builder for constructing SQL queries with various template replacements.
 */
export class SQLQueryBuilder {
  private sql: string;

  constructor(sql: string) {
    this.sql = sql;
  }

  /**
   * Replace time span template parameters in the SQL query.
   * Replaces: {rounding:UInt32}, {seconds:UInt32}, {startTimestamp:UInt32},
   *           {endTimestamp:UInt32}, {from:String}, {to:String}
   *
   * @param timeSpan The time span to use for replacement
   * @param timezone The timezone to use for time formatting (required)
   * @returns this builder for chaining
   */
  timeSpan(timeSpan: TimeSpan | undefined, timezone: string): this {
    if (timeSpan) {
      this.sql = replaceTimeSpanParamsUtil(this.sql, timeSpan, timezone);
    }
    return this;
  }

  /**
   * Replace filter expression placeholder in the SQL query.
   * Replaces: {filterExpression:String}
   *
   * @param expression The filter expression (defaults to "true" if not provided)
   * @returns this builder for chaining
   */
  filterExpression(expression?: string): this {
    this.sql = this.sql.replace(/{filterExpression:String}/g, expression || "1 = 1");
    return this;
  }

  /**
   * Replace a custom variable in the SQL query.
   * Replaces: {variableName} with the provided value
   *
   * @param variableName The name of the variable to replace (without braces)
   * @param value The value to replace with
   * @returns this builder for chaining
   */
  replace(variableName: string, value: string | number): this {
    const pattern = new RegExp(`\\{${variableName}\\}`, "g");
    this.sql = this.sql.replace(pattern, String(value));
    return this;
  }

  /**
   * Replace multiple custom variables in the SQL query.
   *
   * @param replacements An object mapping variable names to their replacement values
   * @returns this builder for chaining
   */
  replaceAll(replacements: Record<string, string | number>): this {
    for (const [key, value] of Object.entries(replacements)) {
      this.replace(key, value);
    }
    return this;
  }

  /**
   * Get the final SQL query string.
   *
   * @returns The processed SQL query
   */
  build(): string {
    return this.sql.trim();
  }

  /**
   * Get the current SQL query string without finalizing.
   * Useful for debugging or intermediate inspection.
   *
   * @returns The current SQL query state
   */
  toString(): string {
    return this.sql;
  }
}
