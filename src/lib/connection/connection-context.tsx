import { Connection, type ConnectionMetadata } from "@/lib/connection/connection";
import type { ConnectionConfig } from "@/lib/connection/connection-config";
import { ConnectionManager } from "@/lib/connection/connection-manager";
import React, { createContext, useContext, useEffect, useState } from "react";

interface ConnectionContextType {
  isReady: boolean;
  setIsReady: (ready: boolean) => void;
  connection: Connection | null;
  isInitialized: boolean;
  switchConnection: (conn: ConnectionConfig | null) => void;
  updateConnection: (metadata: Partial<ConnectionMetadata>) => void;
}

export const ConnectionContext = createContext<ConnectionContextType>({
  isReady: false,
  setIsReady: () => {
    // Default implementation
  },
  connection: null,
  isInitialized: false,
  switchConnection: () => {
    // Default implementation
  },
  updateConnection: () => {
    // Default implementation
  },
});

export function ConnectionProvider({ children }: { children: React.ReactNode }) {
  const [isReady, setIsReady] = useState<boolean>(false);
  const [isInitialized, setIsInitialized] = useState(false);
  const [connection, setConnection] = useState<Connection | null>(null);

  // Mount effect - load connection on client side
  useEffect(() => {
    setIsInitialized(true);

    const manager = ConnectionManager.getInstance();
    const savedConnection = manager.getLastSelectedOrFirst();
    if (savedConnection) {
      setConnection(Connection.create(savedConnection));
    }
  }, []);

  const switchConnection = (config: ConnectionConfig | null) => {
    const manager = ConnectionManager.getInstance();

    if (config) {
      // 1. Save selection
      manager.saveLastSelected(config.name);
      // 2. Derive runtime
      const conn = Connection.create(config);
      setConnection(conn);
      // 3. Reset ready state (MainPage will handle initialization)
      setIsReady(false);
    } else {
      manager.saveLastSelected(undefined);
      setConnection(null);
      setIsReady(false); // No connection means not ready
    }
  };

  const updateConnection = (metadataUpdates: Partial<ConnectionMetadata>) => {
    setConnection((prev) => {
      if (!prev) return null;
      // Since Connection is a class, we need to be careful about immutability if we are spreading.
      // However, Connection class methods are on the prototype.
      // Spreading {...prev, ...updates} will lose the prototype chain if not careful,
      // but Object.assign or spread on a class instance creates a plain object in some contexts if not handled right?
      // Actually, React state updates usually expect new objects.
      // Ideally we should clone the connection.
      // For now, let's assume we can create a new object with prototype.
      const newConn = Object.create(Object.getPrototypeOf(prev));
      Object.assign(newConn, prev);
      // Update the metadata property
      // Handle Map and Set merging specially
      const mergedMetadata: ConnectionMetadata = { ...prev.metadata, ...metadataUpdates };
      
      // Merge tableNames Map if both exist
      if (metadataUpdates.tableNames && prev.metadata.tableNames) {
        const mergedTableNames = new Map(prev.metadata.tableNames);
        for (const [key, value] of metadataUpdates.tableNames) {
          mergedTableNames.set(key, value);
        }
        mergedMetadata.tableNames = mergedTableNames;
      }
      
      // Merge databaseNames Map if both exist
      if (metadataUpdates.databaseNames && prev.metadata.databaseNames) {
        const mergedDatabaseNames = new Map(prev.metadata.databaseNames);
        for (const [key, value] of metadataUpdates.databaseNames) {
          mergedDatabaseNames.set(key, value);
        }
        mergedMetadata.databaseNames = mergedDatabaseNames;
      }
      
      newConn.metadata = mergedMetadata;
      return newConn;
    });
  };

  return (
    <ConnectionContext.Provider
      value={{
        isReady,
        setIsReady,
        connection,
        isInitialized,
        switchConnection,
        updateConnection,
      }}
    >
      {children}
    </ConnectionContext.Provider>
  );
}

export const useConnection = () => useContext(ConnectionContext);
