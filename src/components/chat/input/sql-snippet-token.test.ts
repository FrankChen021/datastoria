import { describe, expect, it } from "vitest";
import { sqlSnippetTokenCodec } from "./sql-snippet-token";

describe("sql snippet token helpers", () => {
  it("creates parseable snippet tokens and expands them to fenced sql", () => {
    const token = sqlSnippetTokenCodec.createToken("SELECT *\nFROM system.query_log");

    expect(sqlSnippetTokenCodec.getMatches(`Explain ${token}`)).toEqual([
      expect.objectContaining({
        text: token,
        sql: "SELECT *\nFROM system.query_log",
        start: 8,
        end: 8 + token.length,
      }),
    ]);
    expect(sqlSnippetTokenCodec.expand(token)).toBe("```sql\nSELECT *\nFROM system.query_log\n```");
  });

  it("expands snippet tokens into fenced sql blocks separated from surrounding prose", () => {
    const token = sqlSnippetTokenCodec.createToken(
      "admin_de_presto_prod_.presto_alb_jdbc_access_log_view.big_data_account"
    );

    expect(sqlSnippetTokenCodec.expand(`what's the type of this column ${token}`)).toBe(
      "what's the type of this column\n\n```sql\nadmin_de_presto_prod_.presto_alb_jdbc_access_log_view.big_data_account\n```"
    );
  });

  it("removes snippet tokens without leaving double spaces behind", () => {
    const token = sqlSnippetTokenCodec.createToken("SELECT 1");
    expect(sqlSnippetTokenCodec.removeAt(`Explain ${token} now`, 8, 8 + token.length)).toBe(
      "Explain now"
    );
  });
});
