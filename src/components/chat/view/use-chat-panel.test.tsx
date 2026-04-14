/**
 * @vitest-environment jsdom
 */

import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ChatPanelProvider, useChatPanel } from "./use-chat-panel";

describe("ChatPanelProvider", () => {
  let container: HTMLDivElement;
  let root: Root;
  let latestPanel: ReturnType<typeof useChatPanel> | null = null;

  function Probe() {
    latestPanel = useChatPanel();
    return null;
  }

  beforeEach(() => {
    (
      globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }
    ).IS_REACT_ACT_ENVIRONMENT = true;
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
    latestPanel = null;
  });

  afterEach(() => {
    vi.restoreAllMocks();
    act(() => {
      root.unmount();
    });
    container.remove();
  });

  it("generates unique composer nonces even when Date.now() is constant", () => {
    vi.spyOn(Date, "now").mockReturnValue(1234567890);

    act(() => {
      root.render(
        <ChatPanelProvider>
          <Probe />
        </ChatPanelProvider>
      );
    });

    act(() => {
      latestPanel?.setInitialInput("first");
    });
    const firstNonce = latestPanel?.initialInput?.nonce;

    act(() => {
      latestPanel?.setInitialInput("second");
    });
    const secondNonce = latestPanel?.initialInput?.nonce;

    expect(firstNonce).toBe(1);
    expect(secondNonce).toBe(2);
  });
});
