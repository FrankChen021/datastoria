import React, { createContext, useContext, useEffect, useState } from 'react';
import type { Connection } from './Connection';
import { ConnectionManager } from './ConnectionManager';
import { ensureConnectionRuntimeInitialized } from './Connection';

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

export function ConnectionProvider({ children }: { children: React.ReactNode }) {
  const [selectedConnection, setSelectedConnectionState] = useState<Connection | null>(null);
  const [hasAnyConnections, setHasAnyConnections] = useState<boolean>(false);

  // Load connection on mount
  useEffect(() => {
    const savedConnection = ConnectionManager.getInstance().getLastSelectedOrFirst();
    const connections = ConnectionManager.getInstance().getConnections();
    setHasAnyConnections(connections.length > 0);

    if (savedConnection) {
      const initialized = ensureConnectionRuntimeInitialized(savedConnection);
      setSelectedConnectionState(initialized);
    }
  }, []);

  const setSelectedConnection = (conn: Connection | null) => {
    if (conn) {
      const initialized = ensureConnectionRuntimeInitialized(conn);
      setSelectedConnectionState(initialized);
      // Save the selected connection name
      ConnectionManager.getInstance().saveLastSelected(initialized?.name);
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
