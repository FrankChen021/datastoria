import { describe, expect, it } from "vitest";
import { getLeadingCommand, replaceLeadingCommand } from "./command-utils";

describe("command-utils", () => {
  it("extracts a leading command and preserves the remainder", () => {
    expect(getLeadingCommand("/review check this query")).toEqual({
      commandName: "review",
      commandText: "/review",
      remainder: " check this query",
    });
  });

  it("does not treat slash-like punctuation as a command", () => {
    expect(getLeadingCommand("/review: check this query")).toBeNull();
  });

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
