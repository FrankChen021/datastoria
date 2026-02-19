import { describe, expect, it } from "vitest";
import { SqlUtils } from "./sql-utils";

describe("SqlUtils.commentOutFormatClause", () => {
  it("wraps trailing FORMAT clause in block comment", () => {
    expect(SqlUtils.commentOutFormatClause("SELECT 1 FROM t FORMAT TabSeparated")).toBe(
      "SELECT 1 FROM t /* FORMAT TabSeparated */"
    );
  });

  it("is case-insensitive for FORMAT keyword", () => {
    expect(SqlUtils.commentOutFormatClause("SELECT 1 format Pretty")).toBe(
      "SELECT 1 /* format Pretty */"
    );
    expect(SqlUtils.commentOutFormatClause("SELECT 1 FORMAT JSON")).toBe(
      "SELECT 1 /* FORMAT JSON */"
    );
  });

  it("leaves SQL unchanged when no trailing FORMAT clause", () => {
    const sql = "SELECT 1 FROM system.tables";
    expect(SqlUtils.commentOutFormatClause(sql)).toBe(sql);
  });

  it("FORMAT clause has other words after it", () => {
    const sql = "SELECT 1 FROM system.tables FORMAT JSON SETTINGS max_threads = 1";
    expect(SqlUtils.commentOutFormatClause(sql)).toBe(
      "SELECT 1 FROM system.tables /* FORMAT JSON */ SETTINGS max_threads = 1"
    );
  });
});

describe("SqlUtils.toExplainSQL", () => {
  it("returns empty when input is empty or only whitespace", () => {
    expect(SqlUtils.toExplainSQL("ast", "")).toEqual({ explainSQL: "", rawSQL: "" });
    expect(SqlUtils.toExplainSQL("ast", "   \n  ")).toEqual({ explainSQL: "", rawSQL: "" });
  });

  it("returns empty when SQL is only comments", () => {
    expect(SqlUtils.toExplainSQL("ast", "-- comment only")).toEqual({
      explainSQL: "",
      rawSQL: "",
    });
    expect(SqlUtils.toExplainSQL("ast", "/* block */")).toEqual({ explainSQL: "", rawSQL: "" });
  });

  it("strips single-line (lines starting with --) and multiline comments from SQL", () => {
    const sql = "SELECT 1\n-- comment line\nFROM system.one /* inline */";
    const { explainSQL, rawSQL } = SqlUtils.toExplainSQL("ast", sql);
    // Multiple newlines are collapsed to a single newline
    expect(rawSQL).toBe("SELECT 1\nFROM system.one");
    expect(explainSQL).toBe("EXPLAIN ast\nSELECT 1\nFROM system.one");
  });

  it("strips trailing \\G", () => {
    const sql = "SELECT 1\\G";
    const { explainSQL, rawSQL } = SqlUtils.toExplainSQL("syntax", sql);
    expect(rawSQL).toBe("SELECT 1");
    expect(explainSQL).toBe("EXPLAIN syntax\nSELECT 1");
  });

  it("comments out trailing FORMAT clause for debugging", () => {
    const sql = "SELECT 1 FROM system.tables FORMAT TabSeparated";
    const { explainSQL, rawSQL } = SqlUtils.toExplainSQL("ast", sql);
    expect(rawSQL).toBe("SELECT 1 FROM system.tables /* FORMAT TabSeparated */");
    expect(explainSQL).toContain("/* FORMAT TabSeparated */");
  });

  it("comments out FORMAT clause case-insensitively", () => {
    const sql = "SELECT 1 format Pretty";
    const { rawSQL } = SqlUtils.toExplainSQL("pipeline", sql);
    expect(rawSQL).toBe("SELECT 1 /* format Pretty */");
  });

  it("builds EXPLAIN pipeline with graph = 1", () => {
    const sql = "SELECT 1";
    const { explainSQL, rawSQL } = SqlUtils.toExplainSQL("pipeline", sql);
    expect(rawSQL).toBe("SELECT 1");
    expect(explainSQL).toBe("EXPLAIN pipeline graph = 1\nSELECT 1");
  });

  it("builds EXPLAIN plan indexes = 1", () => {
    const sql = "SELECT * FROM system.tables";
    const { explainSQL, rawSQL } = SqlUtils.toExplainSQL("plan-indexes", sql);
    expect(rawSQL).toBe("SELECT * FROM system.tables");
    expect(explainSQL).toBe("EXPLAIN plan indexes = 1\nSELECT * FROM system.tables");
  });

  it("builds EXPLAIN plan actions = 1", () => {
    const sql = "SELECT 1";
    const { explainSQL } = SqlUtils.toExplainSQL("plan-actions", sql);
    expect(explainSQL).toBe("EXPLAIN plan actions = 1\nSELECT 1");
  });

  it("builds generic EXPLAIN <type> for ast, syntax, estimate", () => {
    const sql = "SELECT 1";
    expect(SqlUtils.toExplainSQL("ast", sql).explainSQL).toBe("EXPLAIN ast\nSELECT 1");
    expect(SqlUtils.toExplainSQL("syntax", sql).explainSQL).toBe("EXPLAIN syntax\nSELECT 1");
    expect(SqlUtils.toExplainSQL("estimate", sql).explainSQL).toBe("EXPLAIN estimate\nSELECT 1");
  });

  it("applies comment-out FORMAT after stripping \\G", () => {
    const sql = "SELECT 1 FORMAT JSON\\G";
    const { rawSQL } = SqlUtils.toExplainSQL("ast", sql);
    expect(rawSQL).toBe("SELECT 1 /* FORMAT JSON */");
  });
});

