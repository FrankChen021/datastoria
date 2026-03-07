import { uiMessageToText } from "@/lib/ai/agent/plan/planning-prompt-builder";
import type { InputModel } from "@/lib/ai/agent/plan/sub-agent-registry";
import { LanguageModelProviderFactory } from "@/lib/ai/llm/llm-provider-factory";
import { generateText, Output, type LanguageModelUsage, type UIMessage } from "ai";
import { z } from "zod";
import { PrivateSessionTitleGenerator } from "./session-title-generator-private";

export type SessionTitleGenerationResponse = {
  title?: string;
  usage?: LanguageModelUsage;
};

const TITLE_MAX_LENGTH = 64;
const TITLE_INPUT_MAX_LENGTH = 300;

export class SessionTitleGenerator {
  static resolveModel(modelConfig: InputModel): InputModel {
    switch (modelConfig.provider) {
      case "OpenAI":
        return { ...modelConfig, modelId: "gpt-5-mini" };
      case "Anthropic":
        return { ...modelConfig, modelId: "claude-haiku-4-5" };
      case "Google":
        return { ...modelConfig, modelId: "gemini-2.5-flash" };
      default:
        return PrivateSessionTitleGenerator.resolveModel(modelConfig);
    }
  }

  static async generate(
    messages: UIMessage[],
    modelConfig: InputModel
  ): Promise<SessionTitleGenerationResponse | undefined> {
    const titleModelConfig = SessionTitleGenerator.resolveModel(modelConfig);

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

    const messageText = uiMessageToText(firstUserMessage).trim();
    if (!messageText) return undefined;
    const titleInput = messageText.slice(0, TITLE_INPUT_MAX_LENGTH);

    try {
      console.log("Generating chat title...");
      const model = LanguageModelProviderFactory.createModel(
        titleModelConfig.provider,
        titleModelConfig.modelId,
        titleModelConfig.apiKey
      );

      const temperature = LanguageModelProviderFactory.getDefaultTemperature(
        titleModelConfig.modelId
      );

      const { output, usage } = await generateText({
        model,
        system: `You generate short chat session titles.
Return JSON with exactly one field: "title".
The title must be 3 to 10 words and at most ${TITLE_MAX_LENGTH} characters.
Use plain words only. Do not include quotes, punctuation, emojis, or explanations.`,
        prompt: titleInput,
        output: Output.object({
          schema: z.object({
            title: z
              .string()
              .max(TITLE_MAX_LENGTH)
              .describe("Short conversation title (3-10 words)"),
          }),
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
  }
}
