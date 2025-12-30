/**
 * Query execution events for event-based communication between components
 */

export interface QueryRequestOptions {
  displayFormat?: "sql" | "text";
  formatter?: (text: string) => string;
  view?: string; // View type (e.g., "dependency", "query")
  params?: Record<string, unknown>; // Query parameters to pass to query
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

export interface QuerySuccessEventDetail {
  sql: string;
  queryId?: string;
  columns?: string[];
  rowCount?: number;
  sampleData?: any[][];
  timestamp: number;
}

export type QuerySuccessEventHandler = (event: CustomEvent<QuerySuccessEventDetail>) => void;

/**
 * QueryExecutor class for handling query execution events
 */
export class QueryExecutor {
  private static readonly QUERY_REQUEST_EVENT = "QUERY_REQUEST";
  private static readonly QUERY_SUCCESS_EVENT = "QUERY_SUCCESS";

  /**
   * Remove single-line and multi-line comments from SQL
   */
  static removeComments(sql: string): string {
    return (
      sql
        // Remove single-line comments
        .replace(/^--.*$/gm, "")
        // Remove multiline comments
        .replace(/\/\*[\s\S]*?\*\//g, "")
        .trim()
    );
  }

  /**
   * Emit a query request event
   * @param sql SQL query to execute
   * @param options Query display options
   * @param params Query parameters to pass to query
   * @param tabId Optional tab ID to target specific tab (if not provided, all tabs will handle it)
   */
  static executeQuery(
    sql: string,
    options?: QueryRequestOptions,
    tabId?: string
  ): void {
    sql = this.removeComments(sql);
    if (sql.endsWith("\\G")) {
      sql = sql.substring(0, sql.length - 2);
      options = {
        ...options,
        params: {
          ...options?.params,
          default_format: "Vertical",
        },
      };
    }

    if (sql.length === 0) {
      return;
    }

    const event = new CustomEvent<QueryRequestEventDetail>(
      QueryExecutor.QUERY_REQUEST_EVENT,
      {
        detail: { sql, options, tabId },
      }
    );
    window.dispatchEvent(event);
  }

  static explainQuery(explainType: string, sql: string) {
    sql = this.removeComments(sql);

    // EXPLAINing with ending \G results in error, so clean the sql first
    if (sql.endsWith("\\G")) {
      sql = sql.substring(0, sql.length - 2);
    }

    if (sql.length === 0) {
      return;
    }

    if (explainType === "pipeline") {
      sql = `EXPLAIN pipeline graph = 1\n${sql}`;
    } else if (explainType === "plan") {
      sql = `EXPLAIN plan indexes = 1\n${sql}`;
    } else {
      sql = `EXPLAIN ${explainType}\n${sql}`;
    }

    const params: Record<string, unknown> = {
      default_format: explainType === "estimate" ? "PrettyCompactMonoBlock" : "TabSeparatedRaw",
    };

    const event = new CustomEvent<QueryRequestEventDetail>(
      QueryExecutor.QUERY_REQUEST_EVENT,
      {
        detail: { sql, options: { params: params } },
      }
    );
    window.dispatchEvent(event);
  }

  /**
   * Emit a query success event
   */
  static sendQuerySuccess(
    detail: QuerySuccessEventDetail
  ): void {
    const event = new CustomEvent<QuerySuccessEventDetail>(
      QueryExecutor.QUERY_SUCCESS_EVENT,
      {
        detail,
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

  /**
   * Add a listener for query success events
   */
  static onQuerySuccess(handler: QuerySuccessEventHandler): () => void {
    const wrappedHandler = (e: Event) => {
      handler(e as CustomEvent<QuerySuccessEventDetail>);
    };
    window.addEventListener(QueryExecutor.QUERY_SUCCESS_EVENT, wrappedHandler);
    return () =>
      window.removeEventListener(
        QueryExecutor.QUERY_SUCCESS_EVENT,
        wrappedHandler
      );
  }
}

