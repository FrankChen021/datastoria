import { describe, expect, it } from "vitest";
import { getPanelConstraints } from "../dashboard-layout-constraints";

describe("dashboard-layout-constraints", () => {
  it("returns constraints for stat panel", () => {
    const constraints = getPanelConstraints("stat");
    expect(constraints).toEqual({
      minW: 3,
      minH: 2,
      maxW: 12,
      maxH: 4,
    });
  });

  it("returns constraints for table panel", () => {
    const constraints = getPanelConstraints("table");
    expect(constraints).toEqual({
      minW: 6,
      minH: 3,
      maxW: 24,
      maxH: 16,
    });
  });

  it("returns constraints for timeseries panel types", () => {
    for (const type of ["line", "bar", "area"]) {
      const constraints = getPanelConstraints(type);
      expect(constraints).toEqual({
        minW: 6,
        minH: 3,
        maxW: 24,
        maxH: 12,
      });
    }
  });

  it("returns default constraints for unknown type", () => {
    const constraints = getPanelConstraints("unknown");
    expect(constraints.minW).toBeGreaterThan(0);
    expect(constraints.minH).toBeGreaterThan(0);
  });
});
