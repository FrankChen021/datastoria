import { Button } from "@/components/ui/button";
import { Formatter } from "@/lib/formatter";
import { ChevronDownIcon, ChevronRightIcon } from "lucide-react";
import React, { useCallback, useState } from "react";

import type { QueryLogTreeNode } from "./query-log-timeline-types";

const MICROSECONDS_PER_MS = 1000;
const INDENT = 18;
const SPLITTER_WIDTH = 2;

const microSecondFormat = Formatter.getInstance().getFormatter("microsecond");

interface QueryLogTimelineRowProps {
    node: QueryLogTreeNode;
    isSelected: boolean;
    isExpanded: boolean;
    treeWidthPercent: number;
    onSelect: (node: QueryLogTreeNode) => void;
    onToggleExpand: (nodeId: string) => void;
    onSplitterMouseDown: (e: React.MouseEvent) => void;
    minStart: number;
    totalDuration: number;
    onEnterRow: (e: React.MouseEvent) => void;
    onLeaveRow?: (e: React.MouseEvent) => void;
    zoomLevel: number;
}

const QueryLogTimelineRow = React.memo(
    ({
        node,
        isSelected,
        isExpanded,
        treeWidthPercent,
        onSelect,
        onToggleExpand,
        onSplitterMouseDown,
        minStart,
        totalDuration,
        onEnterRow,
        onLeaveRow,
        zoomLevel,
    }: QueryLogTimelineRowProps) => {
        const [isHovered, setIsHovered] = useState(false);

        const color = node._color;

        // Bar calculation
        const barStart = node.startTime / MICROSECONDS_PER_MS - minStart;
        const end = (node.startTime + node.costTime) / MICROSECONDS_PER_MS - minStart;
        const barLeftPercent = (barStart / totalDuration) * 100;
        const barWidthPercent = ((end - barStart) / totalDuration) * 100;

        // Ensure minimum width of 0.5% for visibility (even for very short queries)
        const minBarWidth = 0.5;
        const actualBarWidth = Math.max(barWidthPercent, minBarWidth);

        const barLeft = `${barLeftPercent}%`;
        const barWidth = `${actualBarWidth}%`;

        const handleMouseEnter = useCallback(
            (e: React.MouseEvent) => {
                setIsHovered(true);
                onEnterRow(e);
            },
            [onEnterRow]
        );

        const handleMouseLeave = useCallback(
            (e: React.MouseEvent) => {
                setIsHovered(false);
                if (onLeaveRow) {
                    onLeaveRow(e);
                }
            },
            [onLeaveRow]
        );

        // Highlight matching search text
        const renderDisplayName = () => {
            if (node._matchedLength > 0) {
                const before = node._display.substring(0, node._matchedIndex);
                const match = node._display.substring(node._matchedIndex, node._matchedIndex + node._matchedLength);
                const after = node._display.substring(node._matchedIndex + node._matchedLength);
                return (
                    <>
                        {before}
                        <span className="bg-yellow-200 dark:bg-yellow-600">{match}</span>
                        {after}
                    </>
                );
            }
            return node._display;
        };

        return (
            <div
                data-node-id={node.id}
                className="relative flex items-center group"
                onMouseEnter={handleMouseEnter}
                onMouseLeave={handleMouseLeave}
            >
                {/* Main row */}
                <div
                    className={`flex items-center h-[36px] w-full cursor-pointer ${isSelected ? "bg-cyan-50 dark:bg-cyan-900/30" : isHovered ? "bg-gray-100 dark:bg-gray-700/50" : ""
                        }`}
                    onClick={() => onSelect(node)}
                >
                    {/* Tree node */}
                    <div
                        className="flex items-center min-w-[60px] overflow-hidden"
                        style={{
                            width: `${treeWidthPercent}%`,
                            paddingLeft: `${node.depth * INDENT + 8}px`,
                        }}
                    >
                        {node.children && node.children.length > 0 ? (
                            <Button
                                variant="ghost"
                                size="icon"
                                className="h-[16px] w-[16px] p-0 border-0 rounded-none flex-shrink-0"
                                onClick={(e) => {
                                    e.stopPropagation();
                                    onToggleExpand(node.id);
                                }}
                            >
                                {isExpanded ? (
                                    <ChevronDownIcon className="h-3 w-3 transition-transform duration-200" />
                                ) : (
                                    <ChevronRightIcon className="h-3 w-3 transition-transform duration-200" />
                                )}
                            </Button>
                        ) : (
                            <div className="h-[16px] w-[16px] flex-shrink-0" />
                        )}

                        {/* Color indicator */}
                        <div
                            className="h-[36px] w-[4px] flex-shrink-0 mr-[4px] rounded-none"
                            style={{ backgroundColor: color.foreground }}
                        />

                        <div className="flex flex-col justify-center flex-1 min-w-0 overflow-hidden">
                            <span className="text-sm text-ellipsis overflow-hidden whitespace-nowrap">
                                {renderDisplayName()}
                                {node.childCount > 0 && ` (${node.childCount})`}
                            </span>
                        </div>
                    </div>

                    {/* Splitter */}
                    <div
                        className="cursor-col-resize bg-[#e0e0e0] h-[36px] mx-0.5 rounded-sm z-[2]"
                        style={{ width: SPLITTER_WIDTH }}
                        onMouseDown={onSplitterMouseDown}
                    />

                    {/* Chart bar */}
                    <div className="flex-1 relative h-[36px] items-center flex">
                        <div
                            className="w-full relative"
                            style={{
                                width: zoomLevel !== 1.0 ? `${100 * zoomLevel}%` : "100%",
                            }}
                        >
                            {/* Always render bar for all nodes */}
                            <div
                                className="absolute h-[18px] transition-colors duration-200"
                                style={{
                                    left: barLeft,
                                    width: barWidth,
                                    backgroundColor: color.foreground,
                                    top: "50%",
                                    transform: "translateY(-50%)",
                                    borderRadius: "2px",
                                }}
                            />
                            {node.costTime > 0 && (
                                <span
                                    className="absolute text-xs"
                                    style={{
                                        left: `calc(${barLeft} + 10px)`,
                                        top: "50%",
                                        transform: "translateY(-50%)",
                                    }}
                                >
                                    {microSecondFormat(node.costTime)}
                                </span>
                            )}
                        </div>
                    </div>
                </div>
            </div>
        );
    },
    (prevProps, nextProps) => {
        // Custom comparison function to determine if re-render is needed
        return (
            prevProps.node.id === nextProps.node.id &&
            prevProps.node._matchedIndex === nextProps.node._matchedIndex &&
            prevProps.node._matchedLength === nextProps.node._matchedLength &&
            prevProps.isSelected === nextProps.isSelected &&
            prevProps.isExpanded === nextProps.isExpanded &&
            prevProps.treeWidthPercent === nextProps.treeWidthPercent &&
            prevProps.minStart === nextProps.minStart &&
            prevProps.totalDuration === nextProps.totalDuration &&
            prevProps.node.startTime === nextProps.node.startTime &&
            prevProps.node.costTime === nextProps.node.costTime &&
            prevProps.node.children?.length === nextProps.node.children?.length &&
            prevProps.zoomLevel === nextProps.zoomLevel
        );
    }
);

QueryLogTimelineRow.displayName = "QueryLogTimelineRow";
export default QueryLogTimelineRow;
