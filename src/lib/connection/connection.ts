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

export interface Session {
  targetNode?: string;
  internalUser: string;
  timezone: string;
  function_table_has_description_column?: boolean;
}

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

  // Session information
  session: Session;

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

    // Initialize session with defaults
    this.session = {
      internalUser: config.user, // Default to external configured user
      timezone: "UTC", // Default timezone
      function_table_has_description_column: false,
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

    const maxExecutionTime = requestParams["max_execution_time"];
    const timeout = (typeof maxExecutionTime === "number" ? maxExecutionTime : 60) * 1000;

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

    // Create timeout controller
    const timeoutController = new AbortController();
    
    // Track which signal aborted (for error messages and abort reason)
    let abortReason: string | undefined;
    
    // Helper to abort with reason if supported
    const abortWithReason = (controller: AbortController, reason: string) => {
      abortReason = reason;
      // Try to use reason parameter if supported (modern browsers/Node.js)
      try {
        // TypeScript doesn't know about the reason parameter yet, so we cast
        (controller.abort as (reason?: unknown) => void)(reason);
      } catch {
        // Fallback for environments that don't support reason parameter
        controller.abort();
      }
    };
    
    const timeoutId = setTimeout(() => {
      abortWithReason(timeoutController, "timeout");
    }, timeout);

    // Combine abort signals - create a combined controller
    const combined = new AbortController();
    abortController.signal.addEventListener("abort", () => {
      // Always set reason before aborting
      const reason = "user_cancelled";
      abortReason = reason;
      abortWithReason(combined, reason);
    });
    timeoutController.signal.addEventListener("abort", () => {
      // Always set reason before aborting
      const reason = "timeout";
      abortReason = reason;
      abortWithReason(combined, reason);
    });

    const response = (async (): Promise<QueryResponse> => {
      try {
        const fetchUrl = url.toString();
        
        // Validate URL before making request
        if (!fetchUrl || !(fetchUrl.startsWith('http://') || fetchUrl.startsWith('https://'))) {
          throw new QueryError(`Invalid URL: ${fetchUrl}. Connection may not be properly initialized.`);
        }
        
        const response = await fetch(fetchUrl, {
          method: "POST",
          headers: requestHeaders,
          body: sql,
          signal: combined.signal,
        });

        clearTimeout(timeoutId);

        // Read response body as text first (can only be read once)
        const responseText = await response.text();

        if (!response.ok) {
          throw new QueryError(
            `Error executing query, got HTTP status ${response.status} ${response.statusText} from server`,
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
        clearTimeout(timeoutId);

        // If it's already an QueryError, re-throw it
        if (error instanceof QueryError) {
          throw error;
        }

        // Handle abort errors (can be Error with name "AbortError" or DOMException)
        if (
          (error instanceof Error && error.name === "AbortError") ||
          (error instanceof DOMException && error.name === "AbortError")
        ) {
          // Check which signal actually caused the abort by checking their states
          // This is more reliable than relying on abortReason variable
          const isTimeout = timeoutController.signal.aborted;
          const isUserCancelled = abortController.signal.aborted && !isTimeout;
          
          // Determine the reason from signal states or tracked reason
          let reason: string;
          if (isTimeout) {
            reason = "timeout";
          } else if (isUserCancelled) {
            reason = "user_cancelled";
          } else {
            // Fallback to tracked reason or check signal reason if available
            reason = abortReason || (combined.signal as { reason?: string }).reason || "unknown";
          }
          
          console.debug("Abort detected:", {
            isTimeout,
            isUserCancelled,
            abortReason,
            errorMessage: error.message,
            determinedReason: reason,
          });
          
          // Provide appropriate error message based on the reason
          if (reason === "timeout" || isTimeout) {
            throw new QueryError(`${timeout / 1000}s timeout to wait for response from ClickHouse server.`);
          }
          if (reason === "user_cancelled" || isUserCancelled) {
            throw new QueryError("Request was cancelled by user");
          }
          
          // For any other abort reason, provide a descriptive message
          const errorMsg = error.message || "Request aborted";
          // Always replace "without reason" messages with our tracked reason
          // Also provide a clear message even if the original doesn't mention "without reason"
          if (errorMsg.includes("without reason") || reason !== "unknown") {
            throw new QueryError(`Request aborted: ${reason}`);
          }
          // Fallback: use the original error message if we can't determine the reason
          throw new QueryError(errorMsg);
        }

        // Re-throw as QueryError-like error
        const errorMessage = error instanceof Error ? error.message : "Unknown error";
        if (errorMessage === "Failed to fetch") {
          // This could be CORS, network error, or invalid URL
          const errorDetails = `Failed to connect to ${this.host}${this.path}. ` +
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
    const node = this.session.targetNode;

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
  '${this.session.internalUser}', 
  '${this.password}')`,
      params,
      headers
    );
  }
}
