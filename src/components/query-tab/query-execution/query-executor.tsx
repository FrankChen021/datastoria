import { useConnection } from "@/components/connection/connection-context";
import type { QueryError } from "@/lib/connection/connection";
import { StringUtils } from "@/lib/string-utils";
import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { v7 as uuid } from "uuid";
import type { QueryResponseViewModel, SQLMessage } from "../query-view-model";

const MAX_MESSAGE_LIST_SIZE = 100;

interface QueryExecutionContextType {
  isSqlExecuting: boolean;
  // SQL Message management
  sqlMessages: SQLMessage[];
  executeQuery: (
    sql: string,
    rawSQL?: string,
    options?: { view?: string },
    params?: Record<string, unknown>
  ) => void;
  cancelQuery: (queryId: string) => void;
  deleteQuery: (queryId: string) => void;
  deleteAllQueries: () => void;
}

const QueryExecutionContext = createContext<QueryExecutionContextType | undefined>(undefined);

export function QueryExecutionProvider({ children }: { children: ReactNode }) {
  const [sqlMessages, setSqlMessages] = useState<SQLMessage[]>([]);
  const { connection } = useConnection();

  // Store abort controllers for each query
  const abortControllersRef = useRef<Map<string, AbortController>>(new Map());

  // Derive SQL execution state from sqlMessages
  const isSqlExecuting = useMemo(() => sqlMessages.some((msg) => msg.isExecuting), [sqlMessages]);

  const executeQuery = useCallback(
    (
      sql: string,
      rawSQL?: string,
      options?: { view?: string },
      params?: Record<string, unknown>
    ) => {
      // Process SQL: remove comments and check for vertical format
      let processedSQL = StringUtils.removeComments(sql);
      let useVerticalFormat = false;

      if (processedSQL.endsWith("\\G")) {
        processedSQL = processedSQL.substring(0, processedSQL.length - 2);
        useVerticalFormat = true;
      }
      if (processedSQL.length === 0) {
        return;
      }

      // For explain queries, extract the original SQL from the EXPLAIN statement
      const view = options?.view;
      const isExplainQuery = view && view !== "query";

      // Determine default format based on view and vertical format flag
      let defaultFormat: string;
      if (view === "estimate") {
        defaultFormat = "PrettyCompactMonoBlock";
      } else if (isExplainQuery) {
        defaultFormat = "TabSeparatedRaw";
      } else if (useVerticalFormat) {
        defaultFormat = "Vertical";
      } else {
        defaultFormat = "PrettyCompactMonoBlock";
      }

      // Build query parameters
      const queryParams = params || {};
      const queryId = uuid();
      const timestamp = Date.now();

      // Set defaults if not provided
      if (!queryParams.query_id) {
        queryParams.query_id = queryId;
      }
      if (!queryParams.default_format) {
        queryParams.default_format = defaultFormat;
      }

      // Add row numbers for pretty formats (unless explicitly disabled)
      if (
        !isExplainQuery &&
        !useVerticalFormat &&
        queryParams.output_format_pretty_row_numbers === undefined
      ) {
        queryParams.output_format_pretty_row_numbers = true;
      }

      // 1. Create initial message with executing state
      setSqlMessages((prevList) => {
        let newList = prevList;
        // Optional: limit local SQL history size
        if (newList.length >= MAX_MESSAGE_LIST_SIZE) {
          newList = newList.slice(newList.length - MAX_MESSAGE_LIST_SIZE + 1);
        }

        const queryMsg: SQLMessage = {
          type: "sql",
          id: queryId,
          timestamp,
          view: view || "query",
          viewArgs: { params: queryParams },
          isExecuting: true,
          queryResponse: undefined,
          queryRequest: {
            sql: processedSQL,
            rawSQL: rawSQL || processedSQL,
            requestServer: connection?.name || "Server",
            queryId: queryId,
            traceId: null,
            timestamp: timestamp,
            showRequest: "show",
            params: queryParams,
            onCancel: () => {
              // Cancel handler will be set below
              abortControllersRef.current.get(queryId)?.abort();
            },
          },
        };

        return [...newList, queryMsg];
      });

      // 2. Execute the query asynchronously
      if (!connection) {
        // No connection - update with error immediately
        setSqlMessages((prev) =>
          prev.map((msg) =>
            msg.id === queryId
              ? {
                  ...msg,
                  isExecuting: false,
                  queryResponse: {
                    queryId: queryId,
                    traceId: null,
                    message: "No connection available",
                    httpStatus: 0,
                  },
                }
              : msg
          )
        );
        return;
      }

      // Execute query
      (async () => {
        try {
          const { response, abortController: apiAbortController } = connection.query(
            processedSQL,
            queryParams
          );

          // Store abort controller
          abortControllersRef.current.set(queryId, apiAbortController);

          const apiResponse = await response;

          // Check if request was aborted
          if (apiAbortController.signal.aborted) {
            return;
          }

          // For dependency view, keep the JSON structure; for others, convert to string
          const responseData = apiResponse.data.text();

          const queryResponse: QueryResponseViewModel = {
            queryId: queryId,
            traceId: null,
            message: null,
            httpStatus: apiResponse.httpStatus,
            httpHeaders: apiResponse.httpHeaders,
            data: responseData,
          };

          // Update message with response
          setSqlMessages((prev) =>
            prev.map((msg) =>
              msg.id === queryId
                ? {
                    ...msg,
                    isExecuting: false,
                    queryResponse,
                  }
                : msg
            )
          );

          abortControllersRef.current.delete(queryId);
        } catch (error) {
          // Only set error response if it's not a cancellation
          const apiError = error as QueryError;

          if (apiError.name === "AbortError" || apiError.message?.includes("aborted")) {
            // Query was cancelled - just mark as not executing
            setSqlMessages((prev) =>
              prev.map((msg) =>
                msg.id === queryId
                  ? {
                      ...msg,
                      isExecuting: false,
                    }
                  : msg
              )
            );
          } else {
            // Real error - update with error response
            const queryResponse: QueryResponseViewModel = {
              queryId: queryId,
              traceId: null,
              message: apiError.message || String(error),
              httpStatus: apiError.httpStatus,
              httpHeaders: apiError.httpHeaders,
              data: apiError.data,
            };

            setSqlMessages((prev) =>
              prev.map((msg) =>
                msg.id === queryId
                  ? {
                      ...msg,
                      isExecuting: false,
                      queryResponse,
                    }
                  : msg
              )
            );
          }

          abortControllersRef.current.delete(queryId);
        }
      })();
    },
    [connection]
  );

  const cancelQuery = useCallback((queryId: string) => {
    const abortController = abortControllersRef.current.get(queryId);
    if (abortController) {
      abortController.abort();
      abortControllersRef.current.delete(queryId);
    }
  }, []);

  const deleteQuery = useCallback(
    (queryId: string) => {
      // Cancel if executing
      cancelQuery(queryId);
      // Remove from list
      setSqlMessages((prev) => prev.filter((m) => m.id !== queryId));
    },
    [cancelQuery]
  );

  const deleteAllQueries = useCallback(() => {
    // Cancel all executing queries
    abortControllersRef.current.forEach((controller) => controller.abort());
    abortControllersRef.current.clear();
    // Clear all messages
    setSqlMessages([]);
  }, []);

  const value = useMemo(
    () => ({
      isSqlExecuting,
      sqlMessages,
      executeQuery,
      cancelQuery,
      deleteQuery,
      deleteAllQueries,
    }),
    [isSqlExecuting, sqlMessages, executeQuery, cancelQuery, deleteQuery, deleteAllQueries]
  );

  return <QueryExecutionContext.Provider value={value}>{children}</QueryExecutionContext.Provider>;
}

export function useQueryExecutor() {
  const context = useContext(QueryExecutionContext);
  if (!context) {
    throw new Error("useQueryExecutor must be used within a QueryExecutionProvider");
  }
  return context;
}
