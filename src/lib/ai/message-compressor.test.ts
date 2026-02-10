import { MessageCompressor } from "./message-compressor";
import type { UIMessage } from "ai";
import { describe, expect, it } from "vitest";

function toMessages(value: unknown): UIMessage[] {
  return value as UIMessage[];
}

describe("MessageCompressor.pruneHistoricalToolParts", () => {
  it("prunes historical validate_sql tool parts when last assistant message is not validate_sql", () => {
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
          { type: "tool-validate_sql", toolCallId: "v1", input: { sql: "select 1" } },
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
        id: "a2",
        role: "assistant",
        parts: [{ type: "text", text: "final answer" }],
      },
    ]);

    const compressed = MessageCompressor.pruneHistoricalToolParts(messages, "validate_sql");
    expect(compressed).toHaveLength(3);
    expect(compressed[1].parts).toEqual([{ type: "text", text: "validated query" }]);
    expect(compressed[2].parts).toEqual([{ type: "text", text: "final answer" }]);
  });

  it("keeps history unchanged when the latest assistant message has validate_sql tool part", () => {
    const messages = toMessages([
      {
        id: "u1",
        role: "user",
        parts: [{ type: "text", text: "check sql" }],
      },
      {
        id: "a1",
        role: "assistant",
        parts: [{ type: "dynamic-tool", toolName: "validate_sql", state: "input-available" }],
      },
    ]);

    const compressed = MessageCompressor.pruneHistoricalToolParts(messages, "validate_sql");
    expect(compressed).toBe(messages);
    expect(compressed[1].parts).toEqual(messages[1].parts);
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
        id: "a2",
        role: "assistant",
        parts: [{ type: "text", text: "summary" }],
      },
    ]);

    const compressed = MessageCompressor.pruneHistoricalToolParts(messages, "validate_sql");
    expect(compressed[0].parts).toEqual(messages[0].parts);
    expect(compressed[1].parts).toEqual(messages[1].parts);
  });
});
