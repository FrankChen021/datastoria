import { useConnection } from "@/components/connection/connection-context";
import type { QueryError } from "@/lib/connection/connection";
import { SqlUtils } from "@/lib/sql-utils";
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
type BatchFailureMode = "abort" | "continue";
type BatchSource = "all" | "selection";

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
  executeBatch: (
    statements: string[],
    options: { failureMode: BatchFailureMode; source: BatchSource }
  ) => void;
  cancelQuery: (queryId: string) => void;
  deleteQuery: (queryId: string) => void;
  deleteAllQueries: () => void;
  fetchTableData: (queryId: string, sql: string) => void;
}

const QueryExecutionContext = createContext<QueryExecutionContextType | undefined>(undefined);

export function QueryExecutionProvider({ children }: { children: ReactNode }) {
  const [sqlMessages, setSqlMessages] = useState<SQLMessage[]>([]);
  const { connection } = useConnection();

  // Store abort controllers for each query
  const abortControllersRef = useRef<Map<string, AbortController>>(new Map());

  // Derive SQL execution state from sqlMessages
  const isSqlExecuting = useMemo(() => sqlMessages.some((msg) => msg.isExecuting), [sqlMessages]);

  const executeQueryInternal = useCallback(
    async (
      sql: string,
      rawSQL?: string,
      options?: { view?: string },
      params?: Record<string, unknown>,
      batchMeta?: {
        statementIndex: number;
        statementCount: number;
      }
    ): Promise<"success" | "failed" | "aborted" | "empty"> => {
      // Process SQL: remove comments and check for vertical format
      let processedSQL = SqlUtils.removeComments(sql);
      let useVerticalFormat = false;

      if (processedSQL.endsWith("\\G")) {
        processedSQL = processedSQL.substring(0, processedSQL.length - 2);
        useVerticalFormat = true;
      }
      if (processedSQL.length === 0) {
        return "empty";
      }

      const view = options?.view;
      const isExplainQuery = view && view !== "query";

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

      const queryParams = params || {};
      const queryId = uuid();
      const timestamp = Date.now();

      if (!queryParams.query_id) {
        queryParams.query_id = queryId;
      }
      if (!queryParams.default_format) {
        queryParams.default_format = defaultFormat;
      }

      if (
        !isExplainQuery &&
        !useVerticalFormat &&
        queryParams.output_format_pretty_row_numbers === undefined
      ) {
        queryParams.output_format_pretty_row_numbers = true;
      }

      setSqlMessages((prevList) => {
        let newList = prevList;
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
          batch: batchMeta
            ? {
                ...batchMeta,
              }
            : undefined,
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
              abortControllersRef.current.get(queryId)?.abort();
            },
          },
        };

        return [...newList, queryMsg];
      });

      if (!connection) {
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
        return "failed";
      }

      try {
        const { response, abortController: apiAbortController } = connection.query(
          processedSQL,
          queryParams
        );

        abortControllersRef.current.set(queryId, apiAbortController);
        const apiResponse = await response;
        if (apiAbortController.signal.aborted) {
          return "aborted";
        }

        const responseData = apiResponse.data.text();

        const queryResponse: QueryResponseViewModel = {
          queryId: queryId,
          traceId: null,
          message: null,
          httpStatus: apiResponse.httpStatus,
          httpHeaders: apiResponse.httpHeaders,
          data: responseData,
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

        abortControllersRef.current.delete(queryId);
        return "success";
      } catch (error) {
        const apiError = error as QueryError;

        if (apiError.name === "AbortError" || apiError.message?.includes("aborted")) {
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
          abortControllersRef.current.delete(queryId);
          return "aborted";
        }

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

        abortControllersRef.current.delete(queryId);
        return "failed";
      }
    },
    [connection]
  );

  const executeQuery = useCallback(
    (
      sql: string,
      rawSQL?: string,
      options?: { view?: string },
      params?: Record<string, unknown>
    ) => {
      void executeQueryInternal(sql, rawSQL, options, params);
    },
    [executeQueryInternal]
  );

  const executeBatch = useCallback(
    (statements: string[], options: { failureMode: BatchFailureMode; source: BatchSource }) => {
      const normalizedStatements = statements
        .map((statement) => statement.trim())
        .filter((statement) => statement.length > 0);
      if (normalizedStatements.length === 0) {
        return;
      }

      const statementCount = normalizedStatements.length;

      void (async () => {
        for (let index = 0; index < normalizedStatements.length; index++) {
          const statement = normalizedStatements[index];
          const result = await executeQueryInternal(statement, statement, undefined, undefined, {
            statementIndex: index,
            statementCount,
          });

          if (result === "failed" && options.failureMode === "abort") {
            const skippedMessages: SQLMessage[] = normalizedStatements
              .slice(index + 1)
              .map((skippedStatement, skippedOffset) => {
                const skippedIndex = index + skippedOffset + 1;
                const queryId = uuid();
                const timestamp = Date.now() + skippedOffset + 1;
                return {
                  type: "sql",
                  id: queryId,
                  timestamp,
                  view: "query",
                  isExecuting: false,
                  batch: {
                    statementIndex: skippedIndex,
                    statementCount,
                  },
                  queryRequest: {
                    sql: skippedStatement,
                    rawSQL: skippedStatement,
                    requestServer: connection?.name || "Server",
                    queryId,
                    traceId: null,
                    timestamp,
                    showRequest: "show",
                    onCancel: () => {},
                  },
                  queryResponse: {
                    queryId,
                    traceId: null,
                    message: "Skipped due to previous statement failure in batch mode.",
                    httpStatus: 0,
                  },
                };
              });

            if (skippedMessages.length > 0) {
              setSqlMessages((prev) => {
                let next = prev;
                if (next.length + skippedMessages.length > MAX_MESSAGE_LIST_SIZE) {
                  const keep = Math.max(0, MAX_MESSAGE_LIST_SIZE - skippedMessages.length);
                  next = next.slice(next.length - keep);
                }
                return [...next, ...skippedMessages];
              });
            }
            break;
          }
        }
      })();
    },
    [connection?.name, executeQueryInternal]
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

  const fetchTableData = useCallback(
    (queryId: string, sql: string) => {
      if (!connection) return;

      // Set loading state
      setSqlMessages((prev) =>
        prev.map((msg) => (msg.id === queryId ? { ...msg, isLoadingTableData: true } : msg))
      );

      // Execute query with JSON format
      (async () => {
        try {
          const { response, abortController: apiAbortController } = connection.query(sql, {
            default_format: "JSON",
          });

          // Store abort controller with a unique key for table data fetch
          const tableDataKey = `${queryId}-table`;
          abortControllersRef.current.set(tableDataKey, apiAbortController);

          const apiResponse = await response;

          if (apiAbortController.signal.aborted) {
            return;
          }

          const tableData = apiResponse.data.text();

          // Update message with table data
          setSqlMessages((prev) =>
            prev.map((msg) =>
              msg.id === queryId
                ? {
                    ...msg,
                    isLoadingTableData: false,
                    queryResponse: msg.queryResponse
                      ? { ...msg.queryResponse, tableData }
                      : undefined,
                  }
                : msg
            )
          );

          abortControllersRef.current.delete(tableDataKey);
        } catch (error) {
          const apiError = error as QueryError;

          if (apiError.name !== "AbortError" && !apiError.message?.includes("aborted")) {
            // Real error - clear loading state
            setSqlMessages((prev) =>
              prev.map((msg) => (msg.id === queryId ? { ...msg, isLoadingTableData: false } : msg))
            );
          }

          abortControllersRef.current.delete(`${queryId}-table`);
        }
      })();
    },
    [connection]
  );

  const value = useMemo(
    () => ({
      isSqlExecuting,
      sqlMessages,
      executeQuery,
      executeBatch,
      cancelQuery,
      deleteQuery,
      deleteAllQueries,
      fetchTableData,
    }),
    [
      isSqlExecuting,
      sqlMessages,
      executeQuery,
      executeBatch,
      cancelQuery,
      deleteQuery,
      deleteAllQueries,
      fetchTableData,
    ]
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
