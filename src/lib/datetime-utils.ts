import { format, formatISO } from "date-fns";

/**
 * Utility class for date and time operations
 */
export class DateTimeExtension {

  static toYYYYMMddHHmmss(date: Date): string {
    try {
      return format(date, "yyyy-MM-dd HH:mm:ss");
    } catch {
      return 'Invalid date' + date;
    }
  }

  static toMMddHHmmssSSS(date: Date): string {
    return format(date, "MM-dd HH:mm:ss.SSS");
  }

  static toMMddHHmmss(date: Date): string {
    return format(date, "MM-dd HH:mm:ss");
  }

  /**
   * Format date with custom format string
   */
  static formatDateTime(date: Date | undefined, fmt: string): string | undefined {
    return date === undefined ? undefined : format(date, fmt);
  }

  /**
   * Floor a date to the nearest multiple of duration
   * @param date The date to floor
   * @param duration Duration in milliseconds
   */
  static floor(date: Date, duration: number): Date {
    return new Date(Math.floor(date.getTime() / duration) * duration);
  }

  /**
   * Floor a date to the start of the day (00:00:00)
   */
  static floorToDay(date: Date): Date {
    return DateTimeExtension.floor(date, 1000 * 60 * 60 * 24);
  }

  /**
   * Format date to ISO 8601 format
   */
  static formatISO8601(date: Date | undefined): string {
    return date === undefined ? "" : formatISO(date.valueOf());
  }

  /**
   * Apply a time offset to a date
   * @param date The base date
   * @param offset Offset expression like "-1h", "+2d"
   */
  static offset(date: Date, offset: string): Date {
    const offsetSeconds = DateTimeExtension.parseOffsetExpression(offset);
    return new Date(date.getTime() + offsetSeconds * 1000);
  }

  /**
   * Parse a time offset expression and convert it to seconds.
   *
   * Format: (+|-)?(\d+)(s|m|h|d)
   * - Sign: Optional '+' or '-' (default is '+' if omitted)
   * - Number: Required integer value
   * - Unit: Required time unit (s=seconds, m=minutes, h=hours, d=days)
   *
   * Examples:
   * - "-1m" = -60 seconds (1 minute ago)
   * - "+2h" = 7200 seconds (2 hours in the future)
   * - "3d" = 259200 seconds (3 days in the future)
   *
   * @param expression The offset expression to parse
   * @returns The total number of seconds represented by the expression
   * @throws Error if the expression format is invalid
   */
  static parseOffsetExpression(expression: string): number {
    // Regex to match the pattern: optional sign, one or more digits, single unit character
    const regex = /^([+-])?(\d+)([smhd])$/;
    const match = expression.match(regex);

    if (!match) {
      throw new Error(`Invalid offset expression: ${expression}. Expected format: (+|-)?\\d+(s|m|h|d)`);
    }

    const [, sign = "+", value, unit] = match;
    const numericValue = parseInt(value, 10);

    // Convert to seconds based on the unit
    let seconds: number;
    switch (unit) {
      case "s":
        seconds = numericValue;
        break;
      case "m":
        seconds = numericValue * 60; // 60 seconds in a minute
        break;
      case "h":
        seconds = numericValue * 60 * 60; // 3600 seconds in an hour
        break;
      case "d":
        seconds = numericValue * 60 * 60 * 24; // 86400 seconds in a day
        break;
      default:
        throw new Error(`Unsupported time unit: ${unit}`);
    }

    // Apply sign
    return sign === "-" ? -seconds : seconds;
  }

  /**
   * Get current time in ISO 8601 format
   */
  static nowISO8601(): string {
    return DateTimeExtension.formatISO8601(new Date());
  }
}
