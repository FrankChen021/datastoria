import { TabManager } from "@/components/tab-manager";
import { CopyButton } from "@/components/ui/copy-button";
import { HoverCard, HoverCardContent, HoverCardTrigger } from "@/components/ui/hover-card";
import React from "react";

interface TraceIdLinkProps {
  displayTraceId: string;
  traceId: string;
  eventDate?: string;
}

export const TraceIdLink = React.memo<TraceIdLinkProps>(
  ({ displayTraceId, traceId, eventDate }) => {
    const truncatedId =
      displayTraceId.length > 12
        ? displayTraceId.slice(0, 6) + "..." + displayTraceId.slice(-6)
        : displayTraceId;

    const handleClick = (e: React.MouseEvent) => {
      e.stopPropagation();
      TabManager.openTab({
        id: `Span Log: ${traceId}`,
        type: "span-log",
        traceId,
        eventDate,
      });
    };

    return (
      <HoverCard>
        <HoverCardTrigger asChild>
          <button
            type="button"
            className="font-monotext-xs text-blue-500 hover:underline cursor-pointer"
            onClick={handleClick}
          >
            {truncatedId}
          </button>
        </HoverCardTrigger>
        <HoverCardContent className="p-2 max-w-[400px]">
          <div className="flex items-center gap-2">
            <div className="font-mono text-xs break-all">{displayTraceId}</div>
            <CopyButton value={displayTraceId} className="!static !top-auto !right-auto shrink-0" />
          </div>
        </HoverCardContent>
      </HoverCard>
    );
  }
);

TraceIdLink.displayName = "TraceIdLink";
