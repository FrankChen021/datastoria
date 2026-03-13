"use client";

import { QueryHistoryLocalStorage } from "./query-history-local-storage";
import type { QueryHistoryEntry, QueryHistoryStorage } from "./query-history-storage";

export const MAX_QUERY_HISTORY_SIZE = 100;
export const QUERY_HISTORY_UPDATED_EVENT = "query-history-updated";

function notifyQueryHistoryUpdated() {
  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent(QUERY_HISTORY_UPDATED_EVENT));
  }
}

function normalizeQueryHistory(entries: QueryHistoryEntry[]): QueryHistoryEntry[] {
  return entries
    .filter((entry) => entry.rawSQL.trim().length > 0)
    .sort((left, right) => right.timestamp - left.timestamp)
    .slice(0, MAX_QUERY_HISTORY_SIZE);
}

export class QueryHistoryManager {
  private entries: QueryHistoryEntry[];
  private readonly storage: QueryHistoryStorage;

  constructor(storage: QueryHistoryStorage = new QueryHistoryLocalStorage()) {
    this.storage = storage;
    this.entries = normalizeQueryHistory(this.storage.load());
  }

  list(): QueryHistoryEntry[] {
    return [...this.entries];
  }

  addListener(listener: EventListener): void {
    if (typeof window === "undefined") {
      return;
    }
    window.addEventListener(QUERY_HISTORY_UPDATED_EVENT, listener);
  }

  removeListener(listener: EventListener): void {
    if (typeof window === "undefined") {
      return;
    }
    window.removeEventListener(QUERY_HISTORY_UPDATED_EVENT, listener);
  }

  add(
    entry: Omit<QueryHistoryEntry, "id"> & {
      id?: string;
    }
  ): QueryHistoryEntry[] {
    const nextEntry: QueryHistoryEntry = {
      id: entry.id ?? globalThis.crypto?.randomUUID?.() ?? `${entry.timestamp}-${Math.random()}`,
      ...entry,
    };

    const deduped = this.entries.filter((item) => item.rawSQL !== nextEntry.rawSQL);
    this.entries = normalizeQueryHistory([nextEntry, ...deduped]);
    this.storage.save(this.entries);
    notifyQueryHistoryUpdated();
    return this.list();
  }

  remove(id: string): QueryHistoryEntry[] {
    this.entries = this.entries.filter((entry) => entry.id !== id);
    this.storage.save(this.entries);
    notifyQueryHistoryUpdated();
    return this.list();
  }

  clear(): QueryHistoryEntry[] {
    this.entries = [];
    this.storage.clear();
    notifyQueryHistoryUpdated();
    return [];
  }
}

export const queryHistoryManager = new QueryHistoryManager();
