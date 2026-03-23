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
    ).toBe(
      "Help me diagnose this ClickHouse error and suggest a fix.\n\nerror message: Network error"
    );
  });

  it("appends response language when not English", () => {
    expect(
      buildExplainErrorPrompt({
        errorMessage: "Syntax error",
        language: "zh-CN",
      })
    ).toBe(
      `Help me diagnose this ClickHouse error and suggest a fix.\n\nerror message: Syntax error\n\nResponse language (BCP-47): zh-CN\nWrite the ## Cause, ## Fix, and optional ## Example sections in this language (localize the headings to match). Keep SQL, error codes, ClickHouse setting names, and identifiers unchanged.`
    );
  });

  it("does not append language instructions for default English", () => {
    expect(
      buildExplainErrorPrompt({
        errorMessage: "Syntax error",
        language: "en",
      })
    ).toBe(
      "Help me diagnose this ClickHouse error and suggest a fix.\n\nerror message: Syntax error"
    );
  });
});
