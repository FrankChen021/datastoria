import React, { createContext, useContext, useEffect, useState } from 'react';
import type { Connection } from './Connection';
import { ConnectionManager } from './ConnectionManager';
import { ensureConnectionRuntimeInitialized } from './Connection';

interface ConnectionContextType {
  selectedConnection: Connection | null;
  setSelectedConnection: (conn: Connection | null) => void;
}

const ConnectionContext = createContext<ConnectionContextType>({
  selectedConnection: null,
  setSelectedConnection: () => {
    console.warn('setSelectedConnection not implemented');
  },
});

export function ConnectionProvider({ children }: { children: React.ReactNode }) {
  const [selectedConnection, setSelectedConnectionState] = useState<Connection | null>(null);

  // Load connection on mount
  useEffect(() => {
    const savedConnection = ConnectionManager.getInstance().getLastSelectedOrFirst();
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
    } else {
      setSelectedConnectionState(null);
      ConnectionManager.getInstance().saveLastSelected(undefined);
    }
  };

  return (
    <ConnectionContext.Provider value={{ selectedConnection, setSelectedConnection }}>
      {children}
    </ConnectionContext.Provider>
  );
}

export const useConnection = () => useContext(ConnectionContext);
