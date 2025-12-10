import React, { createContext, useContext, useEffect, useState } from "react";
import { Api } from "../api";
import type { Connection } from "./Connection";
import { ensureConnectionRuntimeInitialized } from "./Connection";
import { ConnectionManager } from "./ConnectionManager";

interface ConnectionContextType {
  selectedConnection: Connection | null;
  setSelectedConnection: (conn: Connection | null) => void;
  hasAnyConnections: boolean;
}

export const ConnectionContext = createContext<ConnectionContextType>({
  selectedConnection: null,
  setSelectedConnection: () => {
    // Default implementation - will be overridden by provider
  },
  hasAnyConnections: false,
});

async function initializeConnection(conn: Connection) {
  conn = ensureConnectionRuntimeInitialized(conn);

  if (conn.cluster.length > 0 && conn.runtime?.targetNode === undefined) {
    // for cluster mode, pick a node as target node for further SQL execution
    const api = Api.create(conn!);
    const { response } = api.executeAsync("SELECT currentUser()", { default_format: "JSONCompact" });
    const apiResponse = await response;
    if (apiResponse.httpStatus === 200) {
      const returnServer = apiResponse.httpHeaders["x-clickhouse-server-display-name"];
      conn.runtime!.targetNode = returnServer;

      conn.runtime!.internalUser = apiResponse.data.data[0][0];
    }
  }

  return conn;
}

export function ConnectionProvider({ children }: { children: React.ReactNode }) {
  const [selectedConnection, setSelectedConnectionState] = useState<Connection | null>(null);
  const [hasAnyConnections, setHasAnyConnections] = useState<boolean>(false);

  // Load connection on mount
  useEffect(() => {
    const savedConnection = ConnectionManager.getInstance().getLastSelectedOrFirst();
    const connections = ConnectionManager.getInstance().getConnections();
    setHasAnyConnections(connections.length > 0);

    if (savedConnection) {
      (async () => {
        const initialized = await initializeConnection(savedConnection);
        setSelectedConnectionState(initialized);
      })();
    }
  }, []);

  const setSelectedConnection = async (conn: Connection | null) => {
    if (conn !== null) {
      conn = await initializeConnection(conn);

      setSelectedConnectionState(conn);
      // Save the selected connection name
      ConnectionManager.getInstance().saveLastSelected(conn?.name);

      // Update hasAnyConnections when a connection is set
      setHasAnyConnections(true);
    } else {
      setSelectedConnectionState(null);
      ConnectionManager.getInstance().saveLastSelected(undefined);
      // Check if there are still other connections available
      const connections = ConnectionManager.getInstance().getConnections();
      setHasAnyConnections(connections.length > 0);
    }
  };

  return (
    <ConnectionContext.Provider value={{ selectedConnection, setSelectedConnection, hasAnyConnections }}>
      {children}
    </ConnectionContext.Provider>
  );
}

export const useConnection = () => useContext(ConnectionContext);
