export interface ConnectionRuntime {
  host: string;
  path: string;
  userParams: Record<string, unknown>;

  // Target ClickHouse node to execute SQLs
  targetNode?: string;

  // Internal user for remote function execution
  internalUser: string;

  // Capability
  function_table_has_description_column: boolean;
}
export interface Connection {
  name: string;
  url: string;
  user: string;
  password: string;
  cluster: string;
  editable: boolean;

  // Allow to set runtime properties
  runtime?: ConnectionRuntime;
}

export function ensureConnectionRuntimeInitialized(conn: Connection): Connection {
  if (conn.runtime === undefined || conn.runtime === null) {
    const url = new URL(conn.url);

    const userParams: Record<string, unknown> = {};
    url.searchParams.forEach((val, key) => {
      userParams[key] = val;
    });
    if (userParams["max_execution_time"] !== undefined) {
      // Convert into a number
      const maxExecTime = userParams["max_execution_time"];
      if (typeof maxExecTime === "string") {
        userParams["max_execution_time"] = parseInt(maxExecTime, 10);
      }
    }

    // Cache the runtime object
    conn.runtime = {
      host: url.origin,
      path: url.pathname === "" ? "/" : url.pathname,
      userParams: userParams,

      // Default to external configured user
      internalUser: conn.user
    } as ConnectionRuntime;
  }
  return conn;
}
