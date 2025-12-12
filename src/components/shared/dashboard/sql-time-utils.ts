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

/**
 * Replaces time span template parameters in SQL query with actual values
 * Supported parameters:
 * - {rounding:UInt32} -> rounding value (1/100 of time span, minimum 1)
 * - {seconds:UInt32} -> seconds value (duration in seconds)
 * - {startTimestamp:UInt32} -> startTimestamp value (seconds-based Unix timestamp)
 * - {endTimestamp:UInt32} -> endTimestamp value (seconds-based Unix timestamp)
 *
 * @param sql The SQL query string with template parameters
 * @param selectedTimeSpan The selected time span
 * @returns The SQL query with parameters replaced
 */
export function replaceTimeSpanParams(sql: string, selectedTimeSpan: TimeSpan): string {
  const params = calculateTimeSpanParams(selectedTimeSpan);

  sql = sql.replace(/{rounding:UInt32}/g, String(params.rounding));
  sql = sql.replace(/{seconds:UInt32}/g, String(params.seconds));
  sql = sql.replace(/{startTimestamp:UInt32}/g, String(params.startTimestamp));
  sql = sql.replace(/{endTimestamp:UInt32}/g, String(params.endTimestamp));

  return sql;
}
