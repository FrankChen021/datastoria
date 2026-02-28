import { normalizeMemoryContent } from "./memory-normalizer";
import type { MemoryCandidate, MemoryScopeIdentity } from "./memory-types";

function toSentenceCase(text: string): string {
  const trimmed = text.trim();
  if (!trimmed) return trimmed;
  return trimmed.charAt(0).toUpperCase() + trimmed.slice(1);
}

function buildTitle(content: string): string {
  const trimmed = content.trim();
  if (trimmed.length <= 48) {
    return trimmed;
  }
  return `${trimmed.slice(0, 45).trim()}...`;
}

function makeCandidate(
  content: string,
  scope: MemoryScopeIdentity,
  sourceChatId?: string,
  sourceMessageId?: string,
  writeMode: MemoryCandidate["writeMode"] = "confirmed"
): MemoryCandidate {
  const sentence = toSentenceCase(content.replace(/[.]+$/, ""));
  return {
    title: buildTitle(sentence),
    content: sentence,
    kind: "preference",
    scopeType: scope.scopeType,
    connectionId: scope.connectionId,
    databaseId: scope.databaseId,
    writeMode,
    sourceType: "user",
    sourceChatId,
    sourceMessageId,
    confidence: writeMode === "auto" ? 0.65 : 0.9,
    tags: ["preference"],
  };
}

function stripLeadingMemoryPhrases(text: string): string {
  return text
    .replace(/\b(please\s+)?remember\s+this[:,]?\s*/i, "")
    .replace(/\bfrom\s+now\s+on[:,]?\s*/i, "")
    .replace(/\balways\s+/i, "")
    .trim();
}

export function extractPreferenceCandidatesFromText(args: {
  text: string;
  scope: MemoryScopeIdentity;
  sourceChatId?: string;
  sourceMessageId?: string;
  autoSave: boolean;
}): MemoryCandidate[] {
  const text = args.text.trim();
  if (!text) return [];

  const lowered = normalizeMemoryContent(text);
  const writeMode: MemoryCandidate["writeMode"] = args.autoSave ? "auto" : "confirmed";
  const results: MemoryCandidate[] = [];

  if (/\b(show|preview)\s+sql\b/.test(lowered) && /\b(before|first|prior)\b/.test(lowered)) {
    results.push(
      makeCandidate(
        "Show SQL before execution",
        args.scope,
        args.sourceChatId,
        args.sourceMessageId,
        writeMode
      )
    );
  }

  if (/\b(use|prefer)\s+utc\b/.test(lowered)) {
    results.push(
      makeCandidate(
        "Use UTC in explanations and time-based responses",
        args.scope,
        args.sourceChatId,
        args.sourceMessageId,
        writeMode
      )
    );
  }

  if (/\bprefer\b/.test(lowered) && /\b(safe|safer|low[- ]risk|conservative)\b/.test(lowered)) {
    results.push(
      makeCandidate(
        "Prefer safer fixes over aggressive optimization",
        args.scope,
        args.sourceChatId,
        args.sourceMessageId,
        writeMode
      )
    );
  }

  const explicitMemory =
    /\bremember\s+this\b/.test(lowered) ||
    /\bfrom\s+now\s+on\b/.test(lowered) ||
    /\balways\b/.test(lowered);

  if (explicitMemory) {
    const stripped = stripLeadingMemoryPhrases(text);
    if (stripped.length > 0 && stripped.length <= 160) {
      results.push(
        makeCandidate(stripped, args.scope, args.sourceChatId, args.sourceMessageId, "confirmed")
      );
    }
  }

  const dedup = new Map<string, MemoryCandidate>();
  for (const candidate of results) {
    dedup.set(normalizeMemoryContent(candidate.content), candidate);
  }
  return Array.from(dedup.values());
}
