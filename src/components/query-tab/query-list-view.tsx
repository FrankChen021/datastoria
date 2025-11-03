import type { ApiCanceller, ApiErrorResponse, ApiResponse } from "@/lib/api";
import { Api } from "@/lib/api";
import { useConnection } from "@/lib/connection/ConnectionContext";
import { toastManager } from "@/lib/toast";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { v4 as uuid } from "uuid";
import { QueryExecutor, type QueryRequestEventDetail } from "./query-execution/query-executor";
import { QueryListItemView } from "./query-list-item-view";
import type { QueryRequestViewModel, QueryResponseViewModel, QueryViewProps } from "./query-view-model";

export interface QueryListViewProps {
  tabId?: string; // Optional tab ID for multi-tab support
}

const MAX_QUERY_VIEW_LIST_SIZE = 50;

interface QueryListItem {
  queryRequest: QueryRequestViewModel;
  queryResponse?: QueryResponseViewModel;
  view: string;
  isExecuting: boolean;
  viewArgs?: {
    displayFormat?: "sql" | "text";
    formatter?: (text: string) => string;
    showRequest?: "show" | "hide" | "collapse";
    params?: Record<string, unknown>;
  };
}

export function QueryListView({ tabId }: QueryListViewProps) {
  const { selectedConnection } = useConnection();
  const [queryList, setQueryList] = useState<QueryListItem[]>([]);
  const queryCancellersRef = useRef<Map<string, ApiCanceller>>(new Map());
  const responseScrollContainerRef = useRef<HTMLDivElement>(null);
  const scrollPlaceholderRef = useRef<HTMLDivElement>(null);
  const shouldScrollRef = useRef(false);

  const scrollToBottom = useCallback(() => {
    if (scrollPlaceholderRef.current) {
      // Use requestAnimationFrame to wait for DOM to render, then scroll smoothly
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          if (scrollPlaceholderRef.current) {
            scrollPlaceholderRef.current.scrollIntoView({ block: 'end', behavior: 'smooth' });
          }
        });
      });
    }
  }, []);

  const executeQuery = useCallback(
    (
      sql: string,
      options?: { displayFormat?: "sql" | "text"; formatter?: (text: string) => string; view?: string },
      params?: Record<string, unknown>
    ) => {
      if (!selectedConnection) {
        toastManager.show("No connection selected", "error");
        return;
      }

      const queryId = uuid();
      const timestamp = Date.now();

      setQueryList((responseList) => {
        let newResponseList = responseList;
        if (newResponseList.length >= MAX_QUERY_VIEW_LIST_SIZE) {
          // Clear history
          newResponseList = [];
        }

        const queryRequest: QueryRequestViewModel = {
          uuid: queryId,
          sql: sql,
          rawSQL: sql,
          requestServer: "Random Host",
          queryId: queryId,
          traceId: null,
          timestamp: timestamp,
          showRequest: options?.formatter ? "hide" : "show",
          params: params,
          onCancel: () => {
            const canceller = queryCancellersRef.current.get(queryId);
            if (canceller) {
              canceller.cancel();
              queryCancellersRef.current.delete(queryId);
            }
          },
        };

        shouldScrollRef.current = true;
        return newResponseList.concat({
          queryRequest: queryRequest,
          viewArgs: { ...options, params },
          view: options?.view || "query",
          isExecuting: true,
        });
      });
    },
    [selectedConnection]
  );

  // Execute queries when they're added to the list
  useEffect(() => {
    if (queryList.length === 0) return;

    const executingQueries = queryList.filter((q) => q.isExecuting && !q.queryResponse);

    executingQueries.forEach((query) => {
      if (!selectedConnection) return;

      const api = Api.create(selectedConnection);
      const queryRequest = query.queryRequest;

      // Use JSON format for dependency view, TabSeparated for others
      const defaultFormat = query.view === "dependency" ? "JSON" : "TabSeparated";

      const canceller = api.executeSQL(
        {
          sql: queryRequest.sql,
          params: query.viewArgs?.params || {
            default_format: defaultFormat,
            output_format_json_quote_64bit_integers: query.view === "dependency" ? 0 : undefined,
          },
        },
        (response: ApiResponse) => {
          // For dependency view, keep the JSON structure; for others, convert to string
          let responseData: unknown;
          if (query.view === "dependency") {
            responseData = response.data; // Keep JSON structure for dependency view
          } else {
            responseData = typeof response.data === "string" ? response.data : String(response.data);
          }

          const queryResponse: QueryResponseViewModel = {
            formatter: query.viewArgs?.formatter,
            displayFormat: query.viewArgs?.displayFormat || "text",
            queryId: queryRequest.queryId,
            traceId: queryRequest.traceId,
            errorMessage: null,
            httpStatus: response.httpStatus,
            httpHeaders: response.httpHeaders,
            data: responseData,
          };

          shouldScrollRef.current = true;
          setQueryList((prevList) =>
            prevList.map((q) =>
              q.queryRequest.uuid === queryRequest.uuid ? { ...q, queryResponse, isExecuting: false } : q
            )
          );
          queryCancellersRef.current.delete(queryRequest.uuid);
        },
        (error: ApiErrorResponse) => {
          const queryResponse: QueryResponseViewModel = {
            formatter: query.viewArgs?.formatter,
            displayFormat: query.viewArgs?.displayFormat || "text",
            queryId: queryRequest.queryId,
            traceId: queryRequest.traceId,
            errorMessage: error.errorMessage || "Unknown error occurred",
            httpStatus: error.httpStatus,
            httpHeaders: error.httpHeaders,
            data: error.data,
          };

          shouldScrollRef.current = true;
          setQueryList((prevList) =>
            prevList.map((q) =>
              q.queryRequest.uuid === queryRequest.uuid ? { ...q, queryResponse, isExecuting: false } : q
            )
          );
          queryCancellersRef.current.delete(queryRequest.uuid);
          toastManager.show(`Query execution failed: ${error.errorMessage}`, "error");
        },
        () => {
          // Query execution finished
        }
      );

      queryCancellersRef.current.set(queryRequest.uuid, canceller);
    });
  }, [queryList, selectedConnection]);

  // Auto-scroll to bottom when queryList changes
  useEffect(() => {
    if (shouldScrollRef.current) {
      shouldScrollRef.current = false;
      scrollToBottom();
    }
  }, [queryList, scrollToBottom]);

  // Listen for query request events
  useEffect(() => {
    const unsubscribe = QueryExecutor.onQueryRequest((event: CustomEvent<QueryRequestEventDetail>) => {
      const { sql, options, tabId: eventTabId } = event.detail;

      // If tabId is specified, only handle events for this tab
      // If no tabId is specified in event, handle it in all tabs
      if (eventTabId !== undefined && eventTabId !== tabId) {
        return;
      }

      executeQuery(sql, options, options?.params);
    });

    return unsubscribe;
  }, [tabId, executeQuery]);

  const handleQueryDelete = useCallback((queryId: string) => {
    const canceller = queryCancellersRef.current.get(queryId);
    if (canceller) {
      canceller.cancel();
      queryCancellersRef.current.delete(queryId);
    }

    setQueryList((prevList) => prevList.filter((q) => q.queryRequest.uuid !== queryId));
  }, []);

  const queryViewProps: QueryViewProps[] = useMemo(
    () =>
      queryList.map((item) => ({
        queryRequest: item.queryRequest,
        queryResponse: item.queryResponse,
        view: item.view,
        isExecuting: item.isExecuting,
      })),
    [queryList]
  );

  return (
    <div ref={responseScrollContainerRef} className="h-full w-full overflow-auto p-2" style={{ scrollBehavior: 'smooth' }}>
      {queryViewProps.length === 0 ? (
        <div className="text-sm text-muted-foreground p-1">Input your SQL in the editor below and execute it, then the results will appear here.</div>
      ) : (
        <>
          {queryViewProps.map((query, index) => (
            <QueryListItemView 
              key={query.queryRequest.uuid} 
              {...query} 
              onQueryDelete={handleQueryDelete}
              isLast={index === queryViewProps.length - 1}
            />
          ))}
          {/* Placeholder element used for smooth scrolling to the end */}
          <div ref={scrollPlaceholderRef} />
        </>
      )}
    </div>
  );
}
