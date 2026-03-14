import { describe, expect, it } from "vitest";
import { isAutoExplainClickHouseErrorBlacklisted } from "./query-error-auto-explain-config";

describe("isAutoExplainClickHouseErrorBlacklisted", () => {
  it("matches blacklisted error codes after trimming", () => {
    expect(isAutoExplainClickHouseErrorBlacklisted(" 194 ")).toBe(true);
    expect(isAutoExplainClickHouseErrorBlacklisted(241)).toBe(true);
  });

  it("returns false for non-blacklisted or missing codes", () => {
    expect(isAutoExplainClickHouseErrorBlacklisted("62")).toBe(false);
    expect(isAutoExplainClickHouseErrorBlacklisted(undefined)).toBe(false);
  });
});
