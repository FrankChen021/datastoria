import { TabManager } from "@/components/tab-manager";
import { ExternalLink } from "lucide-react";

interface QueryIdButtonProps {
  queryId: string | null;
  traceId?: string | null;
  showLabel?: boolean;
}

export function QueryIdButton({ queryId, traceId, showLabel = true }: QueryIdButtonProps) {
  if (!queryId) {
    return null;
  }

  return (
    <div className="text-xs text-muted-foreground">
      {showLabel && "Query Id: "}
      <button
        onClick={() =>
          TabManager.openTab({
            id: `Query Log: ${queryId}`,
            type: "query-log",
            queryId,
          })
        }
        className="text-primary hover:underline cursor-pointer inline-flex items-center gap-1"
      >
        {queryId}
        <ExternalLink className="h-3 w-3" />
      </button>
      {traceId && `, Trace Id: ${traceId}`}
    </div>
  );
}
