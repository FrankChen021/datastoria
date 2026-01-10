import type { InferUITools, UIDataTypes, UIMessage } from "ai";
import type { ClientTools } from "./client-tools";

export type TokenUsage = {
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  reasoningTokens: number;
  cachedInputTokens: number;
};

export type AppUIMessage = UIMessage<
  {
    updatedAt?: Date;
    createdAt?: Date;
    usage?: TokenUsage;
  },
  UIDataTypes,
  InferUITools<typeof ClientTools>
> & {
  usage?: TokenUsage;
};
