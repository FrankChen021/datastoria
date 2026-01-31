import { DashboardVisualizationPanel } from "@/components/shared/dashboard/dashboard-visualization-panel";
import { memo, useMemo } from "react";
import type { PanelDescriptor } from "../../../../../../src/components/shared/dashboard/dashboard-model";

export const MessageMarkdownChartSpec = memo(function MessageMarkdownChartSpec({
  spec,
}: {
  spec: string;
}) {
  // Memoize panelDescriptor modifications to avoid mutating on every render
  const panelDescriptor = useMemo(() => {
    try {
      const descriptor = JSON.parse(spec);
      return {
        ...descriptor,
        titleOption: {
          ...(descriptor.titleOption || { title: "" }),
          showRefreshButton: true,
        },
        height: descriptor.height ?? 300,
      };
    } catch (error) {
      return null;
    }
  }, [spec]);

  return (
    <>
      {panelDescriptor && (
        <div
          className="pt-1"
          style={{ height: panelDescriptor?.height ? panelDescriptor.height + 30 : 300 }}
        >
          <DashboardVisualizationPanel descriptor={panelDescriptor as PanelDescriptor} />
        </div>
      )}
    </>
  );
});
