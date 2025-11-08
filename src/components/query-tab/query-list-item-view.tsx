import { Button } from "@/components/ui/button";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import type { ApiErrorResponse } from "@/lib/api";
import { Api } from "@/lib/api";
import { useConnection } from "@/lib/connection/ConnectionContext";
import { format } from "date-fns";
import { ChevronDown, ChevronUp, Loader2, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { ExplainASTResponseView } from "./explain-ast-response-view";
import { ExplainPipelineResponseView } from "./explain-pipeline-response-view";
import { ExplainQueryResponseView } from "./explain-query-response-view";
import { ExplainSyntaxResponseView } from "./explain-syntax-response-view";
import { QueryExecutionTimer } from "./query-execution-timer";
import { QueryRequestView } from "./query-request-view";
import { ApiErrorView, type ApiErrorResponse as QueryApiErrorResponse } from "./query-response-view";
import { QueryResponseView } from "./query-response-view";
import type { QueryResponseViewModel, QueryViewProps } from "./query-view-model";

interface QueryListItemViewProps extends QueryViewProps {
  isLast?: boolean;
  onExecutionStateChange?: (queryId: string, isExecuting: boolean) => void;
}

export function QueryListItemView({
  onQueryDelete,
  view,
  queryRequest,
  viewArgs,
  isLast,
  onExecutionStateChange,
}: QueryListItemViewProps) {
  const { selectedConnection } = useConnection();
  const [collapsed, setCollapsed] = useState(queryRequest.showRequest === "collapse");
  const [showDelete, setShowDelete] = useState(false);
  // Start as executing if we don't have a response yet (new query)
  const [isExecuting, setIsExecuting] = useState(true);
  const [queryResponse, setQueryResponse] = useState<QueryResponseViewModel | undefined>(undefined);
  const abortControllerRef = useRef<AbortController | null>(null);
  const deleteButtonRef = useRef<HTMLButtonElement>(null);
  const hasExecutedRef = useRef<string | null>(null);
  const scrollPlaceholderRef = useRef<HTMLDivElement>(null);

  const timestamp = format(new Date(queryRequest.timestamp), "yyyy-MM-dd HH:mm:ss");

  // Execute query when component mounts
  useEffect(() => {
    // Guard: Prevent concurrent executions for the same query
    // If guard is set, another execution is already in progress
    if (hasExecutedRef.current === queryRequest.uuid) {
      return;
    }

    if (!selectedConnection) {
      setIsExecuting(false);
      onExecutionStateChange?.(queryRequest.uuid, false);
      return;
    }

    // Mark as executing - this will be reset if cancelled
    hasExecutedRef.current = queryRequest.uuid;
    setIsExecuting(true);
    onExecutionStateChange?.(queryRequest.uuid, true);

    // Create abort controller for this execution
    const abortController = new AbortController();
    abortControllerRef.current = abortController;

    const api = Api.create(selectedConnection);

    // Use JSON format for dependency view, TabSeparated for others
    // But if params are provided in viewArgs, use those instead (they override defaults)
    const defaultFormat = view === "dependency" ? "JSON" : "TabSeparated";

    const params = viewArgs?.params
      ? { ...viewArgs.params }
      : {
          default_format: defaultFormat,
          output_format_json_quote_64bit_integers: view === "dependency" ? 0 : undefined,
        };

    // Execute query asynchronously
    (async () => {
      try {
        const response = await api.executeAsync(
          {
            sql: queryRequest.sql,
            headers: {
              "Content-Type": "text/plain",
            },
            params: params,
          },
          abortController.signal
        );

        // Check if request was aborted
        if (abortController.signal.aborted) {
          return;
        }

        // For dependency view, keep the JSON structure; for others, convert to string
        let responseData: unknown;
        if (view === "dependency") {
          responseData = response.data; // Keep JSON structure for dependency view
        } else {
          responseData = typeof response.data === "string" ? response.data : String(response.data);
        }

        const queryResponse: QueryResponseViewModel = {
          formatter: viewArgs?.formatter,
          displayFormat: viewArgs?.displayFormat || "text",
          queryId: queryRequest.queryId,
          traceId: queryRequest.traceId,
          errorMessage: null,
          httpStatus: response.httpStatus,
          httpHeaders: response.httpHeaders,
          data: responseData,
        };

        setQueryResponse(queryResponse);
        setIsExecuting(false);
        onExecutionStateChange?.(queryRequest.uuid, false);
        abortControllerRef.current = null;
      } catch (error) {
        // Check if request was aborted
        if (abortController.signal.aborted) {
          // Cancellation - don't update state here, let cleanup handle it
          // This prevents the loader from flickering in StrictMode
          abortControllerRef.current = null;
          hasExecutedRef.current = null;
          return;
        }

        // Only set error response if it's not a cancellation
        const apiError = error as ApiErrorResponse;
        if (
          apiError.errorMessage &&
          !apiError.errorMessage.toLowerCase().includes("cancel") &&
          !apiError.errorMessage.toLowerCase().includes("abort")
        ) {
          const queryResponse: QueryResponseViewModel = {
            formatter: viewArgs?.formatter,
            displayFormat: viewArgs?.displayFormat || "text",
            queryId: queryRequest.queryId,
            traceId: queryRequest.traceId,
            errorMessage: apiError.errorMessage || "Unknown error occurred",
            httpStatus: apiError.httpStatus,
            httpHeaders: apiError.httpHeaders,
            data: apiError.data,
          };

          setQueryResponse(queryResponse);
          setIsExecuting(false);
          onExecutionStateChange?.(queryRequest.uuid, false);
          abortControllerRef.current = null;
        } else {
          // Cancellation - don't update state here, let cleanup handle it
          // This prevents the loader from flickering in StrictMode
          abortControllerRef.current = null;
          hasExecutedRef.current = null;
        }
      }
    })();

    // Cleanup: cancel query on unmount
    return () => {
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
        abortControllerRef.current = null;
        // Reset guard when cancelled so StrictMode's second execution can proceed
        // Don't reset isExecuting here - let the second execution maintain the loading state
        hasExecutedRef.current = null;
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [queryRequest.uuid]); // Only re-execute if this is a different query (different uuid)

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

  // Handle query deletion - cancel if executing
  const handleDelete = () => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }
    if (onQueryDelete) {
      onQueryDelete(queryRequest.uuid);
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

  const renderExplainResultView = () => {
    if (!queryResponse) {
      return null;
    }

    if (queryResponse.errorMessage !== null) {
      const error: QueryApiErrorResponse = {
        errorMessage: queryResponse.errorMessage,
        data: queryResponse.data,
        httpHeaders: queryResponse.httpHeaders,
      };

      return <ApiErrorView error={error} sql={queryRequest.sql} />;
    }

    return (
      <>
        {view === "ast" && <ExplainASTResponseView queryRequest={queryRequest} queryResponse={queryResponse} />}

        {view === "pipeline" && (
          <ExplainPipelineResponseView queryRequest={queryRequest} queryResponse={queryResponse} />
        )}

        {view === "plan" && <ExplainQueryResponseView queryRequest={queryRequest} queryResponse={queryResponse} />}

        {view === "estimate" && <ExplainQueryResponseView queryRequest={queryRequest} queryResponse={queryResponse} />}

        {view === "syntax" && <ExplainSyntaxResponseView queryRequest={queryRequest} queryResponse={queryResponse} />}
      </>
    );
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
            onClick={handleDelete}
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
        view === "query" && <QueryResponseView queryResponse={queryResponse} sql={queryRequest.sql} />}

      {/* Explain Response */}
      {queryResponse &&
        (queryResponse.data !== undefined || queryResponse.errorMessage !== undefined) &&
        view !== "query" &&
        renderExplainResultView()}

      {isExecuting && (
        <div className="flex items-center gap-2 mt-2 mb-2">
          <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
          <span className="text-sm text-muted-foreground">
            Executing query...
            <QueryExecutionTimer isExecuting={isExecuting} />
          </span>
        </div>
      )}

      {/* Query Status */}
      <div ref={scrollPlaceholderRef} className="flex flex-col mt-1">
        {queryRequest.queryId && (
          <div className="text-xs text-muted-foreground">
            Query Id: {queryRequest.queryId}
            {queryRequest.traceId && `, Trace Id: ${queryRequest.traceId}`}
          </div>
        )}
        {/* <div className="text-xs text-muted-foreground">Request Server: {queryRequest.requestServer}</div> */}
        {queryResponse?.httpHeaders?.["x-clickhouse-server-display-name"] && (
          <div className="text-xs text-muted-foreground">
            Response Server: {queryResponse.httpHeaders["x-clickhouse-server-display-name"]}
          </div>
        )}
        <div className="text-xs text-muted-foreground">
          {queryResponse?.httpHeaders?.["x-clickhouse-summary"] && (
            <span>
              {(() => {
                try {
                  const summary = JSON.parse(queryResponse.httpHeaders["x-clickhouse-summary"]);
                  const parts: string[] = [];
                  if (summary.read_rows > 0) parts.push(`Read rows: ${summary.read_rows}`);
                  if (summary.read_bytes > 0) parts.push(`Read bytes: ${summary.read_bytes}`);
                  if (summary.written_rows > 0) parts.push(`Written rows: ${summary.written_rows}`);
                  if (summary.written_bytes > 0) parts.push(`Written bytes: ${summary.written_bytes}`);
                  return parts.length > 0 ? `${parts.join(", ")}` : "";
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
