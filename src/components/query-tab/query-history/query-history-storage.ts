"use client";

import { StorageManager } from "@/lib/storage/storage-provider-manager";

export const MAX_QUERY_HISTORY_SIZE = 100;
const QUERY_HISTORY_STORAGE_KEY = "history";
export const QUERY_HISTORY_UPDATED_EVENT = "query-history-updated";

export interface QueryHistoryEntry {
  id: string;
  sql: string;
  rawSQL: string;
  timestamp: number;
  connectionId: string;
  connectionName: string;
}

function getHistoryStorage() {
  return StorageManager.getInstance()
    .getStorageProvider()
    .subStorage("query")
    .withCompression(true);
}

function loadQueryHistory(): QueryHistoryEntry[] {
  return getHistoryStorage().getChildAsJSON<QueryHistoryEntry[]>(
    QUERY_HISTORY_STORAGE_KEY,
    () => []
  );
}

function saveQueryHistory(entries: QueryHistoryEntry[]) {
  getHistoryStorage().setChildJSON(QUERY_HISTORY_STORAGE_KEY, entries);
}

function notifyQueryHistoryUpdated() {
  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent(QUERY_HISTORY_UPDATED_EVENT));
  }
}

function normalizeQueryHistory(entries: QueryHistoryEntry[]): QueryHistoryEntry[] {
  return entries
    .filter((entry) => entry.sql.trim().length > 0)
    .sort((left, right) => right.timestamp - left.timestamp)
    .slice(0, MAX_QUERY_HISTORY_SIZE);
}

export class QueryHistoryStorage {
  static list(): QueryHistoryEntry[] {
    return normalizeQueryHistory(loadQueryHistory());
  }

  static add(
    entry: Omit<QueryHistoryEntry, "id"> & {
      id?: string;
    }
  ): QueryHistoryEntry[] {
    const current = loadQueryHistory();
    const nextEntry: QueryHistoryEntry = {
      id: entry.id ?? globalThis.crypto?.randomUUID?.() ?? `${entry.timestamp}-${Math.random()}`,
      ...entry,
    };

    const deduped = current.filter(
      (item) => !(item.connectionId === nextEntry.connectionId && item.sql === nextEntry.sql)
    );
    const next = normalizeQueryHistory([nextEntry, ...deduped]);
    saveQueryHistory(next);
    notifyQueryHistoryUpdated();
    return next;
  }

  static remove(id: string): QueryHistoryEntry[] {
    const next = loadQueryHistory().filter((entry) => entry.id !== id);
    saveQueryHistory(next);
    notifyQueryHistoryUpdated();
    return normalizeQueryHistory(next);
  }

  static clear(): QueryHistoryEntry[] {
    getHistoryStorage().removeChild(QUERY_HISTORY_STORAGE_KEY);
    notifyQueryHistoryUpdated();
    return [];
  }
}
