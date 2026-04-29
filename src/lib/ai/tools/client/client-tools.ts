/**
 * Client-only interactive tools.
 *
 * ClickHouse tool schemas and executors live under `tools/clickhouse` because they can run either
 * in the browser or on the server depending on whether a ClickHouseConnection is provided.
 */
import type { AppUIMessage } from "@/lib/ai/ai-types";
import { tool, type UIMessage } from "ai";
import * as z from "zod";

export type AskUserQuestionOption =
  | {
      id: string;
      label: string;
      input: "none";
    }
  | {
      id: string;
      label: string;
      input: "text";
    }
  | {
      id: string;
      label: string;
      input: "select";
      choices: string[];
    };

export type AskUserQuestionInput = {
  questions: {
    header: string;
    options: AskUserQuestionOption[];
  }[];
};

export type AskUserQuestionOutput = {
  optionId: string;
  label: string;
  input: "none" | "text" | "select";
  value: string;
};

const askUserQuestionOptionSchema = z.discriminatedUnion("input", [
  z
    .object({
      id: z.string(),
      label: z.string(),
      input: z.literal("none"),
    })
    .strict(),
  z
    .object({
      id: z.string(),
      label: z.string(),
      input: z.literal("text"),
    })
    .strict(),
  z
    .object({
      id: z.string(),
      label: z.string(),
      input: z.literal("select"),
      choices: z.array(z.string()).min(1),
    })
    .strict(),
]);

export const ClientTools = {
  ask_user_question: tool({
    description:
      "Ask the user a single structured follow-up question inside the chat UI. This is an interactive tool: it pauses until the user answers, then returns the normalized selection and value.",
    inputSchema: z.object({
      questions: z
        .array(
          z.object({
            header: z.string(),
            options: z.array(askUserQuestionOptionSchema).min(1),
          })
        )
        .min(1)
        .max(1)
        .describe("Exactly one question for v1."),
    }) satisfies z.ZodType<AskUserQuestionInput>,
    outputSchema: z.object({
      optionId: z.string(),
      label: z.string(),
      input: z.enum(["none", "text", "select"]),
      value: z.string(),
    }) satisfies z.ZodType<AskUserQuestionOutput>,
  }),
};

export const CLIENT_TOOL_NAMES = {
  ASK_USER_QUESTION: "ask_user_question",
} as const;

export function convertToAppUIMessage(message: UIMessage): AppUIMessage {
  return message as AppUIMessage;
}
