import { normalizeMemoryContent } from "@/lib/ai/memory/memory-normalizer";
import { DEFAULT_MEMORY_PAGE_SIZE } from "@/lib/ai/memory/memory-retrieval-spec";
import type {
  MemoryEvent,
  MemoryEventStore,
  MemoryListResult,
  MemoryQuery,
  MemoryRecord,
  MemorySearchQuery,
  MemoryStore,
} from "@/lib/ai/memory/memory-types";
import { StorageManager } from "@/lib/storage/storage-provider-manager";

const DATABASE_PREFIX = "datastoria-memory";
const DATABASE_VERSION = 1;
const MEMORY_STORE_NAME = "memories";
const MEMORY_EVENT_STORE_NAME = "memory_events";

function isIndexedDbAvailable(): boolean {
  return typeof indexedDB !== "undefined";
}

function getDatabaseName(): string {
  return `${DATABASE_PREFIX}:${StorageManager.getInstance().getCurrentUserId()}`;
}

function requestToPromise<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

function transactionDone(transaction: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error);
    transaction.onabort = () => reject(transaction.error);
  });
}

async function openDatabase(): Promise<IDBDatabase | null> {
  if (!isIndexedDbAvailable()) return null;

  return await new Promise((resolve, reject) => {
    const request = indexedDB.open(getDatabaseName(), DATABASE_VERSION);

    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(MEMORY_STORE_NAME)) {
        db.createObjectStore(MEMORY_STORE_NAME, { keyPath: "id" });
      }
      if (!db.objectStoreNames.contains(MEMORY_EVENT_STORE_NAME)) {
        db.createObjectStore(MEMORY_EVENT_STORE_NAME, { keyPath: "id" });
      }
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

function applyQueryFilters(records: MemoryRecord[], query: MemoryQuery): MemoryRecord[] {
  return records.filter((record) => {
    if (query.status && record.status !== query.status) return false;
    if (!query.status && record.status === "deleted") return false;
    if (query.scopeType && record.scopeType !== query.scopeType) return false;
    if (query.connectionId !== undefined && record.connectionId !== query.connectionId)
      return false;
    if (query.databaseId !== undefined && record.databaseId !== query.databaseId) return false;
    if (query.kind && record.kind !== query.kind) return false;
    return true;
  });
}

function paginate(records: MemoryRecord[], limit?: number, offset?: number): MemoryListResult {
  const safeOffset = offset ?? 0;
  const safeLimit = limit ?? DEFAULT_MEMORY_PAGE_SIZE;
  return {
    total: records.length,
    records: records.slice(safeOffset, safeOffset + safeLimit),
  };
}

async function getAllRecords(storeName: string): Promise<any[]> {
  const db = await openDatabase();
  if (!db) return [];

  try {
    const transaction = db.transaction(storeName, "readonly");
    const store = transaction.objectStore(storeName);
    const rows = (await requestToPromise(store.getAll())) as any[];
    await transactionDone(transaction);
    return rows;
  } finally {
    db.close();
  }
}

export class IndexedDBMemoryStore implements MemoryStore {
  async list(query: MemoryQuery): Promise<MemoryListResult> {
    const records = (await getAllRecords(MEMORY_STORE_NAME))
      .map((record) => record as MemoryRecord)
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));

    return paginate(applyQueryFilters(records, query), query.limit, query.offset);
  }

  async search(query: MemorySearchQuery): Promise<MemoryListResult> {
    const normalized = normalizeMemoryContent(query.text);
    const records = applyQueryFilters(
      (await getAllRecords(MEMORY_STORE_NAME))
        .map((record) => record as MemoryRecord)
        .filter((record) => {
          if (!normalized) return true;
          return (
            record.normalizedContent.includes(normalized) ||
            normalizeMemoryContent(record.title).includes(normalized) ||
            record.tags.some((tag) => normalizeMemoryContent(tag).includes(normalized))
          );
        })
        .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)),
      query
    );

    return paginate(records, query.limit, query.offset);
  }

  async get(id: string): Promise<MemoryRecord | null> {
    const db = await openDatabase();
    if (!db) return null;

    try {
      const transaction = db.transaction(MEMORY_STORE_NAME, "readonly");
      const store = transaction.objectStore(MEMORY_STORE_NAME);
      const record = (await requestToPromise(store.get(id))) as MemoryRecord | undefined;
      await transactionDone(transaction);
      return record ?? null;
    } finally {
      db.close();
    }
  }

  async upsert(record: MemoryRecord): Promise<MemoryRecord> {
    const db = await openDatabase();
    if (!db) return record;

    try {
      const transaction = db.transaction(MEMORY_STORE_NAME, "readwrite");
      transaction.objectStore(MEMORY_STORE_NAME).put(record);
      await transactionDone(transaction);
      return record;
    } finally {
      db.close();
    }
  }

  async delete(id: string): Promise<void> {
    const existing = await this.get(id);
    if (!existing) return;

    await this.upsert({
      ...existing,
      status: "deleted",
      deletedAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });
  }

  async archive(id: string): Promise<void> {
    const existing = await this.get(id);
    if (!existing) return;

    await this.upsert({
      ...existing,
      status: "archived",
      updatedAt: new Date().toISOString(),
    });
  }
}

export class IndexedDBMemoryEventStore implements MemoryEventStore {
  async append(event: MemoryEvent): Promise<void> {
    const db = await openDatabase();
    if (!db) return;

    try {
      const transaction = db.transaction(MEMORY_EVENT_STORE_NAME, "readwrite");
      transaction.objectStore(MEMORY_EVENT_STORE_NAME).put(event);
      await transactionDone(transaction);
    } finally {
      db.close();
    }
  }
}
