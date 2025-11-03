import { Button } from "@/components/ui/button";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { format } from "date-fns";
import { ChevronDown, ChevronUp, Loader2, X } from "lucide-react";
import { useRef, useState } from "react";
import { QueryResponseView } from "./query-response-view";
import { QueryRequestView } from "./query-request-view";
import type { QueryViewProps } from "./query-view-model";

interface QueryListItemViewProps extends QueryViewProps {
  isLast?: boolean;
}

export function QueryListItemView({ onQueryDelete, view, isExecuting, queryRequest, queryResponse, isLast }: QueryListItemViewProps) {
  const [collapsed, setCollapsed] = useState(queryRequest.showRequest === "collapse");
  const [showDelete, setShowDelete] = useState(false);
  const deleteButtonRef = useRef<HTMLButtonElement>(null);

  const timestamp = format(new Date(queryRequest.timestamp), "yyyy-MM-dd HH:mm:ss");

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
      className={`pb-4 mb-4 ${isLast ? "" : "border-b"}`}
      onMouseEnter={() => setShowDelete(true)}
      onMouseLeave={() => setShowDelete(false)}
    >
      {/* Header */}
      <div className="flex items-center gap-2 mb-2">
        <h4 className="text-sm font-semibold">{timestamp}</h4>
        {!isExecuting && onQueryDelete && (
          <Button
            ref={deleteButtonRef}
            variant="ghost"
            size="icon"
            className={`h-6 w-6 transition-opacity ${showDelete ? "opacity-100" : "opacity-0 pointer-events-none"}`}
            onClick={() => onQueryDelete(queryRequest.uuid)}
          >
            <X className="h-4 w-4" />
          </Button>
        )}
      </div>

      {/* Query Request */}
      {renderQueryRequest()}

      {/* Query Response */}
      {queryResponse &&
        (queryResponse.data !== undefined || queryResponse.errorMessage !== undefined) &&
        view === "query" && <QueryResponseView queryResponse={queryResponse} />}

      {/* Query Status */}
      <div className="flex items-center gap-2 mt-2">
        {isExecuting && <Loader2 className="h-4 w-4 animate-spin" />}
        <div className="text-xs text-muted-foreground font-mono">
          {queryResponse?.httpHeaders?.["x-clickhouse-summary"] && (
            <span>
              {(() => {
                try {
                  const summary = JSON.parse(queryResponse.httpHeaders["x-clickhouse-summary"]);
                  const parts: string[] = [];
                  if (summary.read_rows > 0) parts.push(`read rows: ${summary.read_rows}`);
                  if (summary.read_bytes > 0) parts.push(`read bytes: ${summary.read_bytes}`);
                  if (summary.written_rows > 0) parts.push(`written rows: ${summary.written_rows}`);
                  if (summary.written_bytes > 0) parts.push(`written bytes: ${summary.written_bytes}`);
                  return parts.length > 0 ? `, ${parts.join(", ")}` : "";
                } catch {
                  return "";
                }
              })()}
            </span>
          )}
        </div>
      </div>
    </div>
  );
}
