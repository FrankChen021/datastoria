/**
 * @vitest-environment jsdom
 */

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ChatInput } from "./chat-input";

vi.mock("@/components/connection/connection-context", () => ({
  useConnection: () => ({
    connection: {
      metadata: {
        tableNames: new Map(),
      },
    },
  }),
}));

vi.mock("../command-context", () => ({
  useChatCommands: () => ({
    commands: [],
  }),
}));

vi.mock("./chat-input-suggestions", async () => {
  const React = await import("react");
  return {
    ChatInputSuggestions: React.forwardRef(function ChatInputSuggestionsMock(_props, _ref) {
      return null;
    }),
  };
});

vi.mock("./chat-input-commands", async () => {
  const React = await import("react");
  return {
    ChatInputCommands: React.forwardRef(function ChatInputCommandsMock(_props, _ref) {
      return null;
    }),
  };
});

vi.mock("./model-selector", () => ({
  ModelSelector: () => <div>model-selector</div>,
}));

vi.mock("../message/chat-token-status", () => ({
  ChatTokenStatus: () => <div>token-status</div>,
}));

describe("ChatInput resize", () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    (
      globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }
    ).IS_REACT_ACT_ENVIRONMENT = true;
    vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => {
      callback(0);
      return 1;
    });
    vi.stubGlobal("cancelAnimationFrame", vi.fn());
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => {
      root.unmount();
    });
    container.remove();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it("allows dragging the top border to resize and double click to reset", () => {
    act(() => {
      root.render(<ChatInput onSubmit={vi.fn()} isRunning={false} />);
    });

    const inputContainer = container.querySelector(
      '[data-testid="chat-input-container"]'
    ) as HTMLDivElement | null;
    const resizeHandle = container.querySelector(
      '[aria-label="Resize chat input"]'
    ) as HTMLDivElement | null;

    expect(inputContainer).not.toBeNull();
    expect(resizeHandle).not.toBeNull();
    expect(inputContainer?.style.height).toBe("");

    vi.spyOn(inputContainer as HTMLDivElement, "getBoundingClientRect").mockReturnValue({
      x: 0,
      y: 0,
      width: 400,
      height: 120,
      top: 0,
      right: 400,
      bottom: 120,
      left: 0,
      toJSON: () => ({}),
    });

    act(() => {
      resizeHandle?.dispatchEvent(new MouseEvent("mousedown", { bubbles: true, clientY: 200 }));
    });

    act(() => {
      window.dispatchEvent(new MouseEvent("mousemove", { bubbles: true, clientY: 140 }));
    });

    expect(inputContainer?.style.height).toBe("180px");

    act(() => {
      window.dispatchEvent(new MouseEvent("mouseup", { bubbles: true }));
    });

    act(() => {
      resizeHandle?.dispatchEvent(new MouseEvent("dblclick", { bubbles: true }));
    });

    expect(inputContainer?.style.height).toBe("");
  });
});
