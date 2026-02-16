import { TabManager } from "@/components/tab-manager";
import { CopyButton } from "@/components/ui/copy-button";
import { HoverCard, HoverCardContent, HoverCardTrigger } from "@/components/ui/hover-card";
import { ExternalLink } from "lucide-react";
import React from "react";

interface QueryIdLinkProps {
  displayQueryId: string;
  queryId: string;
  eventDate?: string;
  showIcon?: boolean;
}

export const QueryIdLink = React.memo<QueryIdLinkProps>(
  ({ displayQueryId, queryId, eventDate: event_date, showIcon = false }) => {
    if (queryId.trim() === "") {
      return null;
    }

    const truncatedId =
      displayQueryId.length > 12
        ? displayQueryId.slice(0, 6) + "..." + displayQueryId.slice(-6)
        : displayQueryId;

    const handleClick = (e: React.MouseEvent) => {
      e.stopPropagation();
      TabManager.openTab({
        id: `Query Log: ${queryId}`,
        type: "query-log",
        queryId,
        eventDate: event_date,
      });
    };

    return (
      <HoverCard>
        <HoverCardTrigger asChild>
          <span
            className="font-monotext-xs text-blue-500 hover:underline cursor-pointer inline-flex items-center gap-1"
            onClick={handleClick}
          >
            {truncatedId}
            {showIcon && <ExternalLink className="h-3 w-3 shrink-0" />}
          </span>
        </HoverCardTrigger>
        <HoverCardContent className="p-2 max-w-[400px]">
          <div className="flex items-center gap-2">
            <div className="font-mono text-xs break-all">{displayQueryId}</div>
            <CopyButton value={displayQueryId} className="!static !top-auto !right-auto shrink-0" />
          </div>
        </HoverCardContent>
      </HoverCard>
    );
  }
);
QueryIdLink.displayName = "QueryIdLink";
