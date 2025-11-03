/**
 * Query execution events for event-based communication between components
 */

export interface QueryRequestOptions {
  displayFormat?: "sql" | "text";
  formatter?: (text: string) => string;
  view?: string; // View type (e.g., "dependency", "query")
  params?: Record<string, unknown>; // Query parameters to pass to executeSQL
}

export interface QueryRequestEventDetail {
  sql: string;
  options?: QueryRequestOptions;
  tabId?: string; // Optional tabId for multi-tab support
}

/**
 * Type-safe event listener for query requests
 */
export type QueryRequestEventHandler = (event: CustomEvent<QueryRequestEventDetail>) => void;

/**
 * QueryExecutor class for handling query execution events
 */
export class QueryExecutor {
  private static readonly QUERY_REQUEST_EVENT = "QUERY_REQUEST";

  /**
   * Emit a query request event
   * @param sql SQL query to execute
   * @param options Query display options
   * @param params Query parameters to pass to executeSQL
   * @param tabId Optional tab ID to target specific tab (if not provided, all tabs will handle it)
   */
  static sendQueryRequest(
    sql: string,
    options?: QueryRequestOptions,
    tabId?: string
  ): void {
    const event = new CustomEvent<QueryRequestEventDetail>(
      QueryExecutor.QUERY_REQUEST_EVENT,
      {
        detail: { sql, options, tabId },
      }
    );
    window.dispatchEvent(event);
  }

  /**
   * Add a listener for query request events
   */
  static onQueryRequest(handler: QueryRequestEventHandler): () => void {
    const wrappedHandler = (e: Event) => {
      handler(e as CustomEvent<QueryRequestEventDetail>);
    };
    window.addEventListener(QueryExecutor.QUERY_REQUEST_EVENT, wrappedHandler);
    return () =>
      window.removeEventListener(
        QueryExecutor.QUERY_REQUEST_EVENT,
        wrappedHandler
      );
  }
}

