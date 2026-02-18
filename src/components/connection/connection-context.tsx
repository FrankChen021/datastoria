import { Connection, type ConnectionMetadata } from "@/lib/connection/connection";
import type { ConnectionConfig } from "@/lib/connection/connection-config";
import { ConnectionManager } from "@/lib/connection/connection-manager";
import { StorageManager } from "@/lib/storage/storage-provider-manager";
import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";

interface ConnectionContextType {
  isConnectionAvailable: boolean;
  setIsConnectionAvailable: (ready: boolean) => void;
  connection: Connection | null;
  pendingConfig: ConnectionConfig | null;
  isInitialized: boolean;
  switchConnection: (conn: ConnectionConfig | null) => void;
  updateConnectionMetadata: (metadata: Partial<ConnectionMetadata>) => void;
  commitConnection: (conn: Connection) => void;
}

export const ConnectionContext = createContext<ConnectionContextType>({
  isConnectionAvailable: false,
  setIsConnectionAvailable: () => {
    // Default implementation
  },
  connection: null,
  pendingConfig: null,
  isInitialized: false,
  switchConnection: () => {
    // Default implementation
  },
  updateConnectionMetadata: () => {
    // Default implementation
  },
  commitConnection: () => {
    // Default implementation
  },
});

export function ConnectionProvider({
  children,
  createConnectionFromPending,
}: {
  children: React.ReactNode;
  /** When true, creates Connection from pendingConfig on mount. Use for dialogs rendered outside the main app tree. */
  createConnectionFromPending?: boolean;
}) {
  const [isConnectionAvailable, setIsConnectionAvailable] = useState<boolean>(false);
  const [isInitialized, setIsInitialized] = useState(false);
  const [connection, setConnection] = useState<Connection | null>(null);
  const [pendingConfig, setPendingConfig] = useState<ConnectionConfig | null>(null);

  // Mount effect - load connection on client side
  useEffect(() => {
    setIsInitialized(true);

    const lastUsedConnection = ConnectionManager.getInstance().getLastSelectedOrFirst();
    if (lastUsedConnection) {
      setPendingConfig(lastUsedConnection);
      if (createConnectionFromPending) {
        setConnection(Connection.create(lastUsedConnection));
        setIsConnectionAvailable(true);
      }
      // Otherwise MainPage will handle initialization from pendingConfig
    }
  }, [createConnectionFromPending]);

  // When storage provider changes (e.g. session loads and we switch from <default> to user bucket),
  // re-read the initial connection so we show saved connections instead of always showing the wizard.
  useEffect(() => {
    const unsubscribe = StorageManager.getInstance().subscribeToStorageProviderChange(() => {
      if (connection !== null) return; // Keep current connection when switching storage
      const next = ConnectionManager.getInstance().getLastSelectedOrFirst();
      setPendingConfig(next ?? null);
    });
    return unsubscribe;
  }, [connection]);

  const switchConnection = useCallback((config: ConnectionConfig | null) => {
    const manager = ConnectionManager.getInstance();

    if (config) {
      // 1. Save selection
      manager.saveLastSelected(config.name);
      // 2. Set pending config
      setPendingConfig(config);

      // 3. Don't clear the connection which triggers all dependencies to be updated
      //setConnection(null);

      // 4. Reset ready state (MainPage will handle initialization)
      setIsConnectionAvailable(false);
    } else {
      manager.saveLastSelected(undefined);
      setPendingConfig(null);
      setConnection(null);
      setIsConnectionAvailable(false); // No connection means not ready
    }
  }, []);

  const commitConnection = useCallback((conn: Connection) => {
    setConnection(conn);
    setIsConnectionAvailable(true);
  }, []);

  const updateConnectionMetadata = useCallback(
    (metadataUpdates: Partial<ConnectionMetadata>) => {
      if (!connection) {
        return;
      }

      // Direct mutation of the existing connection object's metadata
      // We do NOT call setConnection with a new object.

      // Merge tableNames Map if both exist
      if (metadataUpdates.tableNames && connection.metadata.tableNames) {
        const mergedTableNames = connection.metadata.tableNames;
        for (const [key, value] of metadataUpdates.tableNames) {
          mergedTableNames.set(key, value);
        }
        // Since we mutated the map in place, we don't need to assign it back,
        // but to be safe and consistent with the rest of the logic:
        metadataUpdates.tableNames = mergedTableNames;
      }

      // Merge databaseNames Map if both exist
      if (metadataUpdates.databaseNames && connection.metadata.databaseNames) {
        const mergedDatabaseNames = connection.metadata.databaseNames;
        for (const [key, value] of metadataUpdates.databaseNames) {
          mergedDatabaseNames.set(key, value);
        }
        metadataUpdates.databaseNames = mergedDatabaseNames;
      }

      // Mutate the metadata in place
      Object.assign(connection.metadata, metadataUpdates);
    },
    [connection]
  );

  const contextValue = useMemo(
    () => ({
      isConnectionAvailable,
      setIsConnectionAvailable,
      connection,
      pendingConfig,
      isInitialized,
      switchConnection,
      updateConnectionMetadata,
      commitConnection,
    }),
    [
      isConnectionAvailable,
      connection,
      pendingConfig,
      isInitialized,
      switchConnection,
      updateConnectionMetadata,
      commitConnection,
    ]
  );

  return <ConnectionContext.Provider value={contextValue}>{children}</ConnectionContext.Provider>;
}

export const useConnection = () => useContext(ConnectionContext);
