import type { FormatName } from "@/lib/formatter";

// Global set of numeric type prefixes for efficient lookup
const NUMERIC_TYPES = new Set([
  "UInt8",
  "UInt16",
  "UInt32",
  "UInt64",
  "Int8",
  "Int16",
  "Int32",
  "Int64",
  "Float32",
  "Float64",
  "Decimal",
  "Decimal32",
  "Decimal64",
  "Decimal128",
  "Decimal256",
]);

/**
 * Infers the appropriate format for a field based on ClickHouse type metadata.
 *
 * @param typeString - The ClickHouse type string (e.g., "DateTime", "UInt64", "Array(String)")
 * @param fieldName - The name of the field (e.g., "read_bytes", "memory_usage")
 * @returns The inferred format name, or undefined if no format can be inferred
 */
export function inferFormatFromMetaType(
  typeString: string | undefined,
  fieldName: string
): FormatName | undefined {
  if (!typeString) return undefined;

  const normalizedType = typeString.trim();

  // Date and DateTime types
  if (normalizedType.startsWith("DateTime")) {
    return undefined;
  }

  // Map types
  if (normalizedType.startsWith("Map(")) {
    return "map";
  }

  // Array types
  if (normalizedType.startsWith("Array(")) {
    return "complexType";
  }

  // Tuple types
  if (normalizedType.startsWith("Tuple(")) {
    return "complexType";
  }

  // Check if type starts with any numeric type using the hash set
  let isNumeric = false;
  for (const numericType of NUMERIC_TYPES) {
    if (normalizedType.startsWith(numericType)) {
      isNumeric = true;
      break;
    }
  }

  // If numeric, check field name for special formats, otherwise use comma_number
  if (isNumeric) {
    const lowerFieldName = fieldName.toLowerCase();
    if (lowerFieldName.endsWith("bytes")) {
      return "binary_size";
    }
    if (lowerFieldName.endsWith("microseconds")) {
      return "microsecond";
    }
    if (lowerFieldName.endsWith("milliseconds")) {
      return "millisecond";
    }
    if (lowerFieldName.endsWith("nanoseconds")) {
      return "nanosecond";
    }
    if (lowerFieldName.endsWith("seconds")) {
      return "seconds";
    }

    // Default for numeric types when field name doesn't match special cases
    return "comma_number";
  }

  // String types - no special format (or could use truncatedText for long strings)
  // LowCardinality(String) is still a string
  if (normalizedType.includes("String") || normalizedType === "FixedString") {
    return "truncatedText"; // No format needed for strings by default
  }

  // For other types, return undefined (no format inference)
  return undefined;
}

/**
 * Infers the appropriate format for a field based on sample data.
 *
 * @param fieldName - The name of the field to infer format for
 * @param sampleRows - Array of sample data rows to analyze
 * @returns The inferred format name, or undefined if no format can be inferred
 */
export function inferFieldFormat(
  fieldName: string,
  sampleRows: Record<string, unknown>[]
): FormatName | undefined {
  if (sampleRows.length === 0) return undefined;

  // Sample up to 10 rows to infer type
  const sampleSize = Math.min(10, sampleRows.length);
  const samples = sampleRows.slice(0, sampleSize).map((row) => row[fieldName]);

  // Check if all samples are null/undefined
  const allNull = samples.every((val) => val === null || val === undefined);
  if (allNull) return undefined;

  // Find first non-null sample
  const firstNonNull = samples.find((val) => val !== null && val !== undefined);
  if (firstNonNull === undefined) return undefined;

  // Check for complex types
  const isArray = Array.isArray(firstNonNull);
  const isObject = typeof firstNonNull === "object" && firstNonNull !== null && !isArray;
  const isMap = isObject && Object.keys(firstNonNull as Record<string, unknown>).length > 0;

  // Check for Map type first (separate from other complex types)
  if (isMap) {
    const allMaps = samples
      .filter((val) => val !== null && val !== undefined)
      .every((val) => typeof val === "object" && !Array.isArray(val) && val !== null);

    if (allMaps) {
      return "map";
    }
  }

  // Check for Array or other complex types
  if (isArray) {
    const allArrays = samples
      .filter((val) => val !== null && val !== undefined)
      .every((val) => Array.isArray(val));

    if (allArrays) {
      return "complexType";
    }
  }

  // Check for other objects (non-map, non-array)
  if (isObject && !isMap) {
    const allObjects = samples
      .filter((val) => val !== null && val !== undefined)
      .every((val) => typeof val === "object" && !Array.isArray(val) && val !== null);

    if (allObjects) {
      return "complexType";
    }
  }

  // Check for numbers - default to comma_number format
  const allNumbers = samples
    .filter((val) => val !== null && val !== undefined)
    .every((val) => {
      if (typeof val === "number") return true;
      // Also check if string can be parsed as number
      if (typeof val === "string") {
        const num = Number(val);
        return !isNaN(num) && isFinite(num) && val.trim() !== "";
      }
      return false;
    });

  if (allNumbers) {
    return "comma_number";
  }

  // Check for long strings
  const stringValues = samples
    .filter((val) => val !== null && val !== undefined)
    .map((val) => (typeof val === "object" ? JSON.stringify(val) : String(val)));

  const maxLength = Math.max(...stringValues.map((s) => s.length));
  if (maxLength > 200) {
    return "truncatedText";
  }

  return undefined;
}
