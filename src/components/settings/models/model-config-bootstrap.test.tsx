/**
 * @vitest-environment jsdom
 */

import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ModelConfigBootstrap } from "./model-config-bootstrap";

const useModelConfigMock = vi.fn();
const testGlobal = globalThis as typeof globalThis & {
  IS_REACT_ACT_ENVIRONMENT?: boolean;
};

vi.mock("@/hooks/use-model-config", () => ({
  useModelConfig: () => useModelConfigMock(),
}));

describe("ModelConfigBootstrap", () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    testGlobal.IS_REACT_ACT_ENVIRONMENT = true;
    useModelConfigMock.mockReset();
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

  it("initializes model configuration on mount without rendering UI", () => {
    act(() => {
      root.render(<ModelConfigBootstrap />);
    });

    expect(useModelConfigMock).toHaveBeenCalledTimes(1);
    expect(container.innerHTML).toBe("");
  });
});
