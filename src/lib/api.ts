import type { AxiosInstance, AxiosRequestConfig } from "axios";
import axios from "axios";
import type { Connection } from "./connection/Connection";

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

interface ConnectionRuntime {
  host: string;
  path: string;
  userParams: Record<string, unknown>;
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

export class Api {
  private instance: AxiosInstance;
  private readonly path: string;
  private readonly host: string;
  private readonly username: string;
  private readonly password: string;
  private readonly userParams: Record<string, unknown>;

  public constructor(connection: Connection) {
    const connectionRuntime = connection.runtime as ConnectionRuntime;

    this.path = connectionRuntime.path;
    this.host = connectionRuntime.host;
    this.userParams = connectionRuntime.userParams;
    this.username = Api.getConnectionUser(connection);
    this.password = connection.password as string;

    const config: AxiosRequestConfig = {
      baseURL: connectionRuntime.host,
      auth: {
        username: this.username,
        password: this.password,
      },
    };

    this.instance = axios.create(config);
  }

  static create(connection: Connection): Api {
    return new Api(connection);
  }

  private static getConnectionUser(connection: Connection): string {
    return connection.user;
    //return connection.cluster.length > 0 ? `${connection.user}-${connection.cluster}` : connection.user;
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

  public async executeAsync(
    sql: { sql: string; headers?: Record<string, string>; params?: Record<string, unknown> },
    abortSignal?: AbortSignal
  ): Promise<ApiResponse> {
    const headers: Record<string, string> = sql.headers || {};

    // Set default ClickHouse headers if not provided
    if (!headers["Content-Type"]) {
      headers["Content-Type"] = "text/plain";
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

    // Build URL with query parameters
    const url = new URL(this.path, this.host);
    Object.entries(params).forEach(([key, value]) => {
      if (value !== undefined && value !== null) {
        url.searchParams.append(key, String(value));
      }
    });

    // Build Basic Auth header
    const basicAuth = btoa(`${this.username}:${this.password}`);
    headers["Authorization"] = `Basic ${basicAuth}`;

    // Create timeout controller
    const timeoutController = new AbortController();
    const timeoutId = setTimeout(() => {
      timeoutController.abort();
    }, timeout);

    // Combine abort signals - if external signal provided, create a combined controller
    let combinedSignal: AbortSignal;
    if (abortSignal) {
      const combined = new AbortController();
      abortSignal.addEventListener("abort", () => combined.abort());
      timeoutController.signal.addEventListener("abort", () => combined.abort());
      combinedSignal = combined.signal;
    } else {
      combinedSignal = timeoutController.signal;
    }

    try {
      const response = await fetch(url.toString(), {
        method: "POST",
        headers: headers,
        body: sql.sql,
        signal: combinedSignal,
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
  }
}
