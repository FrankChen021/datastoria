import type { ConnectionConfig } from "./connection-config";

export function getAuthUser(user: string, _password?: string, _cluster?: string): string {
  return user;
}

export interface LegacyStorageData {
  connections: ConnectionConfig[];
  selectedConnectionName: string | null;
}

export function loadFromLegacyStorage(): LegacyStorageData {
  return {
    connections: [],
    selectedConnectionName: null,
  };
}
