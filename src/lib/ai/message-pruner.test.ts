import type { UIMessage } from "ai";
import { describe, expect, it } from "vitest";
import { MessagePruner } from "./message-pruner";

function toMessages(value: unknown): UIMessage[] {
  return value as UIMessage[];
}

describe("MessagePruner.prune", () => {
  it("prunes all historical validate_sql tool parts (success and failure)", () => {
    const messages = toMessages([
      {
        id: "u1",
        role: "user",
        parts: [{ type: "text", text: "optimize this query" }],
      },
      {
        id: "a1",
        role: "assistant",
        parts: [
          // A failure
          { type: "tool-validate_sql", toolCallId: "v1", input: { sql: "select 1" } },
          {
            type: "tool-validate_sql",
            toolCallId: "v1",
            state: "output-available",
            output: { success: false, error: "syntax error" },
          },
          // A success
          { type: "tool-validate_sql", toolCallId: "v2", input: { sql: "SELECT 1" } },
          {
            type: "tool-validate_sql",
            toolCallId: "v2",
            state: "output-available",
            output: { success: true },
          },
          { type: "text", text: "validated query" },
        ],
      },
      {
        id: "u2",
        role: "user",
        parts: [{ type: "text", text: "next question" }],
      },
    ]);

    const compressed = MessagePruner.prune(messages);
    // Everything from turn 1 should be gone except the text
    expect(compressed[1].parts).toEqual([{ type: "text", text: "validated query" }]);
  });

  it("does not prune from the last message if it is an assistant (active turn)", () => {
    const messages = toMessages([
      {
        id: "u1",
        role: "user",
        parts: [{ type: "text", text: "check sql" }],
      },
      {
        id: "a1",
        role: "assistant",
        parts: [
          {
            type: "tool-validate_sql",
            toolCallId: "v1",
            state: "output-available",
            output: { success: true },
          },
        ],
      },
    ]);

    const compressed = MessagePruner.prune(messages);
    // Should NOT be pruned because it's the last message and it's assistant (active turn)
    expect(compressed[1].parts).toHaveLength(1);
  });

  it("prunes historical parts even if the last message is assistant", () => {
    const messages = toMessages([
      {
        id: "a1",
        role: "assistant",
        parts: [
          {
            type: "tool-validate_sql",
            toolCallId: "v1",
            state: "output-available",
            output: { success: true },
          },
        ],
      },
      {
        id: "u1",
        role: "user",
        parts: [{ type: "text", text: "ok" }],
      },
      {
        id: "a2",
        role: "assistant",
        parts: [{ type: "text", text: "processing..." }],
      },
    ]);

    const compressed = MessagePruner.prune(messages);
    expect(compressed[0].parts).toHaveLength(0); // Historical pruned
    expect(compressed[2].parts).toHaveLength(1); // Current turn (last message) preserved
  });

  it("does not prune non-validate tool parts", () => {
    const messages = toMessages([
      {
        id: "a1",
        role: "assistant",
        parts: [
          { type: "tool-execute_sql", toolCallId: "e1", input: { sql: "select 1" } },
          { type: "text", text: "ran query" },
        ],
      },
      {
        id: "u2",
        role: "user",
        parts: [{ type: "text", text: "done" }],
      },
    ]);

    const compressed = MessagePruner.prune(messages);
    expect(compressed[0].parts).toHaveLength(2);
  });

  it("does not prune tool parts when explicitly disabled in context", () => {
    const messages = toMessages([
      {
        id: "a1",
        role: "assistant",
        parts: [
          {
            type: "tool-validate_sql",
            toolCallId: "v1",
            state: "output-available",
            output: { success: true },
          },
          { type: "text", text: "validated query" },
        ],
      },
      {
        id: "u2",
        role: "user",
        parts: [{ type: "text", text: "next question" }],
      },
    ]);

    const compressed = MessagePruner.prune(messages, { pruneValidateSql: false });
    expect(compressed[0].parts).toHaveLength(2); // Should NOT be pruned
  });
});
