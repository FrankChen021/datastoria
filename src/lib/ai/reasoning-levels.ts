export type ReasoningLevel = string;

export const DEFAULT_REASONING_LEVEL: ReasoningLevel = "xhigh";

export function isReasoningLevel(value: unknown): value is ReasoningLevel {
  return typeof value === "string" && value.trim().length > 0;
}

export function normalizeReasoningLevel(value: unknown): ReasoningLevel {
  return isReasoningLevel(value) ? value.trim() : DEFAULT_REASONING_LEVEL;
}

export function getDefaultReasoningLevel(
  levels: readonly ReasoningLevel[]
): ReasoningLevel | undefined {
  return levels[levels.length - 1];
}

export function formatReasoningLevel(level: ReasoningLevel): string {
  return level;
}
