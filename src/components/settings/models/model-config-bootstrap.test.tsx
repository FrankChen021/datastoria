/**
 * @vitest-environment jsdom
 */

import type { ModelProps } from "@/lib/ai/llm/llm-provider-factory";
import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ModelConfigBootstrap } from "./model-config-bootstrap";

const setSystemModelsMock = vi.fn();
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

vi.mock("@/components/runtime-config-provider", () => ({
  useRuntimeConfig: () => ({
    connectionProviderEnabled: false,
    systemModels,
  }),
}));

vi.mock("@/components/settings/models/model-manager", () => ({
  ModelManager: {
    getInstance: () => ({
      setSystemModels: setSystemModelsMock,
    }),
  },
}));

describe("ModelConfigBootstrap", () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    testGlobal.IS_REACT_ACT_ENVIRONMENT = true;
    setSystemModelsMock.mockReset();
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

  it("hydrates system models on mount without rendering UI", () => {
    act(() => {
      root.render(<ModelConfigBootstrap />);
    });

    expect(setSystemModelsMock).toHaveBeenCalledTimes(1);
    expect(setSystemModelsMock).toHaveBeenCalledWith(systemModels, false);
    expect(container.innerHTML).toBe("");
  });
});
