import { Popover, PopoverContent } from "@/components/ui/popover";
import { Separator } from "@/components/ui/separator";
import { DateTimeExtension } from "@/lib/datetime-utils";
import { Formatter } from "@/lib/formatter";
import React from "react";
import type { TimelineNode } from "./timeline-types";

const TOOLTIP_WIDTH = 440;
const TOOLTIP_HEIGHT = 280;

export function calculateTimelineTooltipPosition(x: number, y: number) {
  const padding = 20;
  const viewportWidth = window.innerWidth;
  const viewportHeight = window.innerHeight;

  let left = x + padding;
  let top = y + padding;

  if (left + TOOLTIP_WIDTH > viewportWidth - padding) {
    left = x - TOOLTIP_WIDTH - padding;
  }
  if (top + TOOLTIP_HEIGHT > viewportHeight - padding) {
    top = y - TOOLTIP_HEIGHT - padding;
  }

  left = Math.max(padding, Math.min(left, viewportWidth - TOOLTIP_WIDTH - padding));
  top = Math.max(padding, Math.min(top, viewportHeight - TOOLTIP_HEIGHT - padding));

  return { top, left };
}

const TimelineTooltipImpl = ({ node }: { node: TimelineNode }) => {
  const log = node.data;
  const queryValue = typeof log.query === "string" ? log.query : "";

  return (
    <div className="flex flex-col gap-1">
      <Separator />
      <div className="text-sm overflow-x-auto max-w-[440px]">
        <div className="min-w-max space-y-1">
          <div className="flex">
            <span className="font-bold w-32">Query ID:</span>
            <span className="text-muted-foreground break-all flex-1">{node.queryId || "-"}</span>
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
          {log.result_rows !== undefined && (
            <div className="flex">
              <span className="font-bold w-32">Result Rows:</span>
              <span className="text-muted-foreground flex-1">
                {Formatter.getInstance().getFormatter("comma_number")(log.result_rows)}
              </span>
            </div>
          )}
          {log.written_rows !== undefined && (
            <div className="flex">
              <span className="font-bold w-32">Written Rows:</span>
              <span className="text-muted-foreground flex-1">
                {Formatter.getInstance().getFormatter("comma_number")(log.written_rows)}
              </span>
            </div>
          )}
          {log.written_bytes !== undefined && (
            <div className="flex">
              <span className="font-bold w-32">Written Bytes:</span>
              <span className="text-muted-foreground flex-1">
                {Formatter.getInstance().getFormatter("binary_size")(log.written_bytes)}
              </span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

interface TimelineTooltipProps {
  node: TimelineNode;
  initialPosition: { top: number; left: number };
  renderTooltipContent?: (node: TimelineNode) => React.ReactNode;
}

export const TimelineTooltip = React.memo(
  ({ node, initialPosition, renderTooltipContent }: TimelineTooltipProps) => {
    return (
      <Popover open={node !== null}>
        <PopoverContent
          className="fixed z-[9999] bg-popover text-popover-foreground rounded-sm border shadow-md p-2"
          style={{
            top: `${initialPosition.top}px`,
            left: `${initialPosition.left}px`,
            width: `${TOOLTIP_WIDTH}px`,
          }}
        >
          <div className="flex flex-col gap-1">
            <div className="font-medium truncate">{node._display}</div>
            {renderTooltipContent ? (
              renderTooltipContent(node)
            ) : (
              <TimelineTooltipImpl node={node} />
            )}
          </div>
        </PopoverContent>
      </Popover>
    );
  },
  (prevProps, nextProps) => {
    return prevProps.node.id === nextProps.node.id;
  }
);

TimelineTooltip.displayName = "TimelineTooltip";
