import { describe, expect, it } from "vitest";
import { parseErrorLocation } from "./clickhouse-error-parser";

describe("clickhouse-error-parser", () => {
  it("should parse error code 47 correctly when identifier is a substring of another identifier", () => {
    const sql = `SELECT 

    count(1) as part_count,

    sum(rows) as rows,

    sum(bytes_on_disk) AS disk_size,

    sum(data_uncompressed_bytes) AS uncompressed_size,

    round(sum(data_uncompressed_bytes) / sum(data_compressed_bytes), 2) AS compress_ratio,

    round(disk_size / rows, 2) AS avg_row_size

FROM

    system.parts

WHERE 

    database = 'bithon' 

    AND table = 'bithon_trace_span_summary_local_v4'

    AND active = 1 ORDER BY compressed_size DESC`;

    const detailMessage =
      "Code: 47. DB::Exception: Unknown expression identifier `compressed_size` in scope SELECT count(1) AS part_count, sum(rows) AS rows, sum(bytes_on_disk) AS disk_size, sum(data_uncompressed_bytes) AS uncompressed_size, round(sum(data_uncompressed_bytes) / sum(data_compressed_bytes), 2) AS compress_ratio, round(disk_size / rows, 2) AS avg_row_size FROM system.parts WHERE (database = 'bithon') AND (`table` = 'bithon_trace_span_summary_local_v4') AND (active = 1) ORDER BY compressed_size DESC";
    const errorCode = "47";

    const location = parseErrorLocation(errorCode, detailMessage, sql);

    expect(location).not.toBeNull();
    expect(location?.lineNumber).toBeGreaterThan(10);
    expect(
      location?.contextLines.some(
        (l) => l.isErrorLine && l.content.includes("ORDER BY compressed_size")
      )
    ).toBe(true);
    expect(location?.message).toBe("Unknown expression identifier");
  });

  it("should parse error code 47 with 'Missing columns' pattern", () => {
    const sql = "SELECT * FROM system.parts WHERE col_not_exist = 1";
    const detailMessage =
      "Code: 47. DB::Exception: Missing columns: 'col_not_exist' while processing query";
    const errorCode = "47";

    const location = parseErrorLocation(errorCode, detailMessage, sql);
    expect(location).not.toBeNull();
    expect(location?.message).toBe("Missing columns");
    expect(location?.lineNumber).toBe(1);
    // "SELECT * FROM system.parts WHERE " is 33 chars long. 34th char is 'c'.
    // col = 33 - (-1) = 34.
    expect(location?.columnNumber).toBe(34);
  });

  it("should parse error code 62 correctly", () => {
    const sql = "SELECT * FROM system.tables AS B";
    const detailMessage = "Code: 206. DB::Exception: No alias for subquery ... (line 1, col 15)";
    const errorCode = "62";

    const location = parseErrorLocation(errorCode, detailMessage, sql);

    expect(location).not.toBeNull();
    expect(location?.lineNumber).toBe(1);
    expect(location?.columnNumber).toBe(15);
  });
});