describe("SqlUtils.resolveRunSql", () => {
  it("returns selected text when selection exists", () => {
    const sql = SqlUtils.resolveExecutionSql({
      selectedText: " SELECT 42 ",
      text: "SELECT 1; SELECT 2;",
      cursorRow: 0,
      cursorColumn: 0,
    });

    expect(sql).toBe("SELECT 42");
  });

  it("returns statement at cursor when no selection", () => {
    const sql = SqlUtils.resolveExecutionSql({
      selectedText: "",
      text: "SELECT 1;\nSELECT 2;\nSELECT 3;",
      cursorRow: 1,
      cursorColumn: 3,
    });

    expect(sql).toBe("SELECT 2;");
  });

  it("returns empty when editor text is empty", () => {
    const sql = SqlUtils.resolveExecutionSql({
      selectedText: "",
      text: "   ",
      cursorRow: 0,
      cursorColumn: 0,
    });

    expect(sql).toBe("");
  });

  it("returns only the current line when semicolons are absent", () => {
    const sql = SqlUtils.resolveExecutionSql({
      selectedText: "",
      text: "SELECT version()\nselect version()",
      cursorRow: 1,
      cursorColumn: 8,
    });

    expect(sql).toBe("select version()");
  });
});

describe("SqlUtils.splitSqlScript", () => {
  it("splits by semicolon when present", () => {
    expect(SqlUtils.splitSqlStatements("SELECT 1; SELECT 2;")).toEqual(["SELECT 1", "SELECT 2"]);
  });

  it("does not split semicolons in strings", () => {
    expect(SqlUtils.splitSqlStatements("SELECT 'a;b'; SELECT 2;")).toEqual([
      "SELECT 'a;b'",
      "SELECT 2",
    ]);
  });

  it("keeps SQL as one statement when semicolon is absent", () => {
    expect(SqlUtils.splitSqlStatements("SELECT 1\n\nSELECT 2\nFROM t")).toEqual([
      "SELECT 1\n\nSELECT 2\nFROM t",
    ]);
    expect(SqlUtils.splitSqlStatements("SELECT 1\nSELECT 2")).toEqual(["SELECT 1\nSELECT 2"]);
  });

  it("splits by non-empty line when splitter is newline", () => {
    expect(SqlUtils.splitSqlStatements("SELECT 1\n\nSELECT 2\nFROM t", "newline")).toEqual([
      "SELECT 1",
      "SELECT 2",
      "FROM t",
    ]);
  });

  it("splits by custom literal separator", () => {
    expect(
      SqlUtils.splitSqlStatements("SELECT 1@@SELECT 2@@SELECT 3", "custom", {
        value: "@@",
        isRegex: false,
      })
    ).toEqual(["SELECT 1", "SELECT 2", "SELECT 3"]);
  });

  it("keeps semicolon behavior when custom splitter is semicolon", () => {
    expect(
      SqlUtils.splitSqlStatements("SELECT 'a;b'; SELECT 2;", "custom", {
        value: ";",
        isRegex: false,
      })
    ).toEqual(["SELECT 'a;b'", "SELECT 2"]);
  });

  it("splits by custom regex separator", () => {
    expect(
      SqlUtils.splitSqlStatements("SELECT 1--split--SELECT 2", "custom", {
        value: "--split--",
        isRegex: true,
      })
    ).toEqual(["SELECT 1", "SELECT 2"]);
  });

  it("falls back to single statement when custom regex is invalid", () => {
    expect(
      SqlUtils.splitSqlStatements("SELECT 1;SELECT 2", "custom", {
        value: "(",
        isRegex: true,
      })
    ).toEqual(["SELECT 1;SELECT 2"]);
  });
});
