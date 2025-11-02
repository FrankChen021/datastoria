import type { AxiosInstance, AxiosRequestConfig } from 'axios';
import axios from 'axios';
import type { Connection } from './connection/Connection';

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
      console.log('Cancel api...');
      this.abortController.abort();
    }
  }
}

export class Api {
  private instance: AxiosInstance;
  private readonly path: string;
  private readonly userParams: Record<string, unknown>;

  public constructor(connection: Connection) {
    const connectionRuntime = connection.runtime as ConnectionRuntime;

    this.path = connectionRuntime.path;
    this.userParams = connectionRuntime.userParams;

    const config: AxiosRequestConfig = {
      baseURL: connectionRuntime.host,
      auth: {
        username: Api.getConnectionUser(connection),
        password: connection.password as string,
      },
    };

    this.instance = axios.create(config);
  }

  static create(connection: Connection): Api {
    return new Api(connection);
  }

  private static getConnectionUser(connection: Connection): string {
    return connection.cluster.length > 0
      ? `${connection.user}-${connection.cluster}`
      : connection.user;
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
    if (!sql.headers['Content-Type']) {
      sql.headers['Content-Type'] = 'text/plain';
    }

    // Merge user params with request params (request params take precedence)
    const params: Record<string, unknown> = Object.assign({}, this.userParams);
    if (sql.params) {
      Object.assign(params, sql.params);
    }
    // Add default format if not specified
    if (!params['default_format']) {
      params['default_format'] = 'JSONCompact';
    }

    const maxExecutionTime = params['max_execution_time'];
    const timeout = (typeof maxExecutionTime === 'number' ? maxExecutionTime : 60) * 1000;

    const apiCanceller = new ApiCancellerImpl(new AbortController());

    console.log('API request config:', {
      url: this.path,
      method: 'post',
      baseURL: this.instance.defaults.baseURL,
      headers: sql.headers,
      params: params,
    });

    this.instance
      .request({
        url: this.path,
        method: 'post',
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
}
