/**
 * Shared utility functions for chart data transformation
 */

/**
 * Check if a column is a timestamp column (not a metric)
 */
export function isTimestampColumn(colName: string, colType?: string): boolean {
  const lower = colName.toLowerCase();

  // Exact matches for common timestamp column names
  if (colName === "t" || colName === "timestamp" || lower === "time" || lower === "date") {
    return true;
  }

  // Check by type if available (DateTime, Date, etc.)
  if (colType) {
    const typeLower = colType.toLowerCase();
    if (typeLower.includes("datetime") || typeLower.includes("date") || typeLower.includes("timestamp")) {
      return true;
    }
  }

  // Check by naming pattern: ends with _time with specific prefixes, or contains timestamp
  // But exclude metric columns like cpu_time, query_time, OSCPUVirtualTimeMicroseconds, etc.
  if (
    lower.endsWith("_time") &&
    (lower.startsWith("event_") ||
      lower.startsWith("start_") ||
      lower.startsWith("end_") ||
      lower.includes("timestamp"))
  ) {
    return true;
  }
  if (
    lower.startsWith("time_") ||
    (lower.includes("timestamp") &&
      !lower.includes("microseconds") &&
      !lower.includes("milliseconds") &&
      !lower.includes("nanoseconds"))
  ) {
    return true;
  }

  return false;
}

/**
 * Convert a value to timestamp in milliseconds
 */
export function convertToTimestampMs(value: unknown): number {
  if (typeof value === "string") {
    return new Date(value).getTime();
  } else if (typeof value === "number") {
    // If it's a small number (< 1e10), assume it's in seconds and convert to milliseconds
    return value > 1e10 ? value : value * 1000;
  } else {
    return new Date(String(value)).getTime();
  }
}

/**
 * Transform API rows/meta into chart-friendly data points
 */
export function transformRowsToChartData(
  inputRows: unknown[],
  inputMeta: Array<{ name: string; type?: string }>
): Record<string, unknown>[] {
  const first = inputRows[0];
  const arrayFormat = Array.isArray(first);

  return inputRows.map((row: unknown) => {
    const dataPoint: Record<string, unknown> = {};

    if (arrayFormat) {
      const rowArray = row as unknown[];
      inputMeta.forEach((colMeta: { name: string; type?: string }, index: number) => {
        const value = rowArray[index];
        const colName = colMeta.name;

        if (isTimestampColumn(colName, colMeta.type)) {
          dataPoint.timestamp = convertToTimestampMs(value);
          dataPoint[colName] = dataPoint.timestamp;
        } else {
          dataPoint[colName] = value;
        }
      });
    } else {
      const rowObject = row as Record<string, unknown>;
      Object.keys(rowObject).forEach((colName) => {
        const value = rowObject[colName];
        // Find the column type from meta if available
        const colMeta = inputMeta.find((m) => m.name === colName);
        if (isTimestampColumn(colName, colMeta?.type)) {
          dataPoint.timestamp = convertToTimestampMs(value);
          dataPoint[colName] = dataPoint.timestamp;
        } else {
          dataPoint[colName] = value;
        }
      });
    }

    return dataPoint;
  });
}

/**
 * Check if a column type is numeric
 */
export function isNumericType(type?: string): boolean {
  if (!type) return false;
  // ClickHouse numeric types
  return /(u?int|float|double|decimal)/i.test(type) && !/date|datetime/i.test(type);
}

/**
 * Check if a column has numeric values by sampling the data
 */
export function sampleIsNumeric(data: Record<string, unknown>[], col: string): boolean {
  // check a few rows for numeric value
  for (let i = 0; i < Math.min(5, data.length); i++) {
    const v = data[i][col];
    if (v === null || v === undefined) continue;
    if (typeof v === "number") return true;
    if (typeof v === "string" && v.trim() !== "" && !Number.isNaN(Number(v))) return true;
    return false;
  }
  return false;
}

/**
 * Pick the best timestamp column name from metadata
 */
export function pickTimestampColumn(metaNames: string[], data?: Record<string, unknown>[]): string {
  // Prefer common timestamp names first
  if (metaNames.includes("t")) return "t";
  
  const metaTime = metaNames.find((n) => {
    const lower = n.toLowerCase();
    return lower.includes("time") || lower.includes("date");
  });
  
  if (metaTime) return metaTime;
  
  // Fallback to derived 'timestamp' in transformed rows
  if (data && data.length > 0 && Object.prototype.hasOwnProperty.call(data[0], "timestamp")) {
    return "timestamp";
  }
  
  return "t";
}

/**
 * Classify columns into timestamp, labels, and metrics
 */
export function classifyColumns(
  allColumns: string[],
  meta: Array<{ name: string; type?: string }>,
  data: Record<string, unknown>[]
): {
  timestampKey: string;
  labelColumns: string[];
  metricColumns: string[];
} {
  const metaNames = meta.map((m) => m.name);
  const timestampKey = pickTimestampColumn(metaNames, data);

  // Classify non-time columns: numeric -> metric, otherwise label
  const candidateCols = allColumns.filter((c) => !isTimestampColumn(c, meta.find((m) => m.name === c)?.type));
  const metricColumns: string[] = [];
  const labelColumns: string[] = [];

  candidateCols.forEach((col) => {
    const metaType = meta.find((m) => m.name === col)?.type;
    if (isNumericType(metaType) || sampleIsNumeric(data, col)) {
      metricColumns.push(col);
    } else {
      labelColumns.push(col);
    }
  });

  return { timestampKey, labelColumns, metricColumns };
}


