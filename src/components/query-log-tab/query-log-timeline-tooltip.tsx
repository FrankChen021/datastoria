import { Popover, PopoverContent } from "@/components/ui/popover";
import { Separator } from "@/components/ui/separator";
import React from "react";
import type { QueryLogTreeNode } from "./query-log-timeline-types";
import { DateTimeExtension } from "@/lib/datetime-utils";
import { Formatter } from "@/lib/formatter";

const TOOLTIP_WIDTH = 440;
const TOOLTIP_HEIGHT = 280;

export function calculateTooltipPosition(x: number, y: number) {
    const padding = 20;
    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;

    // Calculate initial position (top-right of cursor)
    let left = x + padding;
    let top = y + padding;

    // Adjust if tooltip would overflow right edge
    if (left + TOOLTIP_WIDTH > viewportWidth - padding) {
        left = x - TOOLTIP_WIDTH - padding;
    }

    // Adjust if tooltip would overflow bottom edge
    if (top + TOOLTIP_HEIGHT > viewportHeight - padding) {
        top = y - TOOLTIP_HEIGHT - padding;
    }

    // Ensure tooltip stays within viewport bounds
    left = Math.max(padding, Math.min(left, viewportWidth - TOOLTIP_WIDTH - padding));
    top = Math.max(padding, Math.min(top, viewportHeight - TOOLTIP_HEIGHT - padding));

    return { top, left };
}

const QueryLogTimelineTooltipImpl = ({ node }: { node: QueryLogTreeNode }) => {
    const log = node.queryLog;

    return (
        <div className="flex flex-col gap-1">
            <Separator />
            <div className="text-sm overflow-x-auto max-w-[${TOOLTIP_WIDTH}px]">
                <div className="min-w-max space-y-1">
                    <div className="flex">
                        <span className="font-bold w-32">Query ID:</span>
                        <span className="text-muted-foreground break-all flex-1">{node.queryId}</span>
                    </div>
                    <div className="flex">
                        <span className="font-bold w-32">Start Time:</span>
                        <span className="text-muted-foreground flex-1">{DateTimeExtension.formatDateTime(new Date(node.startTime / 1000), "yyyy-MM-dd HH:mm:ss.SSS")}{node.startTime % 1000}</span>
                    </div>
                    <Separator className="my-2" />

                    {log && (
                        <>
                            {log.query && (
                                <div className="flex flex-col">
                                    <span className="font-bold">Query:</span>
                                    <span className="text-muted-foreground text-xs font-mono break-all mt-1">
                                        {log.query.substring(0, 200)}
                                        {log.query.length > 200 ? "..." : ""}
                                    </span>
                                </div>
                            )}

                            <Separator className="my-2" />

                            {node.costTime > 0 && (
                                <div className="flex">
                                    <span className="font-bold w-32">Duration:</span>
                                    <span className="text-muted-foreground flex-1">{(node.costTime / 1000).toFixed(2)} ms</span>
                                </div>
                            )}
                            {log.read_rows !== undefined && (
                                <div className="flex">
                                    <span className="font-bold w-32">Read Rows:</span>
                                    <span className="text-muted-foreground flex-1">{Formatter.getInstance().getFormatter('comma_number')(log.read_rows)}</span>
                                </div>
                            )}
                            {log.read_bytes !== undefined && (
                                <div className="flex">
                                    <span className="font-bold w-32">Read Bytes:</span>
                                    <span className="text-muted-foreground flex-1">{Formatter.getInstance().getFormatter('binary_size')(log.read_bytes)}</span>
                                </div>
                            )}
                            {log.result_rows !== undefined && (
                                <div className="flex">
                                    <span className="font-bold w-32">Result Rows:</span>
                                    <span className="text-muted-foreground flex-1">{Formatter.getInstance().getFormatter('comma_number')(log.result_rows)}</span>
                                </div>
                            )}
                            {log.written_rows !== undefined && (
                                <div className="flex">
                                    <span className="font-bold w-32">Written Rows:</span>
                                    <span className="text-muted-foreground flex-1">{Formatter.getInstance().getFormatter('comma_number')(log.written_rows)}</span>
                                </div>
                            )}
                            {log.written_bytes !== undefined && (
                                <div className="flex">
                                    <span className="font-bold w-32">Written Bytes:</span>
                                    <span className="text-muted-foreground flex-1">{Formatter.getInstance().getFormatter('binary_size')(log.written_bytes)}</span>
                                </div>
                            )}
                        </>
                    )}
                </div>
            </div>
        </div>
    );
};

interface QueryLogTimelineTooltipProps {
    node: QueryLogTreeNode;
    initialPosition: { top: number; left: number };
}

export const QueryLogTimelineTooltip = React.memo(
    ({ node, initialPosition }: QueryLogTimelineTooltipProps) => {
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
                        <QueryLogTimelineTooltipImpl node={node} />
                    </div>
                </PopoverContent>
            </Popover>
        );
    },
    (prevProps, nextProps) => {
        return prevProps.node?.id === nextProps.node?.id;
    }
);

QueryLogTimelineTooltip.displayName = "QueryLogTimelineTooltip";
