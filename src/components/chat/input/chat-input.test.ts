import { describe, expect, it } from "vitest";
import { replaceLeadingCommand } from "./chat-input";

describe("replaceLeadingCommand", () => {
  it("replaces a partially typed hyphenated command without duplicating the suffix", () => {
    expect(replaceLeadingCommand("/diagnose-c", "diagnose-clickhouse-errors")).toBe(
      "/diagnose-clickhouse-errors "
    );
  });

  it("preserves any already typed arguments after the command name", () => {
    expect(replaceLeadingCommand("/diagnose-c error code: 115", "diagnose-clickhouse-errors")).toBe(
      "/diagnose-clickhouse-errors error code: 115"
    );
  });
});
