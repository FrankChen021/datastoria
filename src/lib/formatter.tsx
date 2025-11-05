import React from "react";
import { DateTimeExtension } from "./datetime-utils";

export type FormatName =
  | "json_string"
  | "percentage"
  | "percentage_0_1" // for number in the range of [0,1]. input: 0.1, output: 10%
  | "percentage_bar" // Renders a rectangular bar showing the percentage value
  | "nanosecond"
  | "millisecond"
  | "microsecond"
  | "binary_size"
  | "short_number"
  | "comma_number" // input: 1234567, output: 1,234,567
  | "dateTime" // Deprecated
  | "shortDateTime" // Deprecated
  // DateTime Formatter
  | "yyyyMMddHHmmss"
  | "yyyyMMddHHmmssSSS"
  | "MMddHHmmss"
  | "MMddHHmmssSSS"
  | "timeDuration"
  | "timeDiff"
  | "index" // For compability, SHOULD not be used
  | "binary_byte" // For compatibility only, use binary_size instead
  | "time" // For compatibility only, use DateTime formatter above instead
  | "template"
  | "detail" // For table only
  | "sql"; // For SQL queries - shows truncated text with click-to-expand dialog

export class Formatter {
  private static instance: Formatter;

  _formatters: { [key: string]: (v: any, props?: any, params?: any) => string | React.ReactNode };

  private constructor() {
    this._formatters = {};

    // For compatibility only, use binary_size instead
    this._formatters["binary_byte"] = (v) => v.formatBinarySize();
    this._formatters["binary_size"] = (v) => v.formatBinarySize();

    // For compatiblity only, use short_number instead
    this._formatters["compact_number"] = (v) => {
      return v === undefined || v === null ? "null" : v.formatCompactNumber();
    };
    this._formatters["short_number"] = (v) => {
      return v === undefined || v === null ? "null" : v.formatCompactNumber();
    };

    this._formatters["comma_number"] = (v) => {
      return v === undefined || v === null ? "null" : v.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",");
    };

    this._formatters["percentage"] = (v) => (v === "NaN" ? "0%" : v.formatWithNoTrailingZeros(2) + "%");
    this._formatters["percentage_0_1"] = (v) => (v === "NaN" ? "0%" : (v * 100).formatWithNoTrailingZeros(2) + "%");
    this._formatters["percentage_bar"] = (v, props, params) => {
      // Ensure value is a number
      const numValue = typeof v === "number" ? v : parseFloat(String(v)) || 0;

      // Clamp value between 0 and 100
      const percentage = Math.max(0, Math.min(100, numValue));

      // Get width from args (first element in params array, or props.formatArgs, or default to 100)
      const width = (params && params[0]) || (props && props.formatArgs && props.formatArgs[0]) || 100;

      // Get height from args (second element in params array, or props.formatArgs, or default to 20)
      const height = (params && params[1]) || (props && props.formatArgs && props.formatArgs[1]) || 20;

      return (
        <div className="flex items-center gap-2">
          <div
            className="relative bg-muted rounded-sm overflow-hidden"
            style={{ width: `${width}px`, height: `${height}px` }}
          >
            <div className="h-full bg-primary transition-all" style={{ width: `${percentage}%` }} />
          </div>
          <span className="text-sm tabular-nums">{percentage.toFixed(1)}%</span>
        </div>
      );
    };
    this._formatters["nanosecond"] = (v) => this.nanoFormat(v, 2);
    this._formatters["millisecond"] = (v) => this.milliFormat(v, 2);
    this._formatters["microsecond"] = (v) => this.microFormat(v, 2);
    this._formatters["byte_rate"] = (v) => v.formatBinarySize() + "/s";
    this._formatters["rate"] = (v) => v.formatCompactNumber() + "/s";

    // Deprecated
    this._formatters["dateTime"] = (v) => DateTimeExtension.toYYYYMMddHHmmss(new Date(v));
    this._formatters["shortDateTime"] = (v) => DateTimeExtension.formatDateTime(new Date(v), "MM-dd HH:mm:ss");

    this._formatters["yyyyMMddHHmmss"] = (v) => DateTimeExtension.toYYYYMMddHHmmss(new Date(v));
    this._formatters["yyyyMMddHHmmssSSS"] = (v) =>
      DateTimeExtension.formatDateTime(new Date(v), "yyyy-MM-dd HH:mm:ss.SSS");
    this._formatters["MMddHHmmss"] = (v) => DateTimeExtension.formatDateTime(new Date(v), "MM-dd HH:mm:ss");
    this._formatters["MMddHHmmssSSS"] = (v) => DateTimeExtension.formatDateTime(new Date(v), "MM-dd HH:mm:ss.SSS");

    // For compatibility only, use DateTime formatter above instead
    this._formatters["time"] = (v) => {
      return DateTimeExtension.formatDateTime(new Date(v), "MM-dd hh:mm:ss.SSS" /*props.template*/);
    };

    this._formatters["timeDuration"] = (v) => v.formatTimeDuration();
    this._formatters["timeDiff"] = (v) => this.timeDifference(v);
    this._formatters["template"] = (_v, props, params) => {
      const template = props.template;

      return template.replaceVariables(params);
    };

    // deprecated
    this._formatters["nanoFormatter"] = (v) => this.nanoFormat(v, 2);
  }

  public static getInstance(): Formatter {
    if (!Formatter.instance) {
      Formatter.instance = new Formatter();
    }
    return Formatter.instance;
  }

  getFormatter(formatType: string): (v: any, props?: any, params?: any) => string | React.ReactNode {
    return this._formatters[formatType];
  }

  timeDifference(time: number): string {
    if (time <= 0) {
      return "";
    }
    const now = new Date().getTime();
    return (now - time).formatTimeDiff();
  }

  nanoFormat(nanoTime: number, fractionDigits: number): string {
    return this.timeFormat(nanoTime, fractionDigits, ["ns", "μs", "ms", "s"]);
  }

  microFormat(milliTime: number, fractionDigits: number) {
    return this.timeFormat(milliTime, fractionDigits, ["μs", "ms", "s"]);
  }

  milliFormat(milliTime: number, fractionDigits: number) {
    return this.timeFormat(milliTime, fractionDigits, ["ms", "s"]);
  }

  timeFormat(time: number, fractionDigits: number, units: string[]) {
    let val = +time || 0;
    let index = 0;
    if (val <= 0) return "0";
    while (val >= 1000 && index < units.length - 1) {
      index += 1;
      val = time / 1000 ** index;
    }

    return val.formatWithNoTrailingZeros(fractionDigits) + units[index];
  }
}
