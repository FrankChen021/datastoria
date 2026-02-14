import type { DependencyTableInfo } from "@/components/dependency-view/dependency-types";
import type { ConnectionConfig } from "./connection-config";

// Re-export ConnectionConfig for convenience
export type { ConnectionConfig };

export class QueryError extends Error {
  httpStatus?: number;
  httpHeaders?: any;
  data: any;
  errorCode?: string;

  constructor(message: string, httpStatus?: number, httpHeaders?: any, data?: any) {
    super(message);
    this.name = "QueryError";
    this.httpStatus = httpStatus;
    this.httpHeaders = httpHeaders;
    this.data = data;
    this.errorCode = httpHeaders ? httpHeaders["x-clickhouse-exception-code"]?.trim() : undefined;

    // Explicitly set prototype to ensure instanceof works correctly across async boundaries
    Object.setPrototypeOf(this, QueryError.prototype);

    // Maintains proper stack trace for where our error was thrown (only available on V8)
    if (typeof (Error as any).captureStackTrace === "function") {
      (Error as any).captureStackTrace(this, QueryError);
    }
  }
}

export interface QueryResponseData {
  text: () => string;
  json: <T = any>() => T;
}

export interface QueryResponse {
  httpStatus: number;
  httpHeaders: any;
  data: QueryResponseData;
}

export interface TableInfo {
  database: string;
  table: string;
  comment?: string | null;
  columns?: Array<{ name: string; type: string }> | string[];
  engine?: string | null;
}

export interface DatabaseInfo {
  name: string;
  comment?: string | null;
}

export interface JSONCompactFormatResponse {
  data: unknown[][];
  meta: { name: string; type: string }[];
  rows: number;
  statistics: {
    elapsed: number;
    rows_read: number;
    bytes_read: number;
  };
}

export interface JSONFormatResponse {
  data: Record<string, unknown>[];
  meta: { name: string; type: string }[];
  rows: number;
  statistics: {
    elapsed: number;
    rows_read: number;
    bytes_read: number;
  };
}

export interface ConnectionMetadata {
  // The display name of the connection, will be used to display in the UI
  displayName: string;

  // The node that initial query is performed on
  // It will be used to execute future queries in users intend to perform query on that node
  // ONLY available under the cluster mode
  remoteHostName?: string;

  // The current user at server side, will be used to execute queries that require the internal user name instead of the client side configured user name
  internalUser: string;

  // Server timezone
  timezone: string;

  //
  // Capabilities
  //
  // Table columns
  function_table_has_description_column: boolean;
  metric_log_table_has_ProfileEvent_MergeSourceParts: boolean;
  metric_log_table_has_ProfileEvent_MutationTotalParts: boolean;
  query_log_table_has_hostname_column: boolean;
  span_log_table_has_hostname_column: boolean;
  part_log_table_has_node_name_column: boolean;

  // Functions
  has_format_query_function: boolean;

  // Settings
  is_readonly_skip_unavailable_shards: boolean;

  tableNames?: Map<string, TableInfo>;
  databaseNames?: Map<string, DatabaseInfo>;

  // Cached dependency data - loaded on demand and cached here
  dependencyData?: {
    tables: Map<string, DependencyTableInfo>;
    innerTables: Map<string, DependencyTableInfo>;
  };

  // Cached ProfileEvents from system.events - used for SQL validation
  // If it fails to get events, validation will be skipped
  profileEvents?: Set<string>;
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

  readonly connectionId: string;

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

    this.connectionId = `${config.user}@${this.host}`;

    // Initialize metadata with defaults
    this.metadata = {
      displayName: config.name,

      internalUser: config.user, // Default to external configured user
      timezone: "UTC", // Default timezone

      // Tables
      function_table_has_description_column: false,
      metric_log_table_has_ProfileEvent_MergeSourceParts: false,
      metric_log_table_has_ProfileEvent_MutationTotalParts: false,
      query_log_table_has_hostname_column: false,
      span_log_table_has_hostname_column: false,
      part_log_table_has_node_name_column: false,

      // Functions
      has_format_query_function: false,

      // Settings, Assume it's readonly by default in case we can't access the settings
      is_readonly_skip_unavailable_shards: true,
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
      throw new QueryError(
        `Connection not properly initialized. Host: ${this.host}, Path: ${this.path}`
      );
    }

    // Apply cluster template replacements
    const [replacedSql] = this.resolveClusterTemplates(sql);
    sql = replacedSql;

    const requestHeaders: Record<string, string> = headers || {};

    // Set default ClickHouse headers if not provided
    if (!requestHeaders["Content-Type"]) {
      requestHeaders["Content-Type"] = "text/plain";
    }

    // Merge user params with request params (request params take precedence)
    const queryParameters: Record<string, unknown> = Object.assign({}, this.userParams);
    if (params) {
      Object.assign(queryParameters, params);
    }
    // Add default format if not specified
    if (!queryParameters["default_format"]) {
      queryParameters["default_format"] = "JSONCompact";
    }

    // Can't add this header automatically
    // Some clusters are deployed after load balancers which may have enable CORS already
    // queryParameters["add_http_cors_header"] = "1";

