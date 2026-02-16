import type { TimeSpan } from "./timespan-selector";

/**
 * A fluent builder for constructing SQL queries with various template replacements.
 */
export class SQLQueryBuilder {
  private sql: string;

  constructor(sql: string) {
    this.sql = sql;
  }

  private static calculateTimeSpanParams(selectedTimeSpan: TimeSpan) {
    const startTime = new Date(selectedTimeSpan.startISO8601);
    const endTime = new Date(selectedTimeSpan.endISO8601);
    const seconds = Math.floor((endTime.getTime() - startTime.getTime()) / 1000);

    // Calculate rounding based on time span (default to 1/100 of the range, minimum 1 second)
    const rounding = Math.max(1, Math.floor(seconds / 100));

    const startTimestamp = Math.floor(startTime.getTime() / 1000);
    const endTimestamp = Math.floor(endTime.getTime() / 1000);

    return {
      seconds,
      rounding,
      startTimestamp,
      endTimestamp,
    };
  }

  private static formatTimestamp(secondsSinceEpoch: number, timezone: string): string {
    const date = new Date(secondsSinceEpoch * 1000);
    return date
      .toLocaleString("en-CA", {
        timeZone: timezone,
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
        hour12: false,
      })
      .replace(",", "");
  }

  private static replaceTimeSpanParams(
    sql: string,
    timeSpan: TimeSpan | undefined,
    timezone: string
  ): string {
    if (!timeSpan) {
      return sql;
    }
    const params = SQLQueryBuilder.calculateTimeSpanParams(timeSpan);

    sql = sql.replace(/{rounding:UInt32}/g, String(params.rounding));
    sql = sql.replace(/{seconds:UInt32}/g, String(params.seconds));
    sql = sql.replace(/{startTimestamp:UInt32}/g, String(params.startTimestamp));
    sql = sql.replace(/{endTimestamp:UInt32}/g, String(params.endTimestamp));

    // Replace timestamp placeholders in milliseconds
    sql = sql.replace(/{startTimestampMs:UInt64}/g, String(params.startTimestamp * 1_000));
    sql = sql.replace(/{endTimestampMs:UInt64}/g, String(params.endTimestamp * 1_000));

    // Replace timestamp placeholders in microseconds
    sql = sql.replace(/{startTimestampUs:UInt64}/g, String(params.startTimestamp * 1_000_000));
    sql = sql.replace(/{endTimestampUs:UInt64}/g, String(params.endTimestamp * 1_000_000));

    sql = sql.replace(
      /{from:String}/g,
      `'${SQLQueryBuilder.formatTimestamp(params.startTimestamp, timezone)}'`
    );
    sql = sql.replace(
      /{to:String}/g,
      `'${SQLQueryBuilder.formatTimestamp(params.endTimestamp, timezone)}'`
    );

    return sql.trim();
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
      this.sql = SQLQueryBuilder.replaceTimeSpanParams(this.sql, timeSpan, timezone);
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
