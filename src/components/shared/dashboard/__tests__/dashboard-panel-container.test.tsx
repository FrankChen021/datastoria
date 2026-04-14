/**
 * @vitest-environment jsdom
 */

import React from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Dashboard } from "../dashboard-model";
import DashboardPanelContainer from "../dashboard-panel-container";

const testGlobal = globalThis as typeof globalThis & {
  IS_REACT_ACT_ENVIRONMENT?: boolean;
};

const renderedSections: Array<{ isCollapsed: boolean; title: string | null }> = [];

vi.mock("echarts", () => ({
  connect: vi.fn(),
}));

vi.mock("../dashboard-layout-storage", () => ({
  invalidateLegacySectionLayoutKeys: vi.fn(),
}));

vi.mock("../dashboard-section", () => ({
  DashboardSection: ({
    isCollapsed,
    group,
  }: {
    isCollapsed: boolean;
    group: { title?: string } | null;
  }) => {
    renderedSections.push({
      isCollapsed,
      title: group?.title ?? null,
    });
    return <div>{group?.title ?? "Ungrouped"}</div>;
  },
}));

describe("DashboardPanelContainer", () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    testGlobal.IS_REACT_ACT_ENVIRONMENT = true;
    renderedSections.length = 0;
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(async () => {
    await import("react").then(({ act }) =>
      act(() => {
        root.unmount();
      })
    );
    container.remove();
  });

  it("uses the group's configured collapsed state on initial render", async () => {
    const dashboard: Dashboard = {
      version: 3,
      filter: {},
      charts: [
        {
          title: "Overall Size",
          collapsed: true,
          charts: [
            {
              type: "table",
              titleOption: { title: "Table Size" },
              datasource: { sql: "select 1" },
              gridPos: { w: 24, h: 6 },
            },
          ],
        },
      ],
    };

    const { act } = await import("react");

    act(() => {
      root.render(<DashboardPanelContainer dashboard={dashboard} />);
    });

    expect(renderedSections).toEqual([
      {
        isCollapsed: true,
        title: "Overall Size",
      },
    ]);
  });
});
