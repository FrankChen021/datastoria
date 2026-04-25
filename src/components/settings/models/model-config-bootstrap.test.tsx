/**
 * @vitest-environment jsdom
 */

import type { ModelProps } from "@/lib/ai/llm/llm-provider-factory";
import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ModelConfigBootstrap, useModelConfigBootstrap } from "./model-config-bootstrap";

const setSystemModelsMock = vi.fn();
const setDynamicModelsMock = vi.fn();
const setDynamicModelsForProviderMock = vi.fn();
const updateProviderSettingMock = vi.fn();
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
      setDynamicModelsForProvider: setDynamicModelsForProviderMock,
      updateProviderSetting: updateProviderSettingMock,
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
    setDynamicModelsForProviderMock.mockReset();
    updateProviderSettingMock.mockReset();
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

  it("renders children immediately and loads the model catalog in the background", async () => {
    let isReadyCapture = true;

    function Observer() {
      const { isReady } = useModelConfigBootstrap();
      isReadyCapture = isReady;
      return null;
    }

    await act(async () => {
      root.render(
        <ModelConfigBootstrap>
          <Observer />
          <div>ready</div>
        </ModelConfigBootstrap>
      );
    });

    expect(fetchAvailableModelsMock).toHaveBeenCalledWith({
      githubToken: undefined,
    });
    expect(setSystemModelsMock).toHaveBeenCalledWith(systemModels, false);
    expect(setDynamicModelsForProviderMock).toHaveBeenCalledWith("GitHub Copilot", []);
    // Children are always rendered (no null gate)
    expect(container.textContent).toBe("ready");
    // isReady is true once the fetch resolves
    expect(isReadyCapture).toBe(true);
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

    expect(fetchAvailableModelsMock).toHaveBeenCalledWith({
      githubToken: "copilot-token",
    });
    expect(setSystemModelsMock).toHaveBeenCalledWith(systemModels, false);
    expect(setDynamicModelsForProviderMock).toHaveBeenCalledWith("GitHub Copilot", githubModels);
    expect(updateProviderSettingMock).toHaveBeenCalledWith("GitHub Copilot", {
      authError: undefined,
    });
    expect(container.textContent).toBe("ready");
  });

  it("does not pass the stored Codex token to the initial-models API", async () => {
    getProviderSettingsMock.mockReturnValue([
      {
        provider: "OpenAI Codex",
        apiKey: "codex-token",
      },
    ]);
    fetchAvailableModelsMock.mockResolvedValue({
      systemModels,
      githubModels: [],
    });

    await act(async () => {
      root.render(
        <ModelConfigBootstrap>
          <div>ready</div>
        </ModelConfigBootstrap>
      );
    });

    expect(fetchAvailableModelsMock).toHaveBeenCalledWith({
      githubToken: undefined,
    });
    expect(setSystemModelsMock).toHaveBeenCalledWith(systemModels, false);
    expect(setDynamicModelsForProviderMock).toHaveBeenCalledWith("GitHub Copilot", []);
    expect(updateProviderSettingMock).not.toHaveBeenCalled();
    expect(container.textContent).toBe("ready");
  });
});
