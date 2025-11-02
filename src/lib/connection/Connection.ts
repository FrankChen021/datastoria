export interface Connection {
  name: string;
  url: string;
  user: string;
  password: string;
  cluster: string;
  editable: boolean;

  // Allow to set runtime properties
  runtime?: any;
}

export function ensureConnectionRuntimeInitialized(conn: Connection | null): Connection | null {
  if (conn != null && (conn.runtime === undefined || conn.runtime === null)) {
    try {
      const url = new URL(conn.url);

      const userParams: Record<string, unknown> = {};
      url.searchParams.forEach((val, key) => {
        userParams[key] = val;
      });
      if (userParams['max_execution_time'] !== undefined) {
        // Convert into a number
        const maxExecTime = userParams['max_execution_time'];
        if (typeof maxExecTime === 'string') {
          userParams['max_execution_time'] = parseInt(maxExecTime, 10);
        }
      }

      // Cache the runtime object
      conn.runtime = {
        host: url.origin,
        path: url.pathname === '' ? '/' : url.pathname,
        userParams: userParams,
      };
      
      console.log('Connection runtime initialized:', conn.runtime);
    } catch (error) {
      console.error('Failed to initialize connection runtime:', error);
      return null;
    }
  }
  return conn;
}
