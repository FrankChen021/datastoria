import type { AppUIMessage, MentionMetadata } from "@/lib/ai/ai-types";
import { describe, expect, it } from "vitest";
import { MentionContext } from "./mention-context";

describe("MentionContext.toMetadata", () => {
  const connection = {
    metadata: {
      tableNames: new Map([
        [
          "system.query_log",
          {
            database: "system",
            table: "query_log",
            engine: "MergeTree",
            columns: [
              { name: "query_id", type: "String" },
              { name: "query", type: "String" },
            ],
          },
        ],
      ]),
      databaseNames: new Map([
        [
          "analytics",
          {
            name: "analytics",
            engine: "Atomic",
            comment: "Analytics database for BI and ad hoc reporting.",
          },
        ],
      ]),
      clickhouseSettings: new Map([
        [
          "max_threads",
          {
            name: "max_threads",
            value: "8",
            changed: false,
            description: "Maximum number of execution threads.",
            min: null,
            max: null,
            readonly: false,
            type: "UInt64",
            source: "settings",
          },
        ],
      ]),
    },
  };

  it("extracts table, database, and setting mentions from inline code tokens", () => {
    const mentionMetadata = MentionContext.toMetadata(
      "Compare `analytics` with `system.query_log` and tune `max_threads`",
      connection as never
    );

    expect(mentionMetadata).toEqual({
      version: 1,
      mentions: [
        {
          kind: "database",
          name: "analytics",
          engine: "Atomic",
          comment: "Analytics database for BI and ad hoc reporting.",
        },
        {
          kind: "table",
          name: "system.query_log",
          engine: "MergeTree",
        },
        {
          kind: "setting",
          name: "max_threads",
          type: "UInt64",
        },
      ],
    });
  });
});

describe("MentionContext.inject", () => {
  function createUserMessage(
    id: string,
    text: string,
    mentionMetadata?: MentionMetadata
  ): AppUIMessage {
    return {
      id,
      role: "user",
      parts: [{ type: "text", text }],
      metadata: mentionMetadata ? { mentionMetadata } : undefined,
    } as AppUIMessage;
  }

  it("replays active mention context into later user turns", () => {
    const messages = MentionContext.inject([
      createUserMessage("m1", "inspect this", {
        version: 1,
        mentions: [{ kind: "table", name: "system.query_log", engine: "MergeTree" }],
      }),
      createUserMessage("m2", "what columns does it have?"),
    ]);

    const secondUserMessage = messages[1];
    expect(secondUserMessage.parts).toEqual([
      {
        type: "text",
        text:
          "what columns does it have?\n\n[system-added context]\nMentioned tables:\n- system.query_log (engine: MergeTree)",
      },
    ]);
  });
});
