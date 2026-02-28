import { AgentConfigurationManager } from "@/components/settings/agent/agent-manager";
import { uiMessageToText } from "@/lib/ai/agent/plan/planning-prompt-builder";
import type { UIMessage } from "ai";
import { v7 as uuidv7 } from "uuid";
import { extractPreferenceCandidatesFromText } from "./memory-extractor";
import { normalizeMemoryContent } from "./memory-normalizer";
import { DEFAULT_PIN_PRIORITY } from "./memory-retrieval-spec";
import { retrieveMemoryBlock } from "./memory-retriever";
import type {
  MemoryCandidate,
  MemoryEvent,
  MemoryListResult,
  MemoryPromptResult,
  MemoryQuery,
  MemoryRecord,
  MemoryRetrieveInput,
  MemoryScopeIdentity,
  MemorySearchQuery,
} from "./memory-types";
import { IndexedDBMemoryEventStore, IndexedDBMemoryStore } from "./stores/indexeddb-memory-store";

const memoryStore = new IndexedDBMemoryStore();
const memoryEventStore = new IndexedDBMemoryEventStore();

const WRITE_MODE_PRIORITY: Record<MemoryRecord["writeMode"], number> = {
  manual: 3,
  confirmed: 2,
  auto: 1,
};

function buildScopePredicate(candidate: MemoryCandidate, record: MemoryRecord): boolean {
  if (candidate.scopeType !== record.scopeType) return false;
  if (candidate.scopeType === "user_connection" && candidate.connectionId !== record.connectionId) {
    return false;
  }
  if (
    candidate.scopeType === "user_connection_database" &&
    (candidate.connectionId !== record.connectionId || candidate.databaseId !== record.databaseId)
  ) {
    return false;
  }
  return true;
}

function buildMemoryEvent(
  memoryId: string,
  candidate: MemoryCandidate,
  eventType: MemoryEvent["eventType"]
): MemoryEvent {
  return {
    id: uuidv7(),
    memoryId,
    eventType,
    sourceChatId: candidate.sourceChatId,
    sourceMessageId: candidate.sourceMessageId,
    sourceType: candidate.sourceType,
    createdAt: new Date().toISOString(),
  };
}

async function findExistingRecord(
  userId: string,
  candidate: MemoryCandidate
): Promise<MemoryRecord | null> {
  const rows = await memoryStore.list({
    scopeType: candidate.scopeType,
    connectionId: candidate.connectionId,
    databaseId: candidate.databaseId,
    kind: candidate.kind,
    status: "active",
    limit: 1000,
    offset: 0,
  });

  const normalized = normalizeMemoryContent(candidate.content);
  return (
    rows.records.find(
      (record) =>
        record.userId === userId &&
        record.kind === candidate.kind &&
        buildScopePredicate(candidate, record) &&
        record.normalizedContent === normalized
    ) ?? null
  );
}

function buildRecord(userId: string, candidate: MemoryCandidate): MemoryRecord {
  const now = new Date().toISOString();
  return {
    id: uuidv7(),
    userId,
    scopeType: candidate.scopeType,
    connectionId: candidate.connectionId,
    databaseId: candidate.databaseId,
    kind: candidate.kind,
    title: candidate.title,
    content: candidate.content,
    normalizedContent: normalizeMemoryContent(candidate.content),
    tags: candidate.tags ?? [],
    confidence: candidate.confidence ?? 0.7,
    pinned: candidate.pinned ?? false,
    pinPriority: candidate.pinPriority ?? DEFAULT_PIN_PRIORITY,
    writeMode: candidate.writeMode,
    sourceChatId: candidate.sourceChatId,
    sourceMessageId: candidate.sourceMessageId,
    sourceType: candidate.sourceType,
    status: "active",
    createdAt: now,
    updatedAt: now,
  };
}

function mergeRecord(existing: MemoryRecord, candidate: MemoryCandidate): MemoryRecord {
  const incomingPriority = WRITE_MODE_PRIORITY[candidate.writeMode];
  const existingPriority = WRITE_MODE_PRIORITY[existing.writeMode];
  const canReplaceText =
    incomingPriority >= existingPriority &&
    !(existing.pinned && incomingPriority < existingPriority);

  return {
    ...existing,
    title: canReplaceText ? candidate.title : existing.title,
    content: canReplaceText ? candidate.content : existing.content,
    normalizedContent: canReplaceText
      ? normalizeMemoryContent(candidate.content)
      : existing.normalizedContent,
    tags: Array.from(new Set([...existing.tags, ...(candidate.tags ?? [])])),
    confidence: Math.min(
      1,
      Math.max(existing.confidence, candidate.confidence ?? existing.confidence) + 0.05
    ),
    writeMode: incomingPriority > existingPriority ? candidate.writeMode : existing.writeMode,
    pinned: existing.pinned || Boolean(candidate.pinned),
    pinPriority: existing.pinPriority ?? candidate.pinPriority ?? DEFAULT_PIN_PRIORITY,
    updatedAt: new Date().toISOString(),
  };
}

export class MemoryService {
  static isMemoryEnabled(): boolean {
    const config = AgentConfigurationManager.getConfiguration();
    return config.memoryEnabled !== false;
  }

  static isLocalStorageMode(): boolean {
    return AgentConfigurationManager.getConfiguration().memoryStorageMode !== "remote";
  }

  static async list(query: MemoryQuery): Promise<MemoryListResult> {
    return memoryStore.list(query);
  }

  static async search(query: MemorySearchQuery): Promise<MemoryListResult> {
    return memoryStore.search(query);
  }

