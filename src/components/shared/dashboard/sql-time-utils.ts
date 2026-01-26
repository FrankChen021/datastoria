import type { TimeSpan } from "./timespan-selector";

/**
 * Calculates time span parameters from a TimeSpan object
 * @param selectedTimeSpan The selected time span
 * @returns Object containing calculated parameters
 */
export function calculateTimeSpanParams(selectedTimeSpan: TimeSpan) {
  const startTime = new Date(selectedTimeSpan.startISO8601);
  const endTime = new Date(selectedTimeSpan.endISO8601);
  const seconds = Math.floor((endTime.getTime() - startTime.getTime()) / 1000);

  // Calculate rounding based on time span (default to 1/100 of the range, minimum 1 second)
  const rounding = Math.max(1, Math.floor(seconds / 100));

  // Calculate seconds-based timestamps
  const startTimestamp = Math.floor(startTime.getTime() / 1000);
  const endTimestamp = Math.floor(endTime.getTime() / 1000);

  return {
    seconds,
    rounding,
    startTimestamp,
    endTimestamp,
  };
}

function toStringFormat(secondsSinceEpoch: number, timezone: string): string {
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

/**
 * Replaces time span template parameters in SQL query with actual values.
 *
 * This is a low-level utility function for time span replacement only.
 * For complete SQL transformation with connection context, use SQLQueryBuilder instead.
 *
 * Supported parameters:
 * - {rounding:UInt32} -> rounding value (1/100 of time span, minimum 1)
 * - {seconds:UInt32} -> seconds value (duration in seconds)
 * - {startTimestamp:UInt32} -> startTimestamp value (seconds-based Unix timestamp)
 * - {endTimestamp:UInt32} -> endTimestamp value (seconds-based Unix timestamp)
 * - {from:String} -> start time as string in format 'YYYY-MM-DD HH:mm:ss' in the given timezone
 * - {to:String} -> end time as string in format 'YYYY-MM-DD HH:mm:ss' in the given timezone
 *
 * @param sql The SQL query string with template parameters
 * @param timeSpan The selected time span
 * @param timezone The SERVER timezone to use for time-based queries
 * @returns The SQL query with parameters replaced
 *
 * @see SQLQueryBuilder For complete SQL transformation including cluster templates
 */
export function replaceTimeSpanParams(
  sql: string,
  timeSpan: TimeSpan | undefined,
  timezone: string
): string {
  if (!timeSpan) {
    return sql;
  }
  const params = calculateTimeSpanParams(timeSpan);

  sql = sql.replace(/{rounding:UInt32}/g, String(params.rounding));
  sql = sql.replace(/{seconds:UInt32}/g, String(params.seconds));
  sql = sql.replace(/{startTimestamp:UInt32}/g, String(params.startTimestamp));
  sql = sql.replace(/{endTimestamp:UInt32}/g, String(params.endTimestamp));

  sql = sql.replace(/{from:String}/g, `'${toStringFormat(params.startTimestamp, timezone)}'`);
  sql = sql.replace(/{to:String}/g, `'${toStringFormat(params.endTimestamp, timezone)}'`);

  return sql.trim();
}
