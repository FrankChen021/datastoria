import type { ConnectionConfig } from "./connection-config";

// Re-export ConnectionConfig for convenience
export type { ConnectionConfig };

export class QueryError extends Error {
  httpStatus?: number;
  httpHeaders?: any;
  data: any;

  constructor(message: string, httpStatus?: number, httpHeaders?: any, data?: any) {
    super(message);
    this.name = "QueryError";
    this.httpStatus = httpStatus;
    this.httpHeaders = httpHeaders;
    this.data = data;

    // Maintains proper stack trace for where our error was thrown (only available on V8)
    if (typeof (Error as any).captureStackTrace === "function") {
      (Error as any).captureStackTrace(this, QueryError);
    }
  }
}

export interface QueryResponse {
  httpStatus: number;
  httpHeaders: any;
  data: any;
}

export interface TableInfo {
  database: string;
  table: string;
  comment?: string | null;
}

export interface DatabaseInfo {
  name: string;
  comment?: string | null;
}

export interface ConnectionMetadata {
  targetNode?: string;
  internalUser: string;
  timezone: string;
  function_table_has_description_column: boolean;
  metric_log_table_has_ProfileEvent_MergeSourceParts: boolean;
  metric_log_table_has_ProfileEvent_MutationTotalParts: boolean;

  tableNames?: Map<string, TableInfo>;
  databaseNames?: Map<string, DatabaseInfo>;
}

const USER_CANCELLED_ERROR_MESSAGE = "User cancelled";

export class Connection {
  // Static config
  readonly name: string;
  readonly url: string;
  readonly user: string;
  readonly password?: string;
  readonly cluster?: string;

  // Runtime properties
  readonly host: string;
  readonly path: string;
  readonly userParams: Record<string, unknown>;

  // Connection metadata information
  metadata: ConnectionMetadata;

  private constructor(config: ConnectionConfig) {
    this.name = config.name;
    this.url = config.url;
    this.user = config.user;
    this.password = config.password;
    this.cluster = config.cluster;

    const urlObj = new URL(config.url);
    this.host = urlObj.origin;
    this.path = urlObj.pathname === "" ? "/" : urlObj.pathname;

    this.userParams = {};
    urlObj.searchParams.forEach((val, key) => {
      this.userParams[key] = val;
    });

    if (this.userParams["max_execution_time"] !== undefined) {
      const maxExecTime = this.userParams["max_execution_time"];
      if (typeof maxExecTime === "string") {
        this.userParams["max_execution_time"] = parseInt(maxExecTime, 10);
      }
    }

    // Initialize metadata with defaults
    this.metadata = {
      internalUser: config.user, // Default to external configured user
      timezone: "UTC", // Default timezone
      function_table_has_description_column: false,
      metric_log_table_has_ProfileEvent_MergeSourceParts: false,
      metric_log_table_has_ProfileEvent_MutationTotalParts: false,
    };
  }

  static create(config: ConnectionConfig): Connection {
    return new Connection(config);
  }

