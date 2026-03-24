import type { AppUIMessage } from "@/lib/ai/chat-types";
import { describe, expect, it } from "vitest";
import { buildFeedbackReport } from "../feedback-report";
import { ServerSessionRepositorySqlite } from "./server-session-repository-sqlite";

function createAssistantMessage(id: string): AppUIMessage {
  return {
    id,
    role: "assistant",
    parts: [{ type: "text", text: "Try checking the GROUP BY columns." }],
    metadata: {
      usage: {
        inputTokens: 10,
        outputTokens: 20,
        totalTokens: 30,
      },
    },
  } as AppUIMessage;
}

describe("ServerSessionRepositorySqlite.upsertFeedbackEvent", () => {
  it("upserts a canonical event per message and supports reporting", async () => {
    const repository = new ServerSessionRepositorySqlite(":memory:");

    await repository.createSession({
      id: "ephemeral-1",
      user_id: "user@example.com",
      connection_id: "conn-1",
      title: null,
    });

    await repository.upsertMessage({
      session_id: "ephemeral-1",
      user_id: "user@example.com",
      message: createAssistantMessage("assistant-1"),
    });

    await repository.upsertFeedbackEvent({
      user_id: "user@example.com",
      source: "auto_explain_error",
      session_id: "ephemeral-1",
      message_id: "assistant-1",
      solved: false,
      reason_code: "wrong_diagnosis",
      payload_text: JSON.stringify({ queryId: "query-1", errorCode: "62", sql: "select * from t" }),
      free_text: "This guessed the wrong cause",
      recovery_action_taken: true,
    });

    await repository.upsertFeedbackEvent({
      user_id: "user@example.com",
      source: "auto_explain_error",
      session_id: "ephemeral-1",
      message_id: "assistant-1",
      solved: true,
      reason_code: null,
      payload_text: JSON.stringify({ queryId: "query-1", errorCode: "62", sql: "select * from t" }),
      free_text: null,
      recovery_action_taken: true,
    });

    const events = await repository.getFeedbackEvents({ source: "auto_explain_error" });
    expect(events).toHaveLength(1);
    expect(events[0]?.solved).toBe(true);
    expect(events[0]?.recovery_action_taken).toBe(true);

    const report = buildFeedbackReport(events);
    expect(report.totalFeedback).toBe(1);
    expect(report.solvedRate).toBe(100);
  });
});
