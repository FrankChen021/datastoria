/**
 * @vitest-environment jsdom
 */

import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { QueryErrorAIExplanation } from "./query-error-ai-explanation";

const { createEphemeralMock, sendMessageMock, stopMock, mockAgentSettings } = vi.hoisted(() => ({
  createEphemeralMock: vi.fn(),
  sendMessageMock: vi.fn(),
  stopMock: vi.fn(),
  mockAgentSettings: { autoExplainLanguage: "en" },
}));
const testGlobal = globalThis as typeof globalThis & {
  IS_REACT_ACT_ENVIRONMENT?: boolean;
};

vi.mock("@/components/connection/connection-context", () => ({
  useConnection: () => ({
    connection: {
      cluster: "prod-eu",
      metadata: {
        internalUser: "default",
        serverVersion: "24.8.1.1",
      },
    },
  }),
}));

vi.mock("@/components/settings/agent/agent-manager", () => ({
  AgentConfigurationManager: {
    getConfiguration: () => ({
      autoExplainLanguage: mockAgentSettings.autoExplainLanguage,
    }),
  },
  normalizeAutoExplainLanguage: (language: string) => language,
}));

vi.mock("@/components/chat/chat-factory", () => ({
  ChatFactory: {
    createEphemeral: createEphemeralMock,
    stopClientTools: vi.fn(),
  },
}));

vi.mock("@/components/chat/message/chat-message", () => ({
  ChatMessage: () => null,
}));

vi.mock("@number-flow/react", () => ({
  default: () => null,
}));

vi.mock("@ai-sdk/react", () => ({
  useChat: () => ({
    messages: [],
    error: undefined,
    sendMessage: sendMessageMock,
    status: "ready",
    stop: stopMock,
  }),
}));

describe("QueryErrorAIExplanation", () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    testGlobal.IS_REACT_ACT_ENVIRONMENT = true;
    mockAgentSettings.autoExplainLanguage = "en";
    createEphemeralMock.mockReset();
    createEphemeralMock.mockResolvedValue({ id: "chat-1" });
    sendMessageMock.mockReset();
    stopMock.mockReset();
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => {
      root.unmount();
    });
    container.remove();
  });

  it("passes diagnosis context into ephemeral chat creation", async () => {
    await act(async () => {
      root.render(
        <QueryErrorAIExplanation
          queryId="query-1"
          errorCode="115"
          errorMessage="Unknown setting"
          sql="SELECT 1"
        />
      );
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(createEphemeralMock).toHaveBeenCalledWith(
      expect.objectContaining({
        agentContext: expect.objectContaining({
          responseLanguage: "en",
        }),
        context: expect.objectContaining({
          clusterName: "prod-eu",
          serverVersion: "24.8.1.1",
          clickHouseUser: "default",
        }),
      })
    );
  });

  it("passes non-English response language into agentContext", async () => {
    mockAgentSettings.autoExplainLanguage = "zh-CN";

    await act(async () => {
      root.render(
        <QueryErrorAIExplanation
          queryId="query-2"
          errorCode="62"
          errorMessage="Syntax error"
          sql="SELECT"
        />
      );
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(createEphemeralMock).toHaveBeenCalledWith(
      expect.objectContaining({
        agentContext: expect.objectContaining({
          responseLanguage: "zh-CN",
        }),
      })
    );
  });
});
