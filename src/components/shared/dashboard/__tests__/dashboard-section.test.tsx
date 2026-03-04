/**
 * @vitest-environment jsdom
 */

import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DashboardSection } from "../dashboard-section";

let containerWidth = 320;
let panelMounts = 0;
let panelUnmounts = 0;

vi.mock("react-grid-layout/react", () => ({
  ResponsiveGridLayout: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  useContainerWidth: () => ({
    width: containerWidth,
    mounted: true,
    containerRef: { current: null },
  }),
  verticalCompactor: {},
}));

vi.mock("../dashboard-layout-provider", () => ({
  useDashboardLayoutOptional: () => null,
}));

vi.mock("../dashboard-layout-storage", () => ({
  loadSectionLayout: () => null,
  saveSectionLayout: () => {},
}));

vi.mock("../dashboard-section-header", () => ({
  SectionHeader: () => <div>header</div>,
}));

vi.mock("../dashboard-visualization-panel", () => ({
  DashboardVisualizationPanel: React.forwardRef(
    function DashboardVisualizationPanelMock(_props, ref) {
      React.useEffect(() => {
        panelMounts += 1;
        return () => {
          panelUnmounts += 1;
        };
      }, []);

      React.useImperativeHandle(ref, () => null);
      return <div>panel</div>;
    }
  ),
}));

const baseProps = {
  dashboardId: "node-overview",
  sectionIndex: 0,
  group: null,
  panels: [
    {
      type: "stat" as const,
      titleOption: { title: "Panel" },
      datasource: { sql: "select 1" },
      gridPos: { w: 24, h: 6 },
    },
  ],
  isCollapsed: false,
  onToggleCollapse: () => {},
  onSubComponentUpdated: () => {},
  globalPanelStartIndex: 0,
  initialLoading: false,
  panelCollapseStates: new Map<number, boolean>(),
  onPanelCollapsedChange: () => {},
};

describe("DashboardSection", () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    globalThis.IS_REACT_ACT_ENVIRONMENT = true;
    containerWidth = 320;
    panelMounts = 0;
    panelUnmounts = 0;
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => {
      root.unmount();
    });
    container.remove();
  });

  it("keeps rendered panels mounted when measured width temporarily drops to zero", () => {
    act(() => {
      root.render(<DashboardSection {...baseProps} />);
    });

    expect(panelMounts).toBe(1);
    expect(panelUnmounts).toBe(0);

    containerWidth = 0;

    act(() => {
      root.render(<DashboardSection {...baseProps} />);
    });

    expect(panelMounts).toBe(1);
    expect(panelUnmounts).toBe(0);
  });
});
