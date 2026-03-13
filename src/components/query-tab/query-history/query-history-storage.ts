"use client";

export interface QueryHistoryEntry {
  id: string;
  rawSQL: string;
  timestamp: number;
  connectionName: string;
}

export interface QueryHistoryStorage {
  load(): QueryHistoryEntry[];
  save(entries: QueryHistoryEntry[]): void;
  clear(): void;
}
