import type { LanguageModelV3 } from "@ai-sdk/provider";
import {
  extractJsonMiddleware,
  Output,
  streamText,
  wrapLanguageModel,
  type FlexibleSchema,
  type InferSchema,
  type LanguageModel,
} from "ai";
import { logLlmPrompt } from "./llm/prompt-debug";

export function stripMarkdownCodeFence(value: string): string {
  const trimmed = value.trim();
  const fencedMatch = trimmed.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);
  return fencedMatch?.[1]?.trim() ?? trimmed;
}

function parseTextObjectResponse<SCHEMA extends FlexibleSchema<unknown>>(
  text: string,
  schema: SCHEMA
): InferSchema<SCHEMA> {
  const parsed = JSON.parse(stripMarkdownCodeFence(text)) as unknown;

  if (
    schema &&
    typeof schema === "object" &&
    "parse" in schema &&
    typeof schema.parse === "function"
  ) {
    return schema.parse(parsed) as InferSchema<SCHEMA>;
  }

  return parsed as InferSchema<SCHEMA>;
}

function maybeWrapWithJsonExtraction(
  model: LanguageModel,
  supportsStructuredOutputs: boolean
): LanguageModel {
  if (
    supportsStructuredOutputs &&
    model &&
    typeof model === "object" &&
    "specificationVersion" in model &&
    model.specificationVersion === "v3"
  ) {
    return wrapLanguageModel({
      model: model as LanguageModelV3,
      middleware: extractJsonMiddleware({
        transform: (text) => {
          return stripMarkdownCodeFence(text);
        },
      }),
    });
  }

  return model;
}

export async function streamObject<SCHEMA extends FlexibleSchema<unknown>>(input: {
  model: LanguageModel;
  prompt: string;
  schema: SCHEMA;
  temperature?: number;
  supportsStructuredOutputs: boolean;
}): Promise<InferSchema<SCHEMA>> {
  logLlmPrompt({
    label: "stream-object",
    prompt: input.prompt,
  });
  const result = streamText({
    model: maybeWrapWithJsonExtraction(input.model, input.supportsStructuredOutputs),
    prompt: input.prompt,
    output: input.supportsStructuredOutputs
      ? Output.object({
          schema: input.schema,
        })
      : undefined,
    temperature: input.temperature,
  });

  return input.supportsStructuredOutputs
    ? ((await result.output) as InferSchema<SCHEMA>)
    : parseTextObjectResponse(await result.text, input.schema);
}
