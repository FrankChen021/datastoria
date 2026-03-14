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
      "/explain_error_code error code: 62\n\nerror message: Syntax error\n\nsql:\n```sql\nSELECT 1\n```"
    );
  });

  it("omits optional sections when absent", () => {
    expect(
      buildExplainErrorPrompt({
        errorMessage: "Network error",
      })
    ).toBe("/explain_error_code error message: Network error");
  });

  it("adds compact inline instructions for auto explain mode", () => {
    const prompt = buildExplainErrorPrompt({
      errorCode: "47",
      errorMessage: "Unknown identifier",
      sql: "select ve",
      mode: "inline-auto",
    });

    expect(prompt).toContain("Respond for inline query error help in a compact, action-first format.");
    expect(prompt).toContain("## Cause");
    expect(prompt).toContain("## Fix");
    expect(prompt).toContain("## Example");
  });
});
