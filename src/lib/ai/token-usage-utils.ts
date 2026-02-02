import type { LanguageModelUsage } from "ai";

const ZERO_USAGE: LanguageModelUsage = {
  inputTokens: 0,
  inputTokenDetails: {
    noCacheTokens: 0,
    cacheReadTokens: 0,
    cacheWriteTokens: 0,
  },
  outputTokens: 0,
  outputTokenDetails: {
    textTokens: 0,
    reasoningTokens: 0,
  },
  totalTokens: 0,
};

function getNum(value: number | undefined): number {
  return typeof value === "number" ? value : 0;
}

/**
 * Sum multiple LanguageModelUsage objects (e.g. across tool calls + final response).
 * Uses non-deprecated fields only.
 */
export function sumTokenUsage(
  usages: Array<LanguageModelUsage | undefined | null>
): LanguageModelUsage {
  const acc = {
    ...ZERO_USAGE,
    inputTokenDetails: { ...ZERO_USAGE.inputTokenDetails },
    outputTokenDetails: { ...ZERO_USAGE.outputTokenDetails },
  };

  for (const u of usages) {
    if (!u) continue;
    acc.inputTokens = (acc.inputTokens ?? 0) + getNum(u.inputTokens);
    acc.inputTokenDetails.noCacheTokens =
      (acc.inputTokenDetails.noCacheTokens ?? 0) + getNum(u.inputTokenDetails?.noCacheTokens);
    acc.inputTokenDetails.cacheReadTokens =
      (acc.inputTokenDetails.cacheReadTokens ?? 0) + getNum(u.inputTokenDetails?.cacheReadTokens);
    acc.inputTokenDetails.cacheWriteTokens =
      (acc.inputTokenDetails.cacheWriteTokens ?? 0) + getNum(u.inputTokenDetails?.cacheWriteTokens);
    acc.outputTokens = (acc.outputTokens ?? 0) + getNum(u.outputTokens);
    acc.outputTokenDetails.textTokens =
      (acc.outputTokenDetails.textTokens ?? 0) + getNum(u.outputTokenDetails?.textTokens);
    acc.outputTokenDetails.reasoningTokens =
      (acc.outputTokenDetails.reasoningTokens ?? 0) + getNum(u.outputTokenDetails?.reasoningTokens);
    acc.totalTokens = (acc.totalTokens ?? 0) + getNum(u.totalTokens);
  }

  return acc;
}

/**
 * Normalize usage from API (may include deprecated fields) into LanguageModelUsage.
 * Maps deprecated cachedInputTokens -> inputTokenDetails.cacheReadTokens,
 * deprecated reasoningTokens -> outputTokenDetails.reasoningTokens.
 */
export function normalizeUsage(
  u: Record<string, unknown> | undefined
): LanguageModelUsage | undefined {
  if (
    !u ||
    (typeof u.inputTokens !== "number" &&
      typeof u.outputTokens !== "number" &&
      typeof u.totalTokens !== "number")
  )
    return undefined;

  const inputDetails = u.inputTokenDetails as Record<string, unknown> | undefined;
  const outputDetails = u.outputTokenDetails as Record<string, unknown> | undefined;
  const cacheRead =
    getNum(inputDetails?.cacheReadTokens as number) || getNum(u.cachedInputTokens as number);
  const reasoning =
    getNum(outputDetails?.reasoningTokens as number) || getNum(u.reasoningTokens as number);

  return {
    inputTokens: getNum(u.inputTokens as number),
    inputTokenDetails: {
      noCacheTokens: getNum(inputDetails?.noCacheTokens as number),
      cacheReadTokens: cacheRead,
      cacheWriteTokens: getNum(inputDetails?.cacheWriteTokens as number),
    },
    outputTokens: getNum(u.outputTokens as number),
    outputTokenDetails: {
      textTokens: getNum(outputDetails?.textTokens as number),
      reasoningTokens: reasoning,
    },
    totalTokens: getNum(u.totalTokens as number),
  };
}
