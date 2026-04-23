import type { AppUIMessage } from "@/lib/ai/ai-types";
import { describe, expect, it } from "vitest";
import { buildSendMessagesRequestPayload } from "./chat-factory";

function createMessage(overrides: Partial<AppUIMessage>): AppUIMessage {
  return {
    id: "message-1",
    role: "user",
    parts: [{ type: "text", text: "diagnose this" }],
    ...overrides,
  } as AppUIMessage;
}

describe("buildSendMessagesRequestPayload", () => {
  const diagnosisContext = {
    clusterName: "prod-eu",
    serverVersion: "24.8.1.1",
    clickHouseUser: "default",
  };

  it("includes diagnosis context in remote chat payloads", () => {
    const payload = buildSendMessagesRequestPayload({
      sessionId: "session-1",
      connectionId: "default@https://example.com",
      messages: [createMessage({})],
      trigger: "submit-message",
      messageId: "message-1",
      body: {},
      requestContext: diagnosisContext,
      currentModel: { provider: "openai", modelId: "gpt-5" },
      generateTitle: false,
      ephemeral: true,
      pruneValidateSql: true,
      chatPersistenceMode: "remote",
    });

    expect(payload).toMatchObject({
      sessionId: "session-1",
      context: diagnosisContext,
      ephemeral: true,
    });
  });

  it("includes diagnosis context in local chat payloads", () => {
    const message = createMessage({});
    const payload = buildSendMessagesRequestPayload({
      sessionId: "session-1",
      connectionId: "default@https://example.com",
      messages: [message],
      trigger: "submit-message",
      messageId: "message-1",
      body: { existing: true },
      requestContext: diagnosisContext,
      currentModel: undefined,
      generateTitle: true,
      pruneValidateSql: true,
      chatPersistenceMode: "local",
      ephemeral: false,
    });

    expect(payload).toMatchObject({
      existing: true,
      messages: [message],
      context: diagnosisContext,
      generateTitle: true,
    });
  });

  it("marks continuation requests for completed tool outputs", () => {
    const payload = buildSendMessagesRequestPayload({
      sessionId: "session-1",
      connectionId: "default@https://example.com",
      messages: [
        createMessage({
          id: "assistant-1",
          role: "assistant",
          parts: [{ type: "dynamic-tool", state: "output-available" }] as AppUIMessage["parts"],
        }),
      ],
      trigger: "submit-message",
      messageId: "assistant-1",
      body: {},
      requestContext: diagnosisContext,
      currentModel: undefined,
      generateTitle: true,
      ephemeral: false,
      pruneValidateSql: true,
      chatPersistenceMode: "remote",
    });

    expect(payload).toMatchObject({
      continuation: true,
    });
  });

  it("keeps pruneValidateSql authoritative over agentContext overrides", () => {
    const payload = buildSendMessagesRequestPayload({
      sessionId: "session-1",
      connectionId: "default@https://example.com",
      messages: [createMessage({})],
      trigger: "submit-message",
      messageId: "message-1",
      body: {},
      requestContext: diagnosisContext,
      currentModel: undefined,
      generateTitle: false,
      ephemeral: true,
      pruneValidateSql: true,
      agentContext: {
        pruneValidateSql: false,
        responseLanguage: "zh-CN",
      },
      chatPersistenceMode: "remote",
    });

    expect(payload).toMatchObject({
      agentContext: {
        pruneValidateSql: true,
        responseLanguage: "zh-CN",
      },
    });
  });

  it("preserves mention metadata on remote user messages", () => {
    const message = createMessage({
      metadata: {
        mentionMetadata: {
          version: 1,
          mentions: [{ kind: "setting", name: "max_threads", type: "UInt64" }],
        },
      },
    });

    const payload = buildSendMessagesRequestPayload({
      sessionId: "session-1",
      connectionId: "default@https://example.com",
      messages: [message],
      trigger: "submit-message",
      messageId: "message-1",
      body: {},
      requestContext: diagnosisContext,
      currentModel: undefined,
      generateTitle: false,
      ephemeral: true,
      pruneValidateSql: true,
      chatPersistenceMode: "remote",
    });

    expect(payload).toMatchObject({
      message: {
        metadata: {
          mentionMetadata: {
            version: 1,
            mentions: [{ kind: "setting", name: "max_threads", type: "UInt64" }],
          },
        },
      },
    });
  });
});
