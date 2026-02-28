import { formatMemoryBlock } from "./memory-formatter";
import { normalizeMemorySearchText } from "./memory-normalizer";
import {
  estimateTokenCount,
  MEMORY_DYNAMIC_TOKEN_BUDGET,
  MEMORY_PIN_SOFT_CAP,
  MEMORY_PINNED_TOKEN_BUDGET,
  MEMORY_TOTAL_TOKEN_BUDGET,
} from "./memory-retrieval-spec";
import type {
  MemoryPromptResult,
  MemoryRecord,
  MemoryRetrieveInput,
  MemoryScopeType,
} from "./memory-types";

const KIND_WEIGHT: Record<MemoryRecord["kind"], number> = {
  preference: 100,
  connection_fact: 70,
  workflow_note: 50,
  investigation_finding: 60,
};

function scoreMemory(record: MemoryRecord, queryTerms: string[]): number {
  const keywordHits = queryTerms.reduce((score, term) => {
    let next = score;
    if (record.normalizedContent.includes(term)) next += 20;
    if (record.title.toLowerCase().includes(term)) next += 10;
    if (record.tags.some((tag) => tag.toLowerCase().includes(term))) next += 5;
    return next;
  }, 0);

  const recencyBoost = Math.max(
    0,
    365 - (Date.now() - new Date(record.updatedAt).getTime()) / (1000 * 60 * 60 * 24)
  );

  return KIND_WEIGHT[record.kind] + keywordHits + record.confidence * 10 + recencyBoost;
}

function scopeMatches(
  record: MemoryRecord,
  input: MemoryRetrieveInput,
  scopeType: MemoryScopeType
): boolean {
  if (record.scopeType !== scopeType) return false;
  if (record.userId !== input.userId) return false;
  if (scopeType === "user_connection" || scopeType === "user_connection_database") {
    if (!input.connectionId || record.connectionId !== input.connectionId) return false;
  }
  if (scopeType === "user_connection_database") {
    if (!input.databaseId || record.databaseId !== input.databaseId) return false;
  }
  return record.status === "active";
}

function trimToBudget(records: MemoryRecord[], budget: number): MemoryRecord[] {
  let used = 0;
  const kept: MemoryRecord[] = [];

  for (const record of records) {
    const cost = estimateTokenCount(record.content);
    if (used + cost > budget) break;
    kept.push(record);
    used += cost;
  }

  return kept;
}

export function retrieveMemoryBlock(
  allRecords: MemoryRecord[],
  input: MemoryRetrieveInput
): MemoryPromptResult {
  const queryTerms = normalizeMemorySearchText(input.queryText);
  const warnings: string[] = [];

  const scopeChain: MemoryScopeType[] = ["user", "user_connection", "user_connection_database"];
  const scopedRecords = scopeChain.flatMap((scope) =>
    allRecords.filter((record) => scopeMatches(record, input, scope))
  );

  const pinned = scopedRecords
    .filter((record) => record.pinned)
    .sort(
      (a, b) =>
        (b.pinPriority ?? 2) - (a.pinPriority ?? 2) || b.updatedAt.localeCompare(a.updatedAt)
    );

  if (pinned.length > MEMORY_PIN_SOFT_CAP) {
    warnings.push(
      `You have ${pinned.length} pinned memories in scope. Consider reducing this to ${MEMORY_PIN_SOFT_CAP} or fewer.`
    );
  }

  const keptPinned = trimToBudget(pinned, MEMORY_PINNED_TOKEN_BUDGET);
  if (keptPinned.length < pinned.length) {
    warnings.push(
      "Some pinned memories were omitted because the pinned memory budget was exceeded."
    );
  }

  const pinnedIds = new Set(keptPinned.map((record) => record.id));
  const dynamicCandidates = scopedRecords
    .filter((record) => !pinnedIds.has(record.id))
    .sort((a, b) => scoreMemory(b, queryTerms) - scoreMemory(a, queryTerms));

  const usedPinnedTokens = keptPinned.reduce(
    (sum, record) => sum + estimateTokenCount(record.content),
    0
  );
  const dynamicBudget = Math.min(
    MEMORY_TOTAL_TOKEN_BUDGET - usedPinnedTokens,
    MEMORY_DYNAMIC_TOKEN_BUDGET + Math.max(0, MEMORY_PINNED_TOKEN_BUDGET - usedPinnedTokens)
  );

  const keptDynamic = trimToBudget(dynamicCandidates, Math.max(0, dynamicBudget));
  const finalRecords = [...keptPinned, ...keptDynamic];

  return {
    memoryBlock: formatMemoryBlock(finalRecords),
    warnings,
    recordIds: finalRecords.map((record) => record.id),
  };
}
