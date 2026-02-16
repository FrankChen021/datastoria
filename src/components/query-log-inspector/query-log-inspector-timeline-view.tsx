import type { ExpandableTreeView, TimelineNode } from "@/components/shared/timeline/timeline-types";
import SharedTimelineView from "@/components/shared/timeline/timeline-view";
import { Separator } from "@/components/ui/separator";
import { DateTimeExtension } from "@/lib/datetime-utils";
import { Formatter } from "@/lib/formatter";
import React, { forwardRef } from "react";
import { QueryLogDetailPane } from "./query-log-inspector-detail-pane";
import type { QueryLogTreeNode, TimelineStats } from "./query-log-inspector-timeline-types";

interface QueryLogTimelineViewProps {
  inputNodeTree: QueryLogTreeNode[];
  inputNodeList: QueryLogTreeNode[];
  timelineStats: TimelineStats;
  isActive: boolean;
}

const QueryLogTimelineView = React.memo(
  forwardRef<ExpandableTreeView, QueryLogTimelineViewProps>(
    ({ inputNodeTree, inputNodeList, timelineStats, isActive }, ref) => {
      const renderQueryLogTooltipContent = (node: TimelineNode) => {
        const log = node.data;
        const queryValue = typeof log.query === "string" ? log.query : "";

        return (
          <div className="flex flex-col gap-1">
            <Separator />
            <div className="text-sm overflow-x-auto max-w-[440px]">
              <div className="min-w-max space-y-1">
                <div className="flex">
                  <span className="font-bold w-32">Query ID:</span>
                  <span className="text-muted-foreground break-all flex-1">
                    {node.queryId || "-"}
                  </span>
                </div>
                <div className="flex">
                  <span className="font-bold w-32">Start Time:</span>
                  <span className="text-muted-foreground flex-1">
                    {DateTimeExtension.formatDateTime(
                      new Date(node.startTime / 1000),
                      "yyyy-MM-dd HH:mm:ss.SSS"
                    )}
                    {node.startTime % 1000}
                  </span>
                </div>
                <Separator className="my-2" />
                {queryValue !== "" && (
                  <>
                    <div className="flex flex-col">
                      <span className="font-bold">Query:</span>
                      <span className="text-muted-foreground text-xs font-mono break-all mt-1">
                        {queryValue.substring(0, 200)}
                        {queryValue.length > 200 ? "..." : ""}
                      </span>
                    </div>
                    <Separator className="my-2" />
                  </>
                )}
                {node.costTime > 0 && (
                  <div className="flex">
                    <span className="font-bold w-32">Duration:</span>
                    <span className="text-muted-foreground flex-1">
                      {(node.costTime / 1000).toFixed(2)} ms
                    </span>
                  </div>
                )}
                {log.read_rows !== undefined && (
                  <div className="flex">
                    <span className="font-bold w-32">Read Rows:</span>
                    <span className="text-muted-foreground flex-1">
                      {Formatter.getInstance().getFormatter("comma_number")(log.read_rows)}
                    </span>
                  </div>
                )}
                {log.read_bytes !== undefined && (
                  <div className="flex">
                    <span className="font-bold w-32">Read Bytes:</span>
                    <span className="text-muted-foreground flex-1">
                      {Formatter.getInstance().getFormatter("binary_size")(log.read_bytes)}
                    </span>
                  </div>
                )}
              </div>
            </div>
          </div>
        );
      };

      return (
        <SharedTimelineView
          ref={ref}
          inputNodeTree={inputNodeTree}
          inputNodeList={inputNodeList}
          timelineStats={timelineStats}
          isActive={isActive}
          searchPlaceholderSuffix="nodes"
          inactiveMessage="Switch to Timeline tab to view query logs"
          processingMessage="Processing timeline data..."
          noDataMessage="No nodes found"
          renderDetailPane={(selectedNode, onClose) => (
            <QueryLogDetailPane queryLogs={[selectedNode.data]} onClose={onClose} />
          )}
          renderTooltipContent={renderQueryLogTooltipContent}
        />
      );
    }
  )
);

QueryLogTimelineView.displayName = "QueryLogTimelineView";
export default QueryLogTimelineView;
