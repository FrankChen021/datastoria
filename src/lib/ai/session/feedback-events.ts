import { z } from "zod";
import { validateSessionId } from "./remote-chat-request";

export const AI_FEEDBACK_SOURCES = ["auto_explain_error"] as const;
export type AIFeedbackSource = (typeof AI_FEEDBACK_SOURCES)[number];

export const AUTO_EXPLAIN_NEGATIVE_REASON_CODES = [
  "wrong_diagnosis",
  "too_vague",
  "unsafe_fix",
  "missing_context",
  "other",
] as const;

export type AutoExplainNegativeReasonCode = (typeof AUTO_EXPLAIN_NEGATIVE_REASON_CODES)[number];

export const autoExplainFeedbackPayloadSchema = z.object({
  queryId: z.string().trim().min(1).max(255),
  errorCode: z.string().trim().min(1).max(64).nullable().optional(),
  sql: z.string().trim().min(1).max(100000).nullable().optional(),
});

export type AutoExplainFeedbackPayload = z.infer<typeof autoExplainFeedbackPayloadSchema>;

const feedbackUpsertRequestSchema = z
  .object({
    source: z.enum(AI_FEEDBACK_SOURCES),
    sessionId: z.string().refine(validateSessionId, {
      message: "sessionId must be a non-empty string with max length 64",
    }),
    messageId: z.string().trim().min(1).max(255),
    solved: z.boolean(),
    reasonCode: z.enum(AUTO_EXPLAIN_NEGATIVE_REASON_CODES).nullable().optional(),
    freeText: z.string().trim().max(2000).nullable().optional(),
    payload: autoExplainFeedbackPayloadSchema,
    recoveryActionTaken: z.boolean().optional().default(false),
  })
  .superRefine((value, ctx) => {
    if (!value.solved && !value.reasonCode) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "reasonCode is required when solved is false",
        path: ["reasonCode"],
      });
    }
  });

export type AIFeedbackEventPayload = AutoExplainFeedbackPayload;

export type UpsertFeedbackEventRequest = {
  source: AIFeedbackSource;
  sessionId: string;
  messageId: string;
  solved: boolean;
  reasonCode: AutoExplainNegativeReasonCode | null;
  payload: AIFeedbackEventPayload;
  freeText: string | null;
  recoveryActionTaken: boolean;
};

export function normalizeFeedbackText(value: string | null | undefined): string | null {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

export function validateUpsertFeedbackEventRequest(
  payload: unknown
): UpsertFeedbackEventRequest | null {
  const result = feedbackUpsertRequestSchema.safeParse(payload);
  if (!result.success) {
    return null;
  }

  return {
    source: result.data.source,
    sessionId: result.data.sessionId,
    messageId: result.data.messageId,
    solved: result.data.solved,
    reasonCode: result.data.solved ? null : (result.data.reasonCode ?? null),
    payload: {
      queryId: result.data.payload.queryId,
      errorCode: result.data.payload.errorCode ?? null,
      sql: normalizeFeedbackText(result.data.payload.sql),
    },
    freeText: result.data.solved ? null : normalizeFeedbackText(result.data.freeText),
    recoveryActionTaken: result.data.recoveryActionTaken,
  };
}

export function normalizeFeedbackEventForStorage(input: UpsertFeedbackEventRequest) {
  if (input.solved) {
    return {
      ...input,
      reasonCode: null,
      freeText: null,
      payload: {
        ...input.payload,
      },
    };
  }

  return {
    ...input,
    freeText: normalizeFeedbackText(input.freeText),
    payload: {
      ...input.payload,
    },
  };
}

export type FeedbackReportFilters = {
  source?: AIFeedbackSource;
  days?: number;
};

export function validateFeedbackReportFilters(url: URL): FeedbackReportFilters {
  const source = url.searchParams.get("source");
  const daysRaw = url.searchParams.get("days");
  const days = daysRaw ? Number.parseInt(daysRaw, 10) : undefined;

  return {
    source:
      source && AI_FEEDBACK_SOURCES.includes(source as AIFeedbackSource)
        ? (source as AIFeedbackSource)
        : undefined,
    days: Number.isFinite(days) && days && days > 0 ? days : undefined,
  };
}
