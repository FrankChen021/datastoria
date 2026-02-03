import type { PanelDescriptor } from "@/components/shared/dashboard/dashboard-model";
import { DashboardVisualizationPanel } from "@/components/shared/dashboard/dashboard-visualization-panel";
import { memo, useMemo } from "react";

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
    } catch {
      // The spec may be is still streaming
      return null;
    }
  }, [spec]);

  return (
    <>
      {panelDescriptor ? (
        <div
          className="pt-1"
          style={{ height: panelDescriptor?.height ? panelDescriptor.height + 30 : 300 }}
        >
          <DashboardVisualizationPanel descriptor={panelDescriptor as PanelDescriptor} />
        </div>
      ) : (
        <div className="pt-1">
          <p className="text-[10px] text-muted-foreground">
            {spec}
          </p>
        </div>
      )}
    </>
  );
});
