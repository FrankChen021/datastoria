import { beforeEach, describe, expect, it, vi } from "vitest";
import { MAX_QUERY_HISTORY_SIZE, QueryHistoryManager } from "./query-history-manager";
import type { QueryHistoryEntry, QueryHistoryStorage } from "./query-history-storage";

class MockQueryHistoryStorage implements QueryHistoryStorage {
  private entries: QueryHistoryEntry[] = [];

  load = vi.fn(() => [...this.entries]);

  save = vi.fn((entries: QueryHistoryEntry[]) => {
    this.entries = [...entries];
  });

  clear = vi.fn(() => {
    this.entries = [];
  });

  seed(entries: QueryHistoryEntry[]) {
    this.entries = [...entries];
  }
}

describe("QueryHistoryManager", () => {
  let storage: MockQueryHistoryStorage;
  let queryHistoryManager: QueryHistoryManager;

  beforeEach(() => {
    storage = new MockQueryHistoryStorage();
    vi.stubGlobal("window", {
      dispatchEvent: vi.fn(),
    });
    vi.stubGlobal("crypto", {
      randomUUID: vi.fn(() => "uuid"),
    });
    queryHistoryManager = new QueryHistoryManager(storage);
  });

  it("deduplicates identical SQL and keeps the newest entry", () => {
    queryHistoryManager.add({
      id: "older",
      rawSQL: "SELECT 1",
      timestamp: 100,
      connectionName: "A",
    });
    queryHistoryManager.add({
      id: "newer",
      rawSQL: "SELECT 1",
      timestamp: 200,
      connectionName: "B",
    });

    expect(queryHistoryManager.list()).toEqual([
      expect.objectContaining({
        id: "newer",
        timestamp: 200,
      }),
    ]);
  });

  it("loads storage once at initialization and then uses the in-memory cache", () => {
    storage.seed([
      {
        id: "existing",
        rawSQL: "SELECT 1",
        timestamp: 100,
        connectionName: "A",
      },
    ]);
    storage.load.mockClear();

    const cachedStorage = new QueryHistoryManager(storage);
    expect(storage.load).toHaveBeenCalledTimes(1);

    storage.seed([]);

    expect(cachedStorage.list().map((entry) => entry.id)).toEqual(["existing"]);

    cachedStorage.add({
      id: "newer",
      rawSQL: "SELECT 2",
      timestamp: 200,
      connectionName: "B",
    });

    expect(cachedStorage.list().map((entry) => entry.id)).toEqual(["newer", "existing"]);
    expect(storage.load).toHaveBeenCalledTimes(1);
  });

  it("caps stored history at the maximum size", () => {
    const entries: QueryHistoryEntry[] = [];
    for (let index = 0; index < MAX_QUERY_HISTORY_SIZE + 5; index++) {
      entries.push(
        queryHistoryManager.add({
          id: `entry-${index}`,
          rawSQL: `SELECT ${index}`,
          timestamp: index,
          connectionName: "A",
        })[0]
      );
    }

    const history = queryHistoryManager.list();
    expect(history).toHaveLength(MAX_QUERY_HISTORY_SIZE);
    expect(history[0]?.rawSQL).toBe(`SELECT ${MAX_QUERY_HISTORY_SIZE + 4}`);
    expect(history.at(-1)?.rawSQL).toBe("SELECT 5");
    expect(entries).toHaveLength(MAX_QUERY_HISTORY_SIZE + 5);
  });

  it("removes individual entries and clears the whole history", () => {
    queryHistoryManager.add({
      id: "first",
      rawSQL: "SELECT 1",
      timestamp: 100,
      connectionName: "A",
    });
    queryHistoryManager.add({
      id: "second",
      rawSQL: "SELECT 2",
      timestamp: 200,
      connectionName: "A",
    });

    expect(queryHistoryManager.remove("first").map((entry) => entry.id)).toEqual(["second"]);
    expect(queryHistoryManager.clear()).toEqual([]);
    expect(queryHistoryManager.list()).toEqual([]);
  });
});
