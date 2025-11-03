export interface QueryRequestViewModel {
  /**
   * Since queryId might be empty, we generate uuid for each query so that this id can be used as key prop of React
   */
  uuid: string;

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
  formatter?: (response: string) => string;
  displayFormat?: "text" | "sql";

  queryId: string | null;
  traceId: string | null;
  errorMessage: string | null;
  httpStatus?: number;
  httpHeaders?: Record<string, string>;
  data?: unknown;
}

export interface QueryResponseViewProps {
  queryRequest: QueryRequestViewModel;
  queryResponse: QueryResponseViewModel;
}

export interface QueryViewProps {
  onQueryDelete?: (queryId: string) => void;
  view: string;
  isExecuting: boolean;
  queryRequest: QueryRequestViewModel;
  queryResponse?: QueryResponseViewModel;
}

export type { QueryRequestViewModel, QueryResponseViewModel, QueryResponseViewProps, QueryViewProps };
