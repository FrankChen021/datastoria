import { describe, expect, it } from "vitest";
import { buildExplainErrorPrompt } from "./explain-error-prompt";

describe("buildExplainErrorPrompt", () => {
  it("includes error code, message, and sql when provided", () => {
    expect(
      buildExplainErrorPrompt({
        errorCode: "62",
        errorMessage: "Syntax error",
        sql: "SELECT 1",
      })
    ).toBe(
      "/diagnose-clickhouse-errors error code: 62\n\nerror message: Syntax error\n\nsql:\n```sql\nSELECT 1\n```"
    );
  });

  it("omits optional sections when absent", () => {
    expect(
      buildExplainErrorPrompt({
        errorMessage: "Network error",
      })
    ).toBe("/diagnose-clickhouse-errors error message: Network error");
  });
});
