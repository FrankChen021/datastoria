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

vi.mock("@number-flow/react", () => ({
  default: () => null,
}));

vi.mock("@/hooks/use-model-config", () => ({
  useModelConfig: () => ({
    availableModels: [{ provider: "OpenAI", modelId: "gpt-4o", supportsImageInput: true }],
    selectedModel: { provider: "OpenAI", modelId: "gpt-4o" },
  }),
}));

describe("ChatInput images", () => {
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
    vi.stubGlobal("crypto", {
      randomUUID: () => "attachment-1",
    });

    class MockFileReader {
      result: string | ArrayBuffer | null = null;
      onload: ((this: FileReader, ev: ProgressEvent<FileReader>) => unknown) | null = null;
      onerror: ((this: FileReader, ev: ProgressEvent<FileReader>) => unknown) | null = null;
      error: DOMException | null = null;

      readAsDataURL(file: Blob) {
        this.result = `data:${file.type};base64,stub`;
        this.onload?.call(this as unknown as FileReader, {} as ProgressEvent<FileReader>);
      }
    }

    vi.stubGlobal("FileReader", MockFileReader);
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

  it("submits selected images alongside text", async () => {
    const onSubmit = vi.fn();

    await act(async () => {
      root.render(<ChatInput onSubmit={onSubmit} isRunning={false} />);
    });

    const editor = container.querySelector('[role="textbox"]') as HTMLDivElement;
    const fileInput = container.querySelector('input[type="file"]') as HTMLInputElement;
    const sendButton = container.querySelector('button[title^="Send"]') as HTMLButtonElement;
    const imageFile = new File(["stub"], "chart.png", { type: "image/png" });

    await act(async () => {
      editor.textContent = "Explain this chart";
      editor.dispatchEvent(new Event("input", { bubbles: true }));
    });

    Object.defineProperty(fileInput, "files", {
      configurable: true,
      value: [imageFile],
    });

    await act(async () => {
      fileInput.dispatchEvent(new Event("change", { bubbles: true }));
      await Promise.resolve();
    });

    await act(async () => {
      sendButton.click();
    });

    expect(onSubmit).toHaveBeenCalledWith({
      text: "Explain this chart",
      files: [
        {
          id: "attachment-1",
          mediaType: "image/png",
          url: "data:image/png;base64,stub",
          filename: "chart.png",
          sizeBytes: 4,
        },
      ],
    });
  });
});
