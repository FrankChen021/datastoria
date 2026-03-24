import { describe, expect, it } from "vitest";
import {
  normalizeFeedbackEventForStorage,
  validateUpsertFeedbackEventRequest,
} from "./feedback-events";
import { buildFeedbackReport } from "./feedback-report";

describe("validateUpsertFeedbackEventRequest", () => {
  it("accepts a valid negative feedback payload", () => {
    const request = validateUpsertFeedbackEventRequest({
      source: "auto_explain_error",
      sessionId: "ephemeral-123456",
      messageId: "assistant-1",
      solved: false,
      reasonCode: "wrong_diagnosis",
      freeText: "This guessed the wrong join keys",
      recoveryActionTaken: true,
      payload: {
        queryId: "query-1",
        errorCode: "62",
        sql: "select * from events",
      },
    });

    expect(request).toEqual({
      source: "auto_explain_error",
      sessionId: "ephemeral-123456",
      messageId: "assistant-1",
      solved: false,
      reasonCode: "wrong_diagnosis",
      freeText: "This guessed the wrong join keys",
      recoveryActionTaken: true,
      payload: {
        queryId: "query-1",
        errorCode: "62",
        sql: "select * from events",
      },
    });
  });

  it("rejects invalid payloads", () => {
    expect(
      validateUpsertFeedbackEventRequest({
        source: "auto_explain_error",
        sessionId: "chat-1",
        messageId: "assistant-1",
        solved: false,
        payload: { queryId: "query-1" },
      })
    ).toBeNull();

    expect(
      validateUpsertFeedbackEventRequest({
        source: "auto_explain_error",
        sessionId: "",
        messageId: "assistant-1",
        solved: true,
        payload: { queryId: "query-1" },
      })
    ).toBeNull();
  });
});

describe("normalizeFeedbackEventForStorage", () => {
  it("clears negative-only fields when solved is true", () => {
    expect(
      normalizeFeedbackEventForStorage({
        source: "auto_explain_error",
        sessionId: "ephemeral-1",
        messageId: "assistant-1",
        solved: true,
        reasonCode: "wrong_diagnosis",
        freeText: "stale",
        recoveryActionTaken: true,
        payload: { queryId: "query-1", errorCode: "62", sql: "select 1" },
      })
    ).toMatchObject({
      solved: true,
      reasonCode: null,
      freeText: null,
    });
  });
});

describe("buildFeedbackReport", () => {
  it("aggregates solved rate, top error codes, and negative reasons", () => {
    const report = buildFeedbackReport([
      {
        user_id: "u1",
        source: "auto_explain_error",
        session_id: "s1",
        message_id: "m1",
        solved: true,
        reason_code: null,
        payload_text: JSON.stringify({ queryId: "q1", errorCode: "62", sql: "select 1" }),
        free_text: null,
        recovery_action_taken: false,
        created_at: new Date(),
        updated_at: new Date(),
      },
      {
        user_id: "u2",
        source: "auto_explain_error",
        session_id: "s2",
        message_id: "m2",
        solved: false,
        reason_code: "wrong_diagnosis",
        payload_text: JSON.stringify({ queryId: "q2", errorCode: "62", sql: "select 2" }),
        free_text: "bad",
        recovery_action_taken: true,
        created_at: new Date(),
        updated_at: new Date(),
      },
    ]);

    expect(report.totalFeedback).toBe(2);
    expect(report.solvedRate).toBe(50);
    expect(report.topErrorCodes[0]).toEqual({ label: "62", count: 2 });
    expect(report.negativeReasons[0]).toEqual({ label: "wrong_diagnosis", count: 1 });
  });
});
