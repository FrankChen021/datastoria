import { showQueryDialog } from "@/components/shared/dashboard/dashboard-dialog-utils";
import { ThemedSyntaxHighlighter } from "@/components/shared/themed-syntax-highlighter";
import { Dialog } from "@/components/shared/use-dialog";
import { ArrowDown, ArrowUp, ArrowUpDown } from "lucide-react";
import React, { useMemo, useState } from "react";
import { DateTimeExtension } from "./datetime-utils";
import "./number-utils"; // Import to register Number prototype extensions
import { hostNameManager } from "./host-name-manager";
import { SqlUtils } from "./sql-utils";

// Helper function to format a value for display in table
function formatValueForDisplay(val: unknown, formatNumbers: boolean = false): string {
  if (val === null || val === undefined) {
    return "NULL";
  }
  if (typeof val === "object") {
    return JSON.stringify(val);
  }

  // Format numbers with comma_number if requested
  if (formatNumbers && typeof val === "number") {
    return val.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  }

  return String(val);
}

// Map table component with sorting support
function MapTableComponent({ mapData }: { mapData: Array<{ key: unknown; value: unknown }> }) {
  const [sort, setSort] = useState<{
    column: "key" | "value" | null;
    direction: "asc" | "desc" | null;
  }>({
    column: null,
    direction: null,
  });

  const handleSort = (column: "key" | "value") => {
    if (sort.column === column) {
      // Cycle through: desc -> asc -> null
      if (sort.direction === "desc") {
        setSort({ column, direction: "asc" });
      } else if (sort.direction === "asc") {
        setSort({ column: null, direction: null });
      } else {
        setSort({ column, direction: "desc" });
      }
    } else {
      // First click: sort in descending order
      setSort({ column, direction: "desc" });
    }
  };

  const getSortIcon = (column: "key" | "value") => {
    if (sort.column !== column) {
      return <ArrowUpDown className="inline-block w-4 h-4 ml-1 opacity-50" />;
    }
    if (sort.direction === "asc") {
      return <ArrowUp className="inline-block w-4 h-4 ml-1" />;
    }
    if (sort.direction === "desc") {
      return <ArrowDown className="inline-block w-4 h-4 ml-1" />;
    }
    return <ArrowUpDown className="inline-block w-4 h-4 ml-1 opacity-50" />;
  };

  const sortedData = useMemo(() => {
    if (!sort.column || !sort.direction) {
      return mapData;
    }

    return [...mapData].sort((a, b) => {
      const aValue = sort.column === "key" ? a.key : a.value;
      const bValue = sort.column === "key" ? b.key : b.value;

      // Handle null/undefined values
      const aVal = aValue == null ? "" : aValue;
      const bVal = bValue == null ? "" : bValue;

      // Compare values
      let comparison = 0;
      if (typeof aVal === "number" && typeof bVal === "number") {
        comparison = aVal - bVal;
      } else {
        comparison = String(aVal).localeCompare(String(bVal));
      }

      return sort.direction === "asc" ? comparison : -comparison;
    });
  }, [mapData, sort]);

  return (
    <div className="overflow-auto max-h-[60vh]">
      <table className="w-full border-collapse text-sm">
        <thead className="sticky top-0 bg-background z-10">
          <tr className="border-b">
            <th
              className="text-left p-2 font-semibold cursor-pointer hover:bg-muted/50 select-none bg-background"
              onClick={() => handleSort("key")}
            >
              Key
              {getSortIcon("key")}
            </th>
            <th
              className="text-left p-2 font-semibold cursor-pointer hover:bg-muted/50 select-none bg-background"
              onClick={() => handleSort("value")}
            >
              Value
              {getSortIcon("value")}
            </th>
          </tr>
        </thead>
        <tbody>
          {sortedData.length === 0 ? (
            <tr>
              <td colSpan={2} className="p-4 text-center text-muted-foreground">
                Empty map
              </td>
            </tr>
          ) : (
            sortedData.map((entry, index) => (
              <tr key={index} className="border-b hover:bg-muted/50">
                <td className="p-2 whitespace-nowrap">{formatValueForDisplay(entry.key)}</td>
                <td className="p-2 break-words">{formatValueForDisplay(entry.value, true)}</td>
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  );
}

export type FormatName =
  | "json_string"
  | "percentage"
  | "percentage_0_1" // for number in the range of [0,1]. input: 0.1, output: 10%
  | "percentage_bar" // Renders a rectangular bar showing the percentage value
  | "nanosecond"
  | "millisecond"
  | "microsecond"
  | "seconds"
  | "binary_size"
  | "binary_size_per_second"
  | "short_number"
  | "comma_number" // input: 1234567, output: 1,234,567
  | "byte_rate"
  | "rate"
  | "dateTime" // Deprecated
  | "shortDateTime" // Deprecated
  // DateTime Formatter
  | "yyyyMMddHHmmss"
  | "yyyyMMddHHmmssSSS"
  | "MMddHHmmss"
  | "MMddHHmmssSSS"
  | "timeDuration" // Format to string like: 1 day, 1 hour, 1 minute, 1 second
  | "timeDiff" // Format the difference of given number in milliseconds and current time stamp in the format of: xxx seconds ago
  | "relativeTime" // Format the given number in milliseconds to string like: 1 day, 1 hour, 1 minute, 1 second
  | "days"
  | "index" // For compability, SHOULD not be used
  | "binary_byte" // For compatibility only, use binary_size instead
  | "time" // For compatibility only, use DateTime formatter above instead
  | "template"
  | "detail" // For table only
  | "sql" // For SQL queries - shows truncated text with click-to-expand dialog
  | "map" // For Map types - shows Map(N entries) with click-to-expand table dialog
  | "complexType" // For complex types (Array, Tuple, JSON) - shows truncated JSON with click-to-expand dialog
  | "truncatedText"
  | "shortHostName"
  | "inline_sql"; // render the SQL in place // For long text - shows truncated text with click-to-expand dialog, accepts truncation length via formatArgs

// Formatter function interface - matches the signature used by Formatter class
// Third parameter (context) is optional. For the formatter in a table, the context is the row object of a cell

export interface ObjectFormatter {
  (v: unknown, params?: unknown[], context?: Record<string, unknown>): string | React.ReactNode;
}

export class Formatter {
  private static instance: Formatter;

  _formatters: { [key: string]: ObjectFormatter };

  private constructor() {
    this._formatters = {};

    // For compatibility only, use binary_size instead
    this._formatters["binary_byte"] = (v) => {
      if (v === undefined || v === null) return "null";
      const numValue = typeof v === "number" ? v : Number(v);
      return isNaN(numValue)
        ? "null"
        : (numValue as number & { formatBinarySize(): string }).formatBinarySize();
    };
    this._formatters["binary_size"] = (v) => {
      if (v === undefined || v === null) return "null";
      const numValue = typeof v === "number" ? v : Number(v);
      return isNaN(numValue)
        ? "null"
        : (numValue as number & { formatBinarySize(): string }).formatBinarySize();
    };
    this._formatters["binary_size_per_second"] = (v) => {
      if (v === undefined || v === null) return "null/s";
      const numValue = typeof v === "number" ? v : Number(v);
      return isNaN(numValue)
        ? "null/s"
        : (numValue as number & { formatBinarySize(): string }).formatBinarySize() + "/s";
    };

    // For compatiblity only, use short_number instead
    this._formatters["compact_number"] = (v) => {
      if (v === undefined || v === null) return "null";
      const numValue = typeof v === "number" ? v : Number(v);
      return isNaN(numValue)
        ? "null"
        : (numValue as number & { formatCompactNumber(): string }).formatCompactNumber();
    };
    this._formatters["short_number"] = (v) => {
      if (v === undefined || v === null) return "null";
      const numValue = typeof v === "number" ? v : Number(v);
      return isNaN(numValue)
        ? "null"
        : (numValue as number & { formatCompactNumber(): string }).formatCompactNumber();
    };

    this._formatters["comma_number"] = (v) => {
      return v === undefined || v === null
        ? "null"
        : v.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",");
    };

    this._formatters["percentage"] = (v) => {
      if (v === "NaN" || v === undefined || v === null) return "0%";
      const numValue = typeof v === "number" ? v : Number(v);
      return isNaN(numValue)
        ? "0%"
        : (
            numValue as number & { formatWithNoTrailingZeros(fraction: number): string }
          ).formatWithNoTrailingZeros(2) + "%";
    };
    this._formatters["percentage_0_1"] = (v) => {
      if (v === "NaN" || v === undefined || v === null) return "0%";
      const numValue = typeof v === "number" ? v : Number(v);
      const multiplied = numValue * 100;
      return isNaN(numValue)
        ? "0%"
        : (
            multiplied as number & { formatWithNoTrailingZeros(fraction: number): string }
          ).formatWithNoTrailingZeros(2) + "%";
    };
    this._formatters["percentage_bar"] = (v, params) => {
      // Ensure value is a number
      const numValue = typeof v === "number" ? v : parseFloat(String(v)) || 0;

      // Clamp value between 0 and 100
      const percentage = Math.max(0, Math.min(100, numValue));

      // Get width from args (first element in params array, or default to 100)
      const width = typeof params?.[0] === "number" ? params[0] : 100;

      // Get height from args (second element in params array, or default to 16)
      const height = typeof params?.[1] === "number" ? params[1] : 16;

      return (
        <div className="flex items-center gap-2">
          <div
            className="relative bg-muted rounded-sm overflow-hidden"
            style={{ width: `${width}px`, height: `${height}px` }}
          >
            <div className="h-full bg-primary transition-all" style={{ width: `${percentage}%` }} />
          </div>
          <span className="text-xs tabular-nums">{percentage.toFixed(1)}%</span>
        </div>
      );
    };
    this._formatters["nanosecond"] = (v) => this.nanoFormat(v, 2);
    this._formatters["millisecond"] = (v) => this.milliFormat(v, 2);
    this._formatters["microsecond"] = (v) => this.microFormat(v, 2);
    this._formatters["seconds"] = (v) =>
      this.timeFormat(typeof v === "number" ? v : Number(v), 2, ["s"]);
    this._formatters["byte_rate"] = (v) => {
      if (v === undefined || v === null) return "null/s";
      const numValue = typeof v === "number" ? v : Number(v);
      return isNaN(numValue)
        ? "null/s"
        : (numValue as number & { formatBinarySize(): string }).formatBinarySize() + "/s";
    };
    this._formatters["rate"] = (v) => {
      if (v === undefined || v === null) return "null/s";
      const numValue = typeof v === "number" ? v : Number(v);
      return isNaN(numValue)
        ? "null/s"
        : (numValue as number & { formatCompactNumber(): string }).formatCompactNumber() + "/s";
    };

    // Deprecated
    this._formatters["dateTime"] = (v) => DateTimeExtension.toYYYYMMddHHmmss(this.toDateValue(v));
    this._formatters["shortDateTime"] = (v) =>
      DateTimeExtension.formatDateTime(this.toDateValue(v), "MM-dd HH:mm:ss");

    this._formatters["yyyyMMddHHmmss"] = (v) =>
      DateTimeExtension.toYYYYMMddHHmmss(this.toDateValue(v));
    this._formatters["yyyyMMddHHmmssSSS"] = (v) =>
      DateTimeExtension.formatDateTime(this.toDateValue(v), "yyyy-MM-dd HH:mm:ss.SSS");
    this._formatters["MMddHHmmss"] = (v) =>
      DateTimeExtension.formatDateTime(this.toDateValue(v), "MM-dd HH:mm:ss");
    this._formatters["MMddHHmmssSSS"] = (v) =>
      DateTimeExtension.formatDateTime(this.toDateValue(v), "MM-dd HH:mm:ss.SSS");

    // For compatibility only, use DateTime formatter above instead
    this._formatters["time"] = (v) => {
      return DateTimeExtension.formatDateTime(
        this.toDateValue(v),
        "MM-dd hh:mm:ss.SSS" /*props.template*/
      );
    };

    this._formatters["timeDuration"] = (v) => {
      const numValue = typeof v === "number" ? v : Number(v);
      if (!Number.isFinite(numValue)) return "";
      return (numValue as number & { formatTimeDuration(): string }).formatTimeDuration();
    };
    this._formatters["timeDiff"] = (v) => this.timeDifference(v);
    this._formatters["relativeTime"] = (v) => {
      const numValue = typeof v === "number" ? v : Number(v);
      if (!Number.isFinite(numValue)) return "";
      return (numValue as number & { formatTimeDiff(): string }).formatTimeDiff();
    };
    this._formatters["days"] = (v) => {
      const numValue = typeof v === "number" ? v : Number(v);
      if (!Number.isFinite(numValue)) return "";
      return (numValue as number & { formatDays(): string }).formatDays();
    };
    this._formatters["template"] = (_v, params) => {
      // Template formatter - params[0] should be the template object
      const template = params?.[0];
      if (
        !template ||
        typeof (template as { replaceVariables?: (values: unknown[]) => string })
          .replaceVariables !== "function"
      ) {
        return "";
      }
      return (template as { replaceVariables: (values: unknown[]) => string }).replaceVariables(
        params?.slice(1) ?? []
      );
    };

    // Map formatter - for Map types, renders in table format with Key and Value columns
    this._formatters["map"] = (v) => {
      return this.formatMapValue(v);
    };

    // Complex type formatter - for Array, Tuple, JSON types (not Map)
    this._formatters["complexType"] = (v, params) => {
      if (v === null || v === undefined) {
        return <span className="text-muted-foreground">-</span>;
      }

      // Get truncation length from params (default: 30)
      const truncateLength = typeof params?.[0] === "number" ? params[0] : 30;

      // For complex types (Array, Tuple, JSON) - not Map
      const stringValue = typeof v === "object" ? JSON.stringify(v) : String(v);
      const truncated =
        stringValue.length > truncateLength
          ? stringValue.substring(0, truncateLength) + "..."
          : stringValue;
      const fullValue =
        typeof v === "object" && v !== null ? JSON.stringify(v, null, 2) : stringValue;

      return (
        <span
          className="cursor-pointer hover:text-primary underline decoration-dotted"
          onClick={(e) => {
            e.stopPropagation();
            Dialog.showDialog({
              title: "Complex Type Data",
              description: "Full content",
              mainContent: (
                <div className="overflow-auto">
                  <ThemedSyntaxHighlighter
                    language="json"
                    customStyle={{ fontSize: "14px", margin: 0 }}
                    showLineNumbers={true}
                  >
                    {fullValue}
                  </ThemedSyntaxHighlighter>
                </div>
              ),
              className: "max-w-4xl max-h-[80vh]",
            });
          }}
          title="Click to view full content"
        >
          {truncated}
        </span>
      );
    };

    // Truncated text formatter - for long text values
    this._formatters["truncatedText"] = (v, params) => {
      if (v === null || v === undefined) {
        return <span className="text-muted-foreground">-</span>;
      }

      // Get truncation length from params (default: 64)
      const truncateLength = typeof params?.[0] === "number" ? params[0] : 64;

      const stringValue = typeof v === "object" ? JSON.stringify(v) : String(v);

      if (stringValue.length <= truncateLength) {
        return <span>{stringValue}</span>;
      }

      const truncated = stringValue.substring(0, truncateLength) + "...";

      return (
        <span
          className="cursor-pointer hover:text-primary underline decoration-dotted"
          onClick={(e) => {
            let displayValue: string;
            let isJson = false;
            try {
              const jsonObj = JSON.parse(stringValue);
              displayValue = JSON.stringify(jsonObj, null, 2);
              isJson = true;
            } catch {
              displayValue = stringValue;
              isJson = false;
            }
            e.stopPropagation();
            Dialog.showDialog({
              title: "Full Text",
              description: "Complete text content",
              mainContent: (
                <div className="overflow-auto">
                  {isJson ? (
                    <ThemedSyntaxHighlighter
                      language="json"
                      customStyle={{ fontSize: "14px", margin: 0 }}
                    >
                      {displayValue}
                    </ThemedSyntaxHighlighter>
                  ) : (
                    <pre className="whitespace-pre-wrap break-all text-sm font-mono p-2 bg-muted rounded overflow-x-auto">
                      {displayValue}
                    </pre>
                  )}
                </div>
              ),
              className: "max-w-4xl max-h-[80vh]",
            });
          }}
          title="Click to view full text"
        >
          {truncated}
        </span>
      );
    };

    // SQL formatter - for SQL queries, shows truncated text with click-to-expand dialog
    this._formatters["sql"] = (v, params) => {
      if (v === null || v === undefined) {
        return <span className="text-muted-foreground">-</span>;
      }

      // Get truncation length from params (default: 50)
      const truncateLength = typeof params?.[0] === "number" ? params[0] : 50;

      const stringValue = String(v);
      const truncatedValue =
        stringValue.length > truncateLength
          ? stringValue.substring(0, truncateLength) + "..."
          : stringValue;

      return (
        <span
          className="cursor-pointer hover:text-primary underline decoration-dotted"
          onClick={(e) => {
            e.stopPropagation();
            showQueryDialog({ sql: SqlUtils.prettyFormatQuery(stringValue) });
          }}
          title="Click to view full SQL"
        >
          {truncatedValue}
        </span>
      );
    };

    this._formatters["shortHostName"] = (v) => {
      return hostNameManager.getShortHostname(String(v));
    };

    this._formatters["inline_sql"] = (v) => this.inlineSqlFormat(v);

    // deprecated
    this._formatters["nanoFormatter"] = (v) => this.nanoFormat(v, 2);
  }

  private toDateValue(value: unknown): Date {
    if (value instanceof Date) return value;
    const numValue = typeof value === "number" ? value : Number(value);
    return Number.isFinite(numValue) ? new Date(numValue) : new Date(String(value));
  }

  private formatMapValue = (v: unknown): React.ReactNode => {
    if (v === null || v === undefined) {
      return <span className="text-muted-foreground">-</span>;
    }

    // Parse map data from value (same logic as in constructor)
    let mapData: Array<{ key: unknown; value: unknown }> | null = null;
    if (typeof v === "object" && !Array.isArray(v) && v !== null) {
      try {
        mapData = Object.entries(v as Record<string, unknown>).map(([key, val]) => ({
          key,
          value: val,
        }));
      } catch {
        mapData = null;
      }
    }
    if (!mapData) {
      // Fallback if not a valid map
      return <span className="text-muted-foreground">-</span>;
    }

    const displayText = `Map(${mapData.length} entries)`;

    return (
      <span
        className="cursor-pointer hover:text-primary underline decoration-dotted"
        onClick={(e) => {
          e.stopPropagation();
          Dialog.showDialog({
            title: "Map Data",
            description: "Full map content",
            mainContent: <MapTableComponent mapData={mapData} />,
            className: "max-w-4xl max-h-[80vh]",
          });
        }}
        title="Click to view full content"
      >
        {displayText}
      </span>
    );
  };

  public static getInstance(): Formatter {
    if (!Formatter.instance) {
      Formatter.instance = new Formatter();
    }
    return Formatter.instance;
  }

  getFormatter(formatType: string): ObjectFormatter {
    return this._formatters[formatType];
  }

  timeDifference(time: unknown): string {
    const numValue = typeof time === "number" ? time : Number(time);
    if (!Number.isFinite(numValue) || numValue <= 0) {
      return "";
    }
    const now = new Date().getTime();
    return ((now - numValue) as number & { formatTimeDiff(): string }).formatTimeDiff();
  }

  nanoFormat(nanoTime: unknown, fractionDigits: number): string {
    const numValue = typeof nanoTime === "number" ? nanoTime : Number(nanoTime);
    if (!Number.isFinite(numValue) || numValue <= 0) return "0";
    return this.timeFormat(numValue, fractionDigits, ["ns", "μs", "ms", "s"]);
  }

  microFormat(milliTime: unknown, fractionDigits: number) {
    const numValue = typeof milliTime === "number" ? milliTime : Number(milliTime);
    if (!Number.isFinite(numValue) || numValue <= 0) return "0";
    return this.timeFormat(numValue, fractionDigits, ["μs", "ms", "s"]);
  }

  milliFormat(milliTime: unknown, fractionDigits: number) {
    const numValue = typeof milliTime === "number" ? milliTime : Number(milliTime);
    if (!Number.isFinite(numValue) || numValue <= 0) return "0";
    return this.timeFormat(numValue, fractionDigits, ["ms", "s"]);
  }

  timeFormat(time: number, fractionDigits: number, units: string[]) {
    let val = +time || 0;
    let index = 0;
    if (val <= 0) return "0";
    while (val >= 1000 && index < units.length - 1) {
      index += 1;
      val = time / 1000 ** index;
    }

    return (
      (
        val as number & { formatWithNoTrailingZeros(fraction: number): string }
      ).formatWithNoTrailingZeros(fractionDigits) + units[index]
    );
  }

  inlineSqlFormat(sql: unknown): React.ReactNode {
    if (sql === null || sql === undefined || (typeof sql === "string" && sql.trim() === "")) {
      return <span className="text-muted-foreground">-</span>;
    }

    const sqlString = String(sql);
    const formattedSql = SqlUtils.prettyFormatQuery(sqlString);

    return (
      <div className="overflow-auto">
        <ThemedSyntaxHighlighter
          language="sql"
          customStyle={{ fontSize: "12px", margin: 0, padding: 8 }}
        >
          {formattedSql}
        </ThemedSyntaxHighlighter>
      </div>
    );
  }
}
