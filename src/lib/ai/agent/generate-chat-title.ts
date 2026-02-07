/**
 * LLM-based chat title generation for the first user message.
 * Used by the skill-based chat (v2) when no planner is present.
 */
import { uiMessageToText } from "@/lib/ai/agent/plan/planning-prompt-builder";
import type { InputModel } from "@/lib/ai/agent/plan/sub-agent-registry";
import { LanguageModelProviderFactory } from "@/lib/ai/llm/llm-provider-factory";
import { generateText, Output, type LanguageModelUsage, type UIMessage } from "ai";
import { z } from "zod";

export type GenerateChatTitleResult = {
  title?: string;
  usage?: LanguageModelUsage;
};

export type GenerateChatTitleOptions = {
  /** Max time to wait for the title (ms). When exceeded, returns undefined. */
  timeoutMs?: number;
};

const TITLE_MAX_LENGTH = 64;

/**
 * System prompt for generating a short conversation title.
 * Mentions "json" so providers (e.g. OpenAI) that require it for response_format json_object accept the request.
 */
export const CHAT_TITLE_SYSTEM_PROMPT = `You are a title generator for chat sessions.
Given the user's message, reply in JSON with a "title" field: a very short conversation title (2–5 words, max ${TITLE_MAX_LENGTH} characters).
No quotes, punctuation, or explanation in the title value.`;

const TitleOutputSchema = z.object({
  title: z.string().max(TITLE_MAX_LENGTH).describe("Short conversation title (2-5 words)"),
});

/**
 * Request an LLM-generated title for the first user message.
 * Only runs when there is exactly one user message and no assistant messages (new conversation).
 * Returns a promise that resolves to { title, usage } or undefined when skipped, on timeout, or on error.
 * When options.timeoutMs is set, races the LLM call against that timeout and returns undefined if it fires first.
 */
export async function generateChatTitle(
  messages: UIMessage[],
  modelConfig: InputModel,
  options?: GenerateChatTitleOptions
): Promise<GenerateChatTitleResult | undefined> {
  const userCount = messages.filter((m) => m.role === "user").length;
  const assistantCount = messages.filter((m) => m.role === "assistant").length;
  if (userCount !== 1 || assistantCount !== 0) return undefined;

  const firstUser = messages.find((m) => m.role === "user");
  if (!firstUser) return undefined;
  const trimmed = uiMessageToText(firstUser).trim();
  if (!trimmed) return undefined;

  const run = async (): Promise<GenerateChatTitleResult | undefined> => {
    try {
      console.log("Generating chat title...");
      const model = LanguageModelProviderFactory.createModel(
        modelConfig.provider,
        modelConfig.modelId,
        modelConfig.apiKey
      );

      const temperature = LanguageModelProviderFactory.getDefaultTemperature(modelConfig.modelId);

      const { output, usage } = await generateText({
        model,
        system: CHAT_TITLE_SYSTEM_PROMPT,
        prompt: trimmed,
        output: Output.object({
          schema: TitleOutputSchema,
        }),
        temperature,
      });

      const title = output?.title?.trim();
      const resolvedTitle =
        title && title.length > 0 ? title.slice(0, TITLE_MAX_LENGTH) : undefined;
      return { title: resolvedTitle, usage };
    } catch (e) {
      console.warn("Error generating chat title:", e);
      return undefined;
    }
  };

  const timeoutMs = options?.timeoutMs;
  if (timeoutMs != null && timeoutMs > 0) {
    return Promise.race([
      run(),
      new Promise<undefined>((resolve) => setTimeout(() => resolve(undefined), timeoutMs)),
    ]);
  }
  return run();
}
