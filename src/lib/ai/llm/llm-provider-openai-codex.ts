import { createOpenAI, type OpenAIResponsesProviderOptions } from "@ai-sdk/openai";
import type { ProviderDefinition } from "./llm-provider-factory";
import { withVisibleReasoningLanguageInstruction } from "./llm-provider-openai-options";

function decodeJwtPayload(token: string): Record<string, unknown> | undefined {
  const payload = token.split(".")[1];
  if (!payload) return undefined;

  try {
    const normalized = payload.replace(/-/g, "+").replace(/_/g, "/");
    const padded = normalized.padEnd(normalized.length + ((4 - (normalized.length % 4)) % 4), "=");
    const decoded = globalThis.atob(padded);
    const bytes = Uint8Array.from(decoded, (char) => char.charCodeAt(0));
    return JSON.parse(new TextDecoder().decode(bytes)) as Record<string, unknown>;
  } catch {
    return undefined;
  }
}

function extractCodexAccountId(token: string): string | undefined {
  const payload = decodeJwtPayload(token);
  if (!payload) return undefined;

  const authClaim = payload["https://api.openai.com/auth"];
  if (authClaim && typeof authClaim === "object") {
    const auth = authClaim as Record<string, unknown>;
    if (typeof auth.chatgpt_account_id === "string") return auth.chatgpt_account_id;
    if (typeof auth.account_id === "string") return auth.account_id;

    const organizations = auth.organizations;
    if (Array.isArray(organizations)) {
      const organization = organizations.find(
        (candidate): candidate is Record<string, unknown> =>
          Boolean(candidate) && typeof candidate === "object" && typeof candidate.id === "string"
      );
      if (typeof organization?.id === "string") return organization.id;
    }
  }

  if (typeof payload.chatgpt_account_id === "string") return payload.chatgpt_account_id;
  if (typeof payload.account_id === "string") return payload.account_id;
  if (typeof payload.sub === "string") return payload.sub;

  return undefined;
}

export const OPENAI_CODEX_PROVIDER = {
  logo: "openai.svg",
  create: (modelId, apiKey) => {
    const accountId = extractCodexAccountId(apiKey);
    return createOpenAI({
      apiKey,
      baseURL: "https://chatgpt.com/backend-api/codex",
      headers: {
        ...(accountId ? { "chatgpt-account-id": accountId } : {}),
      },
    })(modelId);
  },
  buildProviderOptions: ({ instructions, outputReasoning, reasoningLevel, responseLanguage }) => ({
    openai: {
      instructions: withVisibleReasoningLanguageInstruction(
        instructions,
        outputReasoning,
        responseLanguage
      ),
      ...(reasoningLevel ? { reasoningEffort: reasoningLevel } : {}),
      ...(outputReasoning ? { reasoningSummary: "auto" as const } : {}),
      // Keep chat state in DataStoria instead of creating stored OpenAI responses.
      store: false,
    } satisfies OpenAIResponsesProviderOptions,
  }),
} satisfies ProviderDefinition;
