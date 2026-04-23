import type { AppUIMessage } from "@/lib/ai/ai-types";
import { describe, expect, it } from "vitest";
import { sanitizeMessageForPersistence, serializeMessageParts } from "./serialization";

function createMessage(parts: AppUIMessage["parts"]): AppUIMessage {
  return {
    id: "message-1",
    role: "user",
    parts,
  } as AppUIMessage;
}

describe("sanitizeMessageForPersistence", () => {
  it("drops image file parts while preserving text", () => {
    const message = createMessage([
      { type: "text", text: "Please inspect this chart" },
      {
        type: "file",
        mediaType: "image/png",
        url: "data:image/png;base64,abc",
        filename: "chart.png",
      },
    ] as AppUIMessage["parts"]);

    expect(sanitizeMessageForPersistence(message).parts).toEqual([
      { type: "text", text: "Please inspect this chart" },
    ]);
  });

  it("replaces image-only messages with a placeholder", () => {
    const message = createMessage([
      {
        type: "file",
        mediaType: "image/png",
        url: "data:image/png;base64,abc",
        filename: "chart.png",
      },
    ] as AppUIMessage["parts"]);

    expect(sanitizeMessageForPersistence(message).parts).toEqual([
      { type: "text", text: "[Image attachment omitted from saved history]" },
    ]);
  });

  it("serializes sanitized parts instead of raw image data", () => {
    const message = createMessage([
      { type: "text", text: "hello" },
      {
        type: "file",
        mediaType: "image/png",
        url: "data:image/png;base64,abc",
        filename: "chart.png",
      },
    ] as AppUIMessage["parts"]);

    expect(serializeMessageParts(message)).toBe(JSON.stringify([{ type: "text", text: "hello" }]));
  });

  it("ignores malformed file parts without throwing", () => {
    const message = createMessage([
      { type: "text", text: "hello" },
      {
        type: "file",
        mediaType: null,
        url: null,
        filename: "broken.png",
      } as unknown as AppUIMessage["parts"][number],
    ] as AppUIMessage["parts"]);

    expect(sanitizeMessageForPersistence(message).parts).toEqual(message.parts);
  });
});
