export type QueryViewType = "query" | "plan" | "estimate" | "syntax" | "ast" | "pipeline" | "table";

export interface QueryRequestViewModel {
  /**
   * SQL is being executing
   */
  sql: string;

  requestServer: string;

  /**
   * Raw SQL that user type in the editor
   */
  rawSQL: string;
  headers?: Record<string, string>;
  params?: Record<string, unknown>;
  queryId: string;
  traceId: string | null;
  timestamp: number;

  /**
   * Whether to show the request. If false, the request will be collapsed to save space
   */
  showRequest: "show" | "hide" | "collapse";

  onCancel: () => void;
}

export interface QueryResponseViewModel {
  queryId: string | null;
  traceId: string | null;
  message: string | null;
  httpStatus?: number;
  httpHeaders?: Record<string, string>;
  data?: unknown;
  tableData?: unknown; // JSON format response (cached for table view)
}

export interface QueryErrorDisplay {
  message: string;
  data: unknown;

  /**
   * ClickHouse exception code
   */
  exceptionCode?: string;
}

export interface QueryResponseViewProps {
  queryRequest: QueryRequestViewModel;
  queryResponse: QueryResponseViewModel;
  error?: QueryErrorDisplay;
}

export interface QueryViewProps {
  onQueryDelete?: (queryId: string) => void;
  view: QueryViewType | string;
  queryRequest: QueryRequestViewModel;
  viewArgs?: {
    showRequest?: "show" | "hide" | "collapse";
    params?: Record<string, unknown>;
  };
}

export interface SQLMessage {
  type: "sql";
  id: string;
  queryRequest: QueryRequestViewModel;
  queryResponse?: QueryResponseViewModel; // Response after query execution
  isExecuting: boolean; // Whether the query is currently executing
  batch?: {
    statementIndex: number;
    statementCount: number;
  };
  isLoadingTableData?: boolean; // Whether table data is being fetched
  view: QueryViewType | string;
  viewArgs?: {
    showRequest?: "show" | "hide" | "collapse";
    params?: Record<string, unknown>;
  };
  timestamp: number;
  sessionId?: string; // Optional session ID when SQL is added to chat
  tabId?: string; // Optional tab ID for multi-tab support
}
