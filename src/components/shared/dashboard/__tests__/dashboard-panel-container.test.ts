import { describe, expect, it } from "vitest";
import type { DashboardGroup, PanelDescriptor } from "../dashboard-model";
import { requiresLegacySectionLayoutInvalidation } from "../dashboard-panel-container";

function panel(title: string): PanelDescriptor {
  return {
    type: "table",
    titleOption: { title },
    datasource: { sql: "select 1" },
    gridPos: { w: 12, h: 6 },
  };
}

function group(title: string, count = 1): DashboardGroup {
  return {
    title,
    charts: Array.from({ length: count }, (_, i) => panel(`${title}-${i}`)),
  };
}

describe("requiresLegacySectionLayoutInvalidation", () => {
  it("returns false for grouped-only dashboards", () => {
    expect(requiresLegacySectionLayoutInvalidation([group("g1"), group("g2")])).toBe(false);
  });

  it("returns false when ungrouped panels are only trailing", () => {
    expect(requiresLegacySectionLayoutInvalidation([group("g1"), panel("p1"), panel("p2")])).toBe(
      false
    );
  });

  it("returns true when ungrouped panels appear before a group", () => {
    expect(requiresLegacySectionLayoutInvalidation([panel("p1"), group("g1")])).toBe(true);
    expect(requiresLegacySectionLayoutInvalidation([group("g1"), panel("p1"), group("g2")])).toBe(
      true
    );
  });
});
