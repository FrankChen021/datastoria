"use client";

import { StorageManager } from "@/lib/storage/storage-provider-manager";
import type { QueryHistoryEntry, QueryHistoryStorage } from "./query-history-storage";

const QUERY_HISTORY_STORAGE_KEY = "history";

export class QueryHistoryLocalStorage implements QueryHistoryStorage {
  private getHistoryStorage() {
    return StorageManager.getInstance()
      .getStorageProvider()
      .subStorage("query")
      .withCompression(true);
  }

  load(): QueryHistoryEntry[] {
    return this.getHistoryStorage().getChildAsJSON<QueryHistoryEntry[]>(
      QUERY_HISTORY_STORAGE_KEY,
      () => []
    );
  }

  save(entries: QueryHistoryEntry[]): void {
    this.getHistoryStorage().setChildJSON(QUERY_HISTORY_STORAGE_KEY, entries);
  }

  clear(): void {
    this.getHistoryStorage().removeChild(QUERY_HISTORY_STORAGE_KEY);
  }
}
