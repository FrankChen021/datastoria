import type { ConnectionConfig } from "./connection-config";

export function getAuthUser(user: string, _password?: string, _cluster?: string): string {
  return user;
}

export function loadFromLegacyStorage(): ConnectionConfig[] {
  return [];
}
