/**
 * @vitest-environment jsdom
 */

import type { ModelProps } from "@/lib/ai/llm/llm-provider-factory";
import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ModelConfigBootstrap } from "./model-config-bootstrap";

const setSystemModelsMock = vi.fn();
const setDynamicModelsMock = vi.fn();
const getProviderSettingsMock = vi.fn();
const fetchAvailableModelsMock = vi.fn();

const testGlobal = globalThis as typeof globalThis & {
  IS_REACT_ACT_ENVIRONMENT?: boolean;
};

const systemModels: ModelProps[] = [
  {
    provider: "OpenAI",
    modelId: "gpt-5",
    source: "system",
  },
];

const githubModels: ModelProps[] = [
  {
    provider: "GitHub Copilot",
    modelId: "gpt-5",
    source: "user",
  },
];

vi.mock("@/lib/ai/llm/available-models-client", () => ({
  fetchAvailableModels: (...args: unknown[]) => fetchAvailableModelsMock(...args),
}));

vi.mock("@/components/app-storage-provider", () => ({
  useAppStorage: () => ({
    isStorageReady: true,
    storageUserId: "user-1",
  }),
}));

vi.mock("@/components/settings/models/model-manager", () => ({
  ModelManager: {
    getInstance: () => ({
      getProviderSettings: getProviderSettingsMock,
      setSystemModels: setSystemModelsMock,
      setDynamicModels: setDynamicModelsMock,
    }),
  },
}));

describe("ModelConfigBootstrap", () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    testGlobal.IS_REACT_ACT_ENVIRONMENT = true;
    setSystemModelsMock.mockReset();
    setDynamicModelsMock.mockReset();
    getProviderSettingsMock.mockReset();
    fetchAvailableModelsMock.mockReset();
    getProviderSettingsMock.mockReturnValue([]);
    fetchAvailableModelsMock.mockResolvedValue({
      systemModels,
      githubModels: [],
    });
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

  it("loads the initial model catalog before rendering children", async () => {
    await act(async () => {
      root.render(
        <ModelConfigBootstrap>
          <div>ready</div>
        </ModelConfigBootstrap>
      );
    });

    expect(fetchAvailableModelsMock).toHaveBeenCalledWith(undefined);
    expect(setSystemModelsMock).toHaveBeenCalledWith(systemModels, false);
    expect(setDynamicModelsMock).toHaveBeenCalledWith([]);
    expect(container.textContent).toBe("ready");
  });

  it("passes the stored Copilot token to the initial-models API", async () => {
    getProviderSettingsMock.mockReturnValue([
      {
        provider: "GitHub Copilot",
        apiKey: "copilot-token",
      },
    ]);
    fetchAvailableModelsMock.mockResolvedValue({
      systemModels,
      githubModels,
    });

    await act(async () => {
      root.render(
        <ModelConfigBootstrap>
          <div>ready</div>
        </ModelConfigBootstrap>
      );
    });

    expect(fetchAvailableModelsMock).toHaveBeenCalledWith("copilot-token");
    expect(setSystemModelsMock).toHaveBeenCalledWith(systemModels, false);
    expect(setDynamicModelsMock).toHaveBeenCalledWith(githubModels);
    expect(container.textContent).toBe("ready");
  });
});