    // Build URL with query parameters
    const url = new URL(this.path, this.host);
    Object.entries(queryParameters).forEach(([key, value]) => {
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
          throw new QueryError(
            `Invalid URL: ${fetchUrl}. Connection may not be properly initialized.`
          );
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

        const data: QueryResponseData = {
          text: () => responseText,
          json: <T = any>() => JSON.parse(responseText) as T,
        };

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
          const errorDetails =
            `Failed to connect to ${this.host}${this.path} \n` +
            `Possible causes: CORS issue, network error, DNS problem, or invalid server URL. ` +
            `Please check the connection configuration and ensure the server allows requests from this origin.`;
          throw new QueryError(errorDetails);
        }
        throw new QueryError(errorMessage);
      }
    })();

    return { response, abortController };
  }

  /**
   * Execute a query and return the raw fetch Response for streaming.
   * The caller is responsible for reading the response body (e.g. via response.body.getReader()).
   * Does not consume the response body.
   */
  public queryRawResponse(
    sql: string,
    params?: Record<string, unknown>,
    headers?: Record<string, string>
  ): { response: Promise<Response>; abortController: AbortController } {
    if (!this.host || !this.path) {
      throw new QueryError(
        `Connection not properly initialized. Host: ${this.host}, Path: ${this.path}`
      );
    }

    const [replacedSql] = this.resolveClusterTemplates(sql);
    sql = replacedSql;

    const requestHeaders: Record<string, string> = headers || {};
    if (!requestHeaders["Content-Type"]) {
      requestHeaders["Content-Type"] = "text/plain";
    }

    const queryParameters: Record<string, unknown> = Object.assign({}, this.userParams);
    if (params) {
      Object.assign(queryParameters, params);
    }
    if (!queryParameters["default_format"]) {
      queryParameters["default_format"] = "JSONCompact";
    }

    const url = new URL(this.path, this.host);
    Object.entries(queryParameters).forEach(([key, value]) => {
      if (value !== undefined && value !== null) {
        url.searchParams.append(key, String(value));
      }
    });

    const basicAuth = btoa(`${this.user}:${this.password || ""}`);
    requestHeaders["Authorization"] = `Basic ${basicAuth}`;

    const abortController = new AbortController();

    const response = (async (): Promise<Response> => {
      const fetchUrl = url.toString();
      if (!fetchUrl || !(fetchUrl.startsWith("http://") || fetchUrl.startsWith("https://"))) {
        throw new QueryError(
          `Invalid URL: ${fetchUrl}. Connection may not be properly initialized.`
        );
      }

      const res = await fetch(fetchUrl, {
        method: "POST",
        headers: requestHeaders,
        body: sql,
        signal: abortController.signal,
      });

      if (!res.ok) {
        const errorText = await res.text();
        const clickHouseErrorCode = res.headers.get("x-clickhouse-exception-code");
        throw new QueryError(
          clickHouseErrorCode
            ? `Failed to execute query, got ClickHouse Exception Code: ${clickHouseErrorCode}`
            : `Failed to execute query, got HTTP status ${res.status} ${res.statusText} from server`,
          res.status,
          Object.fromEntries(res.headers.entries()),
          errorText
        );
      }

      return res;
    })();

    return { response, abortController };
  }

  public queryOnNode(
    sql: string,
    params?: Record<string, unknown>,
    headers?: Record<string, string>
  ): { response: Promise<QueryResponse>; abortController: AbortController } {
    const node = this.metadata.remoteHostName;

    if (node === undefined) {
      // Fallback to query on any node
      return this.query(sql, params, headers);
    }

    // Apply cluster template replacements
    const [processedSql, hasClusterFunctions] = this.resolveClusterTemplates(sql);
    if (hasClusterFunctions) {
      if (!this.metadata.is_readonly_skip_unavailable_shards) {
        params = {
          ...params,

          // For cluster query, skip unavailable shard by default
          skip_unavailable_shards: 1,
        };
      }

      // Since cluster/clusterAllReplica is used, don't use remote function to execute this sql
      return this.query(processedSql, params, headers);
    }

    return this.query(
      `
SELECT * FROM remote(
  '${node}', 
  view(
        ${processedSql}
  ), 
  '${this.metadata.internalUser}', 
  '${this.password}')`,
      params,
      headers
    );
  }

  /**
   * Process cluster template variables in SQL query.
   * Templates:
   * - {clusterAllReplicas:table} -> clusterAllReplicas('{cluster}', table) or table
   * - {cluster:table} -> cluster('{cluster}', table) or table
   * - {table:table} -> table
   * - {cluster} -> actual cluster name (simple variable, no colon)
   *
   * @returns [processedSql, hasClusterFunctions] - The processed SQL and whether cluster functions were added
   */
  private resolveClusterTemplates(sql: string): [string, boolean] {
    const hasCluster = this.cluster && this.cluster.length > 0;
    let usedClusterFunctions = false;

    // Replace {clusterAllReplicas:table_name} patterns
    sql = sql.replace(/\{clusterAllReplicas:([^}]+)\}/g, (_match, tableName) => {
      if (hasCluster) {
        usedClusterFunctions = true;
        return `clusterAllReplicas('{cluster}', ${tableName})`;
      }
      return tableName;
    });

    // Replace {cluster:table_name} patterns (note: different from simple {cluster})
    sql = sql.replace(/\{cluster:([^}]+)\}/g, (_match, tableName) => {
      if (hasCluster) {
        usedClusterFunctions = true;
        return `cluster('{cluster}', ${tableName})`;
      }
      return tableName;
    });

    // Replace {table:table_name} patterns (no cluster wrapping)
    sql = sql.replace(/\{table:([^}]+)\}/g, (_match, tableName) => {
      return tableName;
    });

    // Replace {cluster} with actual cluster name (simple variable without colon)
    if (hasCluster) {
      sql = sql.replace(/\{cluster\}/g, this.cluster);
    }

    return [sql, usedClusterFunctions];
  }
}
