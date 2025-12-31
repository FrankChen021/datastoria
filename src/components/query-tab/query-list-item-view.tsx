import { Button } from "@/components/ui/button";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Formatter } from "@/lib/formatter";
import { format } from "date-fns";
import { ChevronDown, ChevronUp, Square, X } from "lucide-react";
import { memo, useEffect, useRef, useState } from "react";
import { QueryExecutionTimer } from "./query-execution-timer";
import { useQueryExecutor } from "./query-execution/query-executor";
import { QueryIdButton } from "./query-id-button";
import { QueryRequestView } from "./query-request-view";
import { QueryResponseView } from "./query-response/query-response-view";
import type { QueryResponseViewModel, QueryViewProps } from "./query-view-model";

interface QueryListItemViewProps extends QueryViewProps {
  isFirst?: boolean;
  queryResponse?: QueryResponseViewModel;
  isExecuting: boolean;
}

const QuerySummary = memo(({ summaryText }: { summaryText: string | undefined }) => {
  if (!summaryText) {
    return null;
  }

  try {
    const summary = JSON.parse(summaryText);
    const parts: string[] = [];
    Object.entries(summary).forEach(([key, value]) => {
      const numValue = typeof value === "number" ? value : Number(value);
      if (!isNaN(numValue) && numValue !== 0) {
        const formattedKey = key.replace(/_/g, " ");
        const formattedValue = Formatter.getInstance().getFormatter("comma_number")(numValue);
        parts.push(`${formattedKey}: ${formattedValue}`);
      }
    });
    return parts.length > 0 ? (
      <div className="text-xs text-muted-foreground">
        <span>Summary: {parts.join(", ")}</span>
      </div>
    ) : null;
  } catch {
    return null;
  }
});

QuerySummary.displayName = "QuerySummary";

export function QueryListItemView({
  onQueryDelete,
  view,
  queryRequest,
  isFirst,
  queryResponse,
  isExecuting,
}: QueryListItemViewProps) {
  const { cancelQuery } = useQueryExecutor();
  const [collapsed, setCollapsed] = useState(queryRequest.showRequest === "collapse");
  const [showDelete, setShowDelete] = useState(false);
  const deleteButtonRef = useRef<HTMLButtonElement>(null);
  const scrollPlaceholderRef = useRef<HTMLDivElement>(null);

  const timestamp = format(new Date(queryRequest.timestamp), "yyyy-MM-dd HH:mm:ss");

  // Scroll to placeholder when execution completes
  useEffect(() => {
    if (queryResponse !== undefined && !isExecuting && scrollPlaceholderRef.current) {
      // Use requestAnimationFrame to wait for DOM to render, then scroll smoothly
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          if (scrollPlaceholderRef.current) {
            scrollPlaceholderRef.current.scrollIntoView({ block: "end", behavior: "smooth" });
          }
        });
      });
    }
  }, [queryResponse, isExecuting]);

  // Handle query deletion - cancel if executing, then delete
  const handleDelete = () => {
    if (isExecuting) {
      cancelQuery(queryRequest.queryId);
    }
    if (onQueryDelete) {
      onQueryDelete(queryRequest.queryId);
    }
  };

  const renderQueryRequest = () => {
    if (queryRequest.showRequest === "hide") {
      return null;
    }

    if (queryRequest.showRequest === "collapse") {
      return (
        <Collapsible open={!collapsed} onOpenChange={(open) => setCollapsed(!open)}>
          <div className="flex items-center gap-2 mb-2">
            <CollapsibleTrigger asChild>
              <Button variant="ghost" size="sm">
                {collapsed ? <ChevronDown className="h-4 w-4" /> : <ChevronUp className="h-4 w-4" />}
              </Button>
            </CollapsibleTrigger>
          </div>
          <CollapsibleContent>
            <QueryRequestView queryRequest={queryRequest} />
          </CollapsibleContent>
        </Collapsible>
      );
    }

    return <QueryRequestView queryRequest={queryRequest} />;
  };

  return (
    <div
      className={`pl-2 py-3 ${isFirst ? "" : "border-t"}`}
      onMouseEnter={() => setShowDelete(true)}
      onMouseLeave={() => setShowDelete(false)}
    >
      {/* Header */}
      <div className="flex items-center gap-2 mb-2">
        <h4 className="text-sm font-semibold text-muted-foreground">{timestamp}</h4>
        {!isExecuting && onQueryDelete && (
          <Button
            ref={deleteButtonRef}
            variant="ghost"
            size="icon"
            className={`h-6 w-6 transition-opacity ${showDelete ? "opacity-100" : "opacity-0 pointer-events-none"}`}
            onClick={handleDelete}
          >
            <X className="h-4 w-4" />
          </Button>
        )}
      </div>

      {/* Query Request */}
      {renderQueryRequest()}

      {/* Query Response */}
      {queryResponse && (queryResponse.data !== undefined || queryResponse.message !== undefined) && (
        <QueryResponseView
          queryResponse={queryResponse}
          queryRequest={queryRequest}
          sql={queryRequest.sql}
          view={view}
        />
      )}

      <div className="flex items-center gap-2 mt-1">
        <QueryExecutionTimer isExecuting={isExecuting} />
        {isExecuting && (
          <Button
            variant="ghost"
            size="sm"
            className="h-6 text-xs rounded-sm text-destructive"
            onClick={() => cancelQuery(queryRequest.queryId)}
          >
            <Square className="!h-3 !w-3" /> Click to cancel execution
          </Button>
        )}
      </div>

      {/* Query Status */}
      <div ref={scrollPlaceholderRef} className="flex flex-col">
        {queryResponse && (queryResponse.queryId || queryRequest.queryId) && (
          <QueryIdButton queryId={queryResponse.queryId || queryRequest.queryId} traceId={queryRequest.traceId} />
        )}
        {/* <div className="text-xs text-muted-foreground">Request Server: {queryRequest.requestServer}</div> */}
        {queryResponse?.httpHeaders?.["x-clickhouse-server-display-name"] && (
          <div className="text-xs text-muted-foreground">
            Server: {queryResponse.httpHeaders["x-clickhouse-server-display-name"]}
          </div>
        )}
        <QuerySummary summaryText={queryResponse?.httpHeaders?.["x-clickhouse-summary"]} />
      </div>
    </div>
  );
}
