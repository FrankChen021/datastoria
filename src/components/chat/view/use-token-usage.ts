"use client";

import type { AppUIMessage } from "@/lib/ai/chat-types";
import { normalizeUsage, sumTokenUsage } from "@/lib/ai/token-usage-utils";
import type { LanguageModelUsage } from "ai";
import { useMemo } from "react";

const EMPTY_USAGE: LanguageModelUsage = {
  inputTokens: 0,
  inputTokenDetails: { noCacheTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 0 },
  outputTokens: 0,
  outputTokenDetails: { textTokens: 0, reasoningTokens: 0 },
  totalTokens: 0,
};

/**
 * Session token usage. Each message's metadata.usage is cumulative; sum all for session total.
 */
export function useTokenUsage(messages: AppUIMessage[] | undefined) {
  return useMemo(() => {
    if (!messages?.length) return EMPTY_USAGE;

    const usages = (messages as AppUIMessage[])
      .filter((m) => m.role === "assistant")
      .map((m) => normalizeUsage(m.metadata?.usage as Record<string, unknown>));

    return sumTokenUsage(usages);
  }, [messages]);
}
