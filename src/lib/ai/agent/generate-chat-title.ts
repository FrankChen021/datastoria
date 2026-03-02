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

const TITLE_MAX_LENGTH = 64;
const TITLE_INPUT_MAX_LENGTH = 300;

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
  modelConfig: InputModel
): Promise<GenerateChatTitleResult | undefined> {
  // Find and check current request is the the user request which should only contain one user message
  let firstUserMessage: UIMessage | undefined;
  for (const m of messages) {
    if (m.role === "user") {
      if (firstUserMessage) return undefined;
      firstUserMessage = m;
    } else if (m.role === "assistant") {
      return undefined;
    }
  }
  if (!firstUserMessage) return undefined;

  // Extract the user message text and limit the length
  const messageText = uiMessageToText(firstUserMessage).trim();
  if (!messageText) return undefined;
  const titleInput = messageText.slice(0, TITLE_INPUT_MAX_LENGTH);

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
        system: `You generate short chat session titles.
Return JSON with exactly one field: "title".
The title must be 3 to 7 words and at most ${TITLE_MAX_LENGTH} characters.
Use plain words only. Do not include quotes, punctuation, emojis, or explanations.`,
        prompt: titleInput,
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
  return run();
}
