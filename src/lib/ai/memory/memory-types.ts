export type MemoryKind =
  | "preference"
  | "connection_fact"
  | "workflow_note"
  | "investigation_finding";

export type MemoryScopeType = "user" | "user_connection" | "user_connection_database";

export type MemoryStatus = "active" | "archived" | "deleted";

export type MemoryWriteMode = "manual" | "confirmed" | "auto";

export type PinPriority = 1 | 2 | 3;

export interface MemoryRecord {
  id: string;
  userId: string;
  scopeType: MemoryScopeType;
  connectionId?: string;
  databaseId?: string;
  kind: MemoryKind;
  title: string;
  content: string;
  normalizedContent: string;
  tags: string[];
  confidence: number;
  pinned: boolean;
  pinPriority?: PinPriority;
  writeMode: MemoryWriteMode;
  sourceChatId?: string;
  sourceMessageId?: string;
  sourceType: "user" | "assistant" | "tool" | "manual";
  status: MemoryStatus;
  createdAt: string;
  updatedAt: string;
  deletedAt?: string;
}

export interface MemoryEvent {
  id: string;
  memoryId: string;
  eventType: "created" | "updated" | "confirmed" | "pinned" | "archived" | "deleted";
  sourceChatId?: string;
  sourceMessageId?: string;
  sourceType: "user" | "assistant" | "tool" | "manual";
  createdAt: string;
}

export interface MemoryQuery {
  scopeType?: MemoryScopeType;
  connectionId?: string;
  databaseId?: string;
  kind?: MemoryKind;
  status?: MemoryStatus;
  limit?: number;
  offset?: number;
}

export interface MemorySearchQuery extends MemoryQuery {
  text: string;
}

export interface MemoryListResult {
  records: MemoryRecord[];
  total: number;
}

export interface MemoryRetrieveInput {
  userId: string;
  connectionId?: string;
  databaseId?: string;
  queryText: string;
}

export interface MemoryPromptResult {
  memoryBlock: string;
  warnings: string[];
  recordIds: string[];
}

export interface MemoryScopeIdentity {
  userId: string;
  scopeType: MemoryScopeType;
  connectionId?: string;
  databaseId?: string;
}

export interface MemoryCandidate {
  title: string;
  content: string;
  kind: MemoryKind;
  scopeType: MemoryScopeType;
  connectionId?: string;
  databaseId?: string;
  writeMode: MemoryWriteMode;
  sourceChatId?: string;
  sourceMessageId?: string;
  sourceType: "user" | "assistant" | "tool" | "manual";
  pinned?: boolean;
  pinPriority?: PinPriority;
  confidence?: number;
  tags?: string[];
}

export interface MemoryStore {
  list(query: MemoryQuery): Promise<MemoryListResult>;
  search(query: MemorySearchQuery): Promise<MemoryListResult>;
  get(id: string): Promise<MemoryRecord | null>;
  upsert(record: MemoryRecord): Promise<MemoryRecord>;
  delete(id: string): Promise<void>;
  archive(id: string): Promise<void>;
}

export interface MemoryEventStore {
  append(event: MemoryEvent): Promise<void>;
}
