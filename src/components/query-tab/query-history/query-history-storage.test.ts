import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  MAX_QUERY_HISTORY_SIZE,
  QueryHistoryStorage,
  type QueryHistoryEntry,
} from "./query-history-storage";

class MockStorage {
  private readonly values = new Map<string, string>();

  getItem(key: string): string | null {
    return this.values.get(key) ?? null;
  }

  setItem(key: string, value: string): void {
    this.values.set(key, value);
  }

  removeItem(key: string): void {
    this.values.delete(key);
  }

  clear(): void {
    this.values.clear();
  }

  key(index: number): string | null {
    return [...this.values.keys()][index] ?? null;
  }

  get length(): number {
    return this.values.size;
  }
}

describe("QueryHistoryStorage", () => {
  const storage = new MockStorage();

  beforeEach(() => {
    storage.clear();
    vi.stubGlobal("localStorage", storage);
    vi.stubGlobal("window", {
      dispatchEvent: vi.fn(),
    });
    vi.stubGlobal("crypto", {
      randomUUID: vi.fn(() => "uuid"),
    });
  });

  it("deduplicates identical SQL within the same connection and keeps the newest entry", () => {
    QueryHistoryStorage.add({
      id: "older",
      sql: "SELECT 1",
      rawSQL: "SELECT 1",
      timestamp: 100,
      connectionId: "conn-a",
      connectionName: "A",
    });
    QueryHistoryStorage.add({
      id: "newer",
      sql: "SELECT 1",
      rawSQL: "SELECT 1",
      timestamp: 200,
      connectionId: "conn-a",
      connectionName: "A",
    });

    expect(QueryHistoryStorage.list()).toEqual([
      expect.objectContaining({
        id: "newer",
        timestamp: 200,
      }),
    ]);
  });

  it("keeps the same SQL when it was executed against different connections", () => {
    QueryHistoryStorage.add({
      id: "first",
      sql: "SELECT 1",
      rawSQL: "SELECT 1",
      timestamp: 100,
      connectionId: "conn-a",
      connectionName: "A",
    });
    QueryHistoryStorage.add({
      id: "second",
      sql: "SELECT 1",
      rawSQL: "SELECT 1",
      timestamp: 200,
      connectionId: "conn-b",
      connectionName: "B",
    });

    expect(QueryHistoryStorage.list().map((entry) => entry.id)).toEqual(["second", "first"]);
  });

  it("caps stored history at the maximum size", () => {
    const entries: QueryHistoryEntry[] = [];
    for (let index = 0; index < MAX_QUERY_HISTORY_SIZE + 5; index++) {
      entries.push(
        QueryHistoryStorage.add({
          id: `entry-${index}`,
          sql: `SELECT ${index}`,
          rawSQL: `SELECT ${index}`,
          timestamp: index,
          connectionId: "conn-a",
          connectionName: "A",
        })[0]
      );
    }

    const history = QueryHistoryStorage.list();
    expect(history).toHaveLength(MAX_QUERY_HISTORY_SIZE);
    expect(history[0]?.sql).toBe(`SELECT ${MAX_QUERY_HISTORY_SIZE + 4}`);
    expect(history.at(-1)?.sql).toBe("SELECT 5");
    expect(entries).toHaveLength(MAX_QUERY_HISTORY_SIZE + 5);
  });

  it("removes individual entries and clears the whole history", () => {
    QueryHistoryStorage.add({
      id: "first",
      sql: "SELECT 1",
      rawSQL: "SELECT 1",
      timestamp: 100,
      connectionId: "conn-a",
      connectionName: "A",
    });
    QueryHistoryStorage.add({
      id: "second",
      sql: "SELECT 2",
      rawSQL: "SELECT 2",
      timestamp: 200,
      connectionId: "conn-a",
      connectionName: "A",
    });

    expect(QueryHistoryStorage.remove("first").map((entry) => entry.id)).toEqual(["second"]);
    expect(QueryHistoryStorage.clear()).toEqual([]);
    expect(QueryHistoryStorage.list()).toEqual([]);
  });
});