  public query(
    sql: string,
    params?: Record<string, unknown>,
    headers?: Record<string, string>
  ): { response: Promise<QueryResponse>; abortController: AbortController } {
    // Validate connection is properly initialized
    if (!this.host || !this.path) {
      throw new QueryError(`Connection not properly initialized. Host: ${this.host}, Path: ${this.path}`);
    }

    if (this.cluster && this.cluster.length > 0 && sql.includes("{cluster}")) {
      // Do replacement
      sql = sql.replaceAll("{cluster}", this.cluster);
    }

    const requestHeaders: Record<string, string> = headers || {};

    // Set default ClickHouse headers if not provided
    if (!requestHeaders["Content-Type"]) {
      requestHeaders["Content-Type"] = "text/plain";
    }

    // Merge user params with request params (request params take precedence)
    const requestParams: Record<string, unknown> = Object.assign({}, this.userParams);
    if (params) {
      Object.assign(requestParams, params);
    }
    // Add default format if not specified
    if (!requestParams["default_format"]) {
      requestParams["default_format"] = "JSONCompact";
    }

    // Build URL with query parameters
    const url = new URL(this.path, this.host);
    Object.entries(requestParams).forEach(([key, value]) => {
      if (value !== undefined && value !== null) {
        url.searchParams.append(key, String(value));
      }
    });

    // Build Basic Auth header
    const basicAuth = btoa(`${this.user}:${this.password || ""}`);
    requestHeaders["Authorization"] = `Basic ${basicAuth}`;

    // Create abort controller for the caller to use
    const abortController = new AbortController();

    const response = (async (): Promise<QueryResponse> => {
      try {
        const fetchUrl = url.toString();

        // Validate URL before making request
        if (!fetchUrl || !(fetchUrl.startsWith("http://") || fetchUrl.startsWith("https://"))) {
          throw new QueryError(`Invalid URL: ${fetchUrl}. Connection may not be properly initialized.`);
        }

        const response = await fetch(fetchUrl, {
          method: "POST",
          headers: requestHeaders,
          body: sql,
          signal: abortController.signal,
        });

        // Read response body as text first (can only be read once)
        const responseText = await response.text();

        if (!response.ok) {
          const clickHouseErrorCode = response.headers.get("x-clickhouse-exception-code");
          throw new QueryError(
            clickHouseErrorCode
              ? `Failed to execute query, got ClickHouse Exception Code: ${clickHouseErrorCode}`
              : `Failed to execute query, got HTTP status ${response.status} ${response.statusText} from server`,
            response.status,
            Object.fromEntries(response.headers.entries()),
            responseText
          );
        }

        // Check Content-Type header to determine if response is JSON
        const contentType = response.headers.get("content-type") || "";
        const isJson =
          contentType.toLowerCase().includes("application/json") || contentType.toLowerCase().includes("text/json");

        // Parse as JSON if Content-Type indicates JSON, otherwise use text
        let data: unknown;
        if (isJson) {
          try {
            data = JSON.parse(responseText);
          } catch {
            // If JSON parsing fails, fallback to text
            data = responseText;
          }
        } else {
          data = responseText;
        }

        return {
          httpStatus: response.status,
          httpHeaders: Object.fromEntries(response.headers.entries()),
          data: data,
        };
      } catch (error: unknown) {
        // If it's already an QueryError, re-throw it
        if (error instanceof QueryError) {
          throw error;
        }

        // Handle abort errors (can be Error with name "AbortError" or DOMException)
        if (
          (error instanceof Error && error.name === "AbortError") ||
          (error instanceof DOMException && error.name === "AbortError")
        ) {
          throw new QueryError("Request was cancelled by user");
        }

        if (error === USER_CANCELLED_ERROR_MESSAGE) {
          throw new QueryError(error as string);
        }

        // Re-throw as QueryError-like error
        const errorMessage = error instanceof Error ? error.message : "Unknown error";
        if (errorMessage === "Failed to fetch") {
          // This could be CORS, network error, or invalid URL
          const errorDetails =
            `Failed to connect to ${this.host}${this.path}. \n` +
            `Possible causes: CORS issue, network error, or invalid server URL. ` +
            `Please check the connection configuration and ensure the server allows requests from this origin.`;
          throw new QueryError(errorDetails);
        }
        throw new QueryError(errorMessage);
      }
    })();

    return { response, abortController };
  }

  public queryOnNode(
    sql: string,
    params?: Record<string, unknown>,
    headers?: Record<string, string>
  ): { response: Promise<QueryResponse>; abortController: AbortController } {
    const node = this.metadata.targetNode;

    if (node === undefined) {
      return this.query(sql, params, headers);
    }

    if (this.cluster && this.cluster.length > 0 && sql.includes("{cluster}")) {
      // Do replacement
      sql = sql.replaceAll("{cluster}", this.cluster);

      // Since cluster/clusterAllReplica is used, don't use remote function to execute this sql
      return this.query(sql, params, headers);
    }

    return this.query(
      `
SELECT * FROM remote(
  '${node}', 
  view(
        ${sql}
  ), 
  '${this.metadata.internalUser}', 
  '${this.password}')`,
      params,
      headers
    );
  }
}