  static async get(id: string): Promise<MemoryRecord | null> {
    return memoryStore.get(id);
  }

  static async saveManualMemory(
    record: Omit<MemoryRecord, "id" | "createdAt" | "updatedAt" | "normalizedContent">
  ): Promise<MemoryRecord> {
    const now = new Date().toISOString();
    const saved = await memoryStore.upsert({
      ...record,
      id: uuidv7(),
      normalizedContent: normalizeMemoryContent(record.content),
      createdAt: now,
      updatedAt: now,
      pinPriority: record.pinPriority ?? DEFAULT_PIN_PRIORITY,
    });
    await memoryEventStore.append({
      id: uuidv7(),
      memoryId: saved.id,
      eventType: "created",
      sourceChatId: saved.sourceChatId,
      sourceMessageId: saved.sourceMessageId,
      sourceType: "manual",
      createdAt: now,
    });
    return saved;
  }

  static async updateMemory(record: MemoryRecord): Promise<MemoryRecord> {
    const updated = await memoryStore.upsert({
      ...record,
      normalizedContent: normalizeMemoryContent(record.content),
      updatedAt: new Date().toISOString(),
      pinPriority: record.pinPriority ?? DEFAULT_PIN_PRIORITY,
    });
    await memoryEventStore.append({
      id: uuidv7(),
      memoryId: updated.id,
      eventType: "updated",
      sourceChatId: updated.sourceChatId,
      sourceMessageId: updated.sourceMessageId,
      sourceType: "manual",
      createdAt: new Date().toISOString(),
    });
    return updated;
  }

  static async archiveMemory(id: string): Promise<void> {
    await memoryStore.archive(id);
  }

  static async deleteMemory(id: string): Promise<void> {
    await memoryStore.delete(id);
  }

  static async persistCandidates(
    userId: string,
    candidates: MemoryCandidate[]
  ): Promise<MemoryRecord[]> {
    const saved: MemoryRecord[] = [];

    for (const candidate of candidates) {
      const existing = await findExistingRecord(userId, candidate);
      if (existing) {
        const merged = mergeRecord(existing, candidate);
        const record = await memoryStore.upsert(merged);
        await memoryEventStore.append(
          buildMemoryEvent(
            record.id,
            candidate,
            candidate.writeMode === "confirmed" ? "confirmed" : "updated"
          )
        );
        saved.push(record);
        continue;
      }

      const record = await memoryStore.upsert(buildRecord(userId, candidate));
      await memoryEventStore.append(buildMemoryEvent(record.id, candidate, "created"));
      saved.push(record);
    }

    return saved;
  }

  static async retrieveForPrompt(input: MemoryRetrieveInput): Promise<MemoryPromptResult> {
    if (!this.isMemoryEnabled() || !this.isLocalStorageMode()) {
      return { memoryBlock: "", warnings: [], recordIds: [] };
    }

    const all = await memoryStore.list({ status: "active", limit: 1000, offset: 0 });
    return retrieveMemoryBlock(all.records, input);
  }

  static async suggestPreferenceCandidates(args: {
    userId: string;
    text: string;
    scope: MemoryScopeIdentity;
    sourceChatId?: string;
    sourceMessageId?: string;
  }): Promise<MemoryCandidate[]> {
    if (!this.isMemoryEnabled() || !this.isLocalStorageMode()) {
      return [];
    }

    const autoSave = AgentConfigurationManager.getConfiguration().autoSavePreferences ?? false;
    const extracted = extractPreferenceCandidatesFromText({
      text: args.text,
      scope: args.scope,
      sourceChatId: args.sourceChatId,
      sourceMessageId: args.sourceMessageId,
      autoSave,
    });

    const suggestions: MemoryCandidate[] = [];
    for (const candidate of extracted) {
      const existing = await findExistingRecord(args.userId, candidate);
      if (!existing) {
        suggestions.push(candidate);
      }
    }
    return suggestions;
  }

  static async maybeAutoSavePreferenceCandidates(args: {
    userId: string;
    text: string;
    scope: MemoryScopeIdentity;
    sourceChatId?: string;
    sourceMessageId?: string;
  }): Promise<MemoryRecord[]> {
    if (!this.isMemoryEnabled() || !this.isLocalStorageMode()) {
      return [];
    }
    if (!(AgentConfigurationManager.getConfiguration().autoSavePreferences ?? false)) {
      return [];
    }
    const candidates = await this.suggestPreferenceCandidates(args);
    return this.persistCandidates(
      args.userId,
      candidates.map((candidate) => ({ ...candidate, writeMode: "auto" }))
    );
  }

  static async flushMessages(args: {
    userId: string;
    messages: UIMessage[];
    connectionId?: string;
    databaseId?: string;
  }): Promise<void> {
    if (!this.isMemoryEnabled() || !this.isLocalStorageMode()) return;

    const autoSave = AgentConfigurationManager.getConfiguration().autoSavePreferences ?? false;
    const candidates: MemoryCandidate[] = [];
    for (const message of args.messages) {
      if (message.role !== "user") continue;
      const text = uiMessageToText(message);
      if (!text.trim()) continue;
      const extracted = extractPreferenceCandidatesFromText({
        text,
        scope: {
          userId: args.userId,
          scopeType: "user",
          connectionId: args.connectionId,
          databaseId: args.databaseId,
        },
        sourceMessageId: message.id,
        autoSave,
      }).filter((candidate) => autoSave || /\bremember\s+this\b/i.test(text));
      candidates.push(...extracted);
    }
    if (candidates.length > 0) {
      await this.persistCandidates(args.userId, candidates);
    }
  }
}
