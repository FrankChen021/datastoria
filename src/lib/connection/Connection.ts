import type { AxiosInstance, AxiosRequestConfig } from "axios";
import axios from "axios";
import type { ConnectionConfig } from "./connection-config";

// Re-export ConnectionConfig for convenience
export type { ConnectionConfig };

export interface ApiErrorResponse {
  errorMessage: string;
  httpStatus?: number;
  httpHeaders?: any;
  data: any;
}

export interface ApiResponse {
  httpStatus: number;
  httpHeaders: any;
  data: any;
}

export interface ApiCanceller {
  cancel: () => void;
}

class ApiCancellerImpl implements ApiCanceller {
  abortController: AbortController | undefined;

  constructor(abortController: AbortController) {
    this.abortController = abortController;
  }

  public cancel() {
    if (this.abortController !== undefined) {
      this.abortController.abort();
    }
  }
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

  // Target ClickHouse node to execute SQLs
  targetNode?: string;

  // Internal user for remote function execution
  readonly internalUser: string;

  // Capability
  function_table_has_description_column: boolean = false;

  // HTTP Client
  private instance: AxiosInstance;

  private constructor(config: ConnectionConfig) {
    this.name = config.name;
    this.url = config.url;
    this.user = config.user;
    this.password = config.password;
    this.cluster = config.cluster;
    this.internalUser = config.user; // Default to external configured user

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

    // Initialize Axios
    const axiosConfig: AxiosRequestConfig = {
      baseURL: this.host,
      auth: {
        username: this.user,
        password: this.password || "",
      },
    };
    this.instance = axios.create(axiosConfig);
  }

  static create(config: ConnectionConfig): Connection {
    return new Connection(config);
  }

  public executeSQL(
    sql: { sql: string; headers?: Record<string, string>; params?: Record<string, unknown> },
    onResponse: (response: ApiResponse) => void,
    onError: (response: ApiErrorResponse) => void,
    onFinal?: () => void
  ): ApiCanceller {
    if (sql.headers === undefined) {
      sql.headers = {};
    }

    // Set default ClickHouse headers if not provided
    if (!sql.headers["Content-Type"]) {
      sql.headers["Content-Type"] = "text/plain";
    }

    // Merge user params with request params (request params take precedence)
    const params: Record<string, unknown> = Object.assign({}, this.userParams);
    if (sql.params) {
      Object.assign(params, sql.params);
    }
    // Add default format if not specified
    if (!params["default_format"]) {
      params["default_format"] = "JSONCompact";
    }

    const maxExecutionTime = params["max_execution_time"];
    const timeout = (typeof maxExecutionTime === "number" ? maxExecutionTime : 60) * 1000;

    const apiCanceller = new ApiCancellerImpl(new AbortController());

    this.instance
      .request({
        url: this.path,
        method: "post",
        data: sql.sql,
        headers: sql.headers,
        params: params,
        signal: apiCanceller.abortController?.signal,
        timeout: timeout,
        timeoutErrorMessage: `${timeout / 1000}s timeout to wait for response from ClickHouse server.`,
      })
      .then((response) => {
        onResponse({
          httpStatus: response.status,
          httpHeaders: response.headers,
          data: response.data,
        });
      })
      .catch((error) => {
        onError({
          errorMessage: error.message,
          httpHeaders: error.response?.headers,
          httpStatus: error.response?.status,
          data: error.response?.data,
        });
      })
      .finally(() => {
        apiCanceller.abortController = undefined;
        if (onFinal !== undefined && onFinal !== null) {
          onFinal();
        }
      });

    return apiCanceller;
  }

  public executeAsync(
    sql: string,
    params?: Record<string, unknown>,
    headers?: Record<string, string>
  ): { response: Promise<ApiResponse>; abortController: AbortController } {
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
    const timeoutId = setTimeout(() => {
      timeoutController.abort();
    }, timeout);

    // Combine abort signals - create a combined controller
    const combined = new AbortController();
    abortController.signal.addEventListener("abort", () => combined.abort());
    timeoutController.signal.addEventListener("abort", () => combined.abort());

    const response = (async (): Promise<ApiResponse> => {
      try {
        const response = await fetch(url.toString(), {
          method: "POST",
          headers: requestHeaders,
          body: sql,
          signal: combined.signal,
        });

        clearTimeout(timeoutId);

        // Read response body as text first (can only be read once)
        const responseText = await response.text();

        if (!response.ok) {
          const error: ApiErrorResponse = {
            errorMessage: `Error executing query, got HTTP status ${response.status} ${response.statusText} from server`,
            httpStatus: response.status,
            httpHeaders: Object.fromEntries(response.headers.entries()),
            data: responseText,
          };
          throw error;
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

        // If it's already an ApiErrorResponse, re-throw it
        if (error && typeof error === "object" && "errorMessage" in error) {
          throw error;
        }

        if (error instanceof Error && error.name === "AbortError") {
          if (timeoutController.signal.aborted) {
            const timeoutError: ApiErrorResponse = {
              errorMessage: `${timeout / 1000}s timeout to wait for response from ClickHouse server.`,
              httpStatus: undefined,
              httpHeaders: undefined,
              data: undefined,
            };
            throw timeoutError;
          }
          const abortError: ApiErrorResponse = {
            errorMessage: error.message || "Request aborted",
            httpStatus: undefined,
            httpHeaders: undefined,
            data: undefined,
          };
          throw abortError;
        }

        // Re-throw as ApiErrorResponse-like error
        const errorMessage = error instanceof Error ? error.message : "Unknown error";
        const genericError: ApiErrorResponse = {
          errorMessage,
          httpStatus: undefined,
          httpHeaders: undefined,
          data: undefined,
        };
        throw genericError;
      }
    })();

    return { response, abortController };
  }

  public executeAsyncOnNode(
    node: string | undefined,
    sql: string,
    params?: Record<string, unknown>,
    headers?: Record<string, string>
  ): { response: Promise<ApiResponse>; abortController: AbortController } {
    if (node === undefined) {
      return this.executeAsync(sql, params, headers);
    }

    if (this.cluster && this.cluster.length > 0 && sql.includes("{cluster}")) {
      // Do replacement
      sql = sql.replaceAll("{cluster}", this.cluster);

      // Since cluster/clusterAllReplica is used, don't use remote function to execute this sql
      return this.executeAsync(sql, params, headers);
    }

    return this.executeAsync(
      `
SELECT * FROM remote(
  '${node}', 
  view(
        ${sql}
  ), 
  '${this.internalUser}', 
  '${this.password}')`,
      params,
      headers
    );
  }
}
