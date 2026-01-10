declare global {
  interface Number {
    formatTimeDuration(): string;
    formatTimeDiff(): string;
    formatBinarySize(): string;
    formatCompactNumber(): string;
    formatWithNoTrailingZeros(fraction: number): string;
    formatDays(): string;
  }
}

// Export empty object to make this a module
export {};

function isNumeric(n: number): boolean {
  return !Number.isNaN(n) && Number.isFinite(n);
}

Number.prototype.formatBinarySize = function () {
  const byteVal = this.valueOf();
  const isNegative = byteVal < 0;
  const bytes = Math.abs(byteVal);
  if (!isNumeric(bytes)) {
    return "--";
  }
  const units = ["B", "KiB", "MiB", "GiB", "TiB", "PiB"];
  if (bytes === 0) {
    return "0 B";
  }
  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  let s;
  if (i <= 0) {
    s = `${Math.round(bytes * 100) / 100} ${units[0]}`;
  } else {
    s = `${(bytes / 1024 ** i).formatWithNoTrailingZeros(2)} ${units[i]}`;
  }
  return isNegative ? "-" + s : s;
};

Number.prototype.formatCompactNumber = function () {
  const n = +this.valueOf();
  if (!isNumeric(n)) {
    return "--";
  }

  const sizes = ["", "K", "M", "G", "T", "P"];
  if (n === 0) {
    return "0";
  }
  const i = Math.floor(Math.log(n) / Math.log(1000));
  if (i <= 0) {
    return `${Math.round(n * 100) / 100}`;
  }
  return `${Math.round((n / 1000 ** i) * 100) / 100} ${sizes[i]}`;
};

Number.prototype.formatWithNoTrailingZeros = function (fraction: number = 2) {
  const value = this.valueOf();
  // Round to the specified fraction, then convert back
  // This avoids floating point precision issues while removing trailing zeros
  const multiplier = 10 ** fraction;
  const rounded = Math.round(value * multiplier) / multiplier;
  // Use toString() which automatically removes trailing zeros
  return rounded.toString();
};

/**
 * value in milli-second
 * @returns {string}
 */
Number.prototype.formatTimeDuration = function () {
  const duration = +this.valueOf();

  let seconds = Math.floor(duration / 1000);

  const days = Math.floor(seconds / (24 * 3600));
  seconds = seconds % (24 * 3600); // get the left seconds for hours

  const hours = Math.floor(seconds / 3600);
  seconds = seconds % 3600; // get the left seconds for minutes

  const minutes = Math.floor(seconds / 60);
  seconds = seconds % 60; // left seconds

  let text = "";
  if (days > 0) text += days + " days ";
  if (hours > 0) text += hours + " hours ";
  if (minutes > 0) text += minutes + " mins";

  // no need to show seconds to make the text short
  if (text.length === 0 && seconds > 0) text += seconds + " sec";

  return text;
};

Number.prototype.formatTimeDiff = function () {
  const diff = this.valueOf();

  const seconds = Math.floor(diff / 1000);
  if (seconds < 60) {
    return seconds + "s ago";
  }
  const minute = Math.floor(seconds / 60);
  if (minute < 60) {
    return minute + "m ago";
  }
  const hours = Math.floor(minute / 60);
  if (hours < 24) {
    return hours + "h ago";
  }
  const day = Math.floor(hours / 24);
  if (day < 7) {
    return day + "d ago";
  }
  const week = Math.floor(day / 7);
  if (week < 5) {
    return week + " wk ago";
  }
  if (day < 365) {
    return day + "d ago";
  }
  const year = Math.floor(day / 365);
  return year + "y ago";
};

/**
 * value in milli-second
 * Shows only the largest non-zero unit (days, hours, minutes, or seconds)
 * @returns {string}
 */
Number.prototype.formatDays = function () {
  const duration = +this.valueOf();

  let seconds = Math.floor(duration / 1000);

  const days = Math.floor(seconds / (24 * 3600));
  seconds = seconds % (24 * 3600); // get the left seconds for hours

  const hours = Math.floor(seconds / 3600);
  seconds = seconds % 3600; // get the left seconds for minutes

  const minutes = Math.floor(seconds / 60);
  seconds = seconds % 60; // left seconds

  if (days > 0) {
    return days + " days";
  }
  if (hours > 0) {
    return hours + " hours";
  }
  if (minutes > 0) {
    return minutes + " mins";
  }
  return seconds + " sec";
};
