import { describe, expect, it } from "vitest";
import { areRefreshOptionsEqual, normalizeRefreshOptions } from "../dashboard-visualization-panel";

describe("dashboard-visualization-panel refresh option helpers", () => {
  it("normalizes an empty filter expression to the default true predicate", () => {
    expect(normalizeRefreshOptions({})).toEqual({ filterExpression: "1=1" });
    expect(normalizeRefreshOptions({ timeSpan: undefined })).toEqual({ filterExpression: "1=1" });
  });

  it("treats undefined and default filter expressions as the same refresh state", () => {
    expect(areRefreshOptionsEqual({}, { filterExpression: "1=1" })).toBe(true);
    expect(areRefreshOptionsEqual({ timeSpan: undefined }, { filterExpression: "1=1" })).toBe(true);
  });
});
