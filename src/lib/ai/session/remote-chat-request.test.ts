import type { AppUIMessage } from "@/lib/ai/chat-types";
import { describe, expect, it } from "vitest";
import {
  hasCompletedToolOutputs,
  replaceOrAppendMessageById,
  validateRemoteChatRequest,
} from "./remote-chat-request";

function createMessage(overrides: Partial<AppUIMessage>): AppUIMessage {
  return {
    id: "message-1",
    role: "user",
    parts: [],
    ...overrides,
  } as AppUIMessage;
}

describe("replaceOrAppendMessageById", () => {
  it("replaces an existing message with the same id", () => {
    const persisted = [
      createMessage({ id: "message-1", role: "user" }),
      createMessage({ id: "message-2", role: "assistant" }),
    ];
    const incoming = createMessage({
      id: "message-2",
      role: "assistant",
      parts: [{ type: "text", text: "updated" }] as AppUIMessage["parts"],
    });

    const merged = replaceOrAppendMessageById(persisted, incoming);

    expect(merged).toHaveLength(2);
    expect(merged[1]?.parts).toEqual(incoming.parts);
  });

  it("appends a new message when the id is not present", () => {
    const persisted = [createMessage({ id: "message-1", role: "user" })];
    const incoming = createMessage({ id: "message-3", role: "assistant" });

    const merged = replaceOrAppendMessageById(persisted, incoming);

    expect(merged.map((message) => message.id)).toEqual(["message-1", "message-3"]);
  });
});

describe("validateRemoteChatRequest", () => {
  it("accepts a valid initial request", () => {
    const request = validateRemoteChatRequest({
      sessionId: "chat-1",
      connectionId: "conn-1",
      message: createMessage({ role: "user" }),
    });

    expect(request).not.toBeNull();
    expect(request?.continuation).toBe(false);
  });

  it("accepts a valid continuation request", () => {
    const request = validateRemoteChatRequest({
      sessionId: "chat-1",
      connectionId: "conn-1",
      continuation: true,
      message: createMessage({
        id: "assistant-1",
        role: "assistant",
        parts: [{ type: "dynamic-tool", state: "output-available" }] as AppUIMessage["parts"],
      }),
    });

    expect(request).not.toBeNull();
    expect(request?.continuation).toBe(true);
    expect(hasCompletedToolOutputs(request!.message)).toBe(true);
  });
});
