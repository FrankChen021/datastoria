/**
 * @vitest-environment jsdom
 */

import type { AppUIMessage } from "@/lib/ai/chat-types";
import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ChatMessageList } from "./chat-message-list";

const testGlobal = globalThis as typeof globalThis & {
  IS_REACT_ACT_ENVIRONMENT?: boolean;
};

vi.mock("use-debounce", () => ({
  useDebouncedCallback: <T extends (...args: never[]) => void>(callback: T) => callback,
}));

vi.mock("./chat-message", () => ({
  ChatMessage: ({ message }: { message: AppUIMessage }) => <div>{message.id}</div>,
}));

function createMessage(id: string, role: "user" | "assistant", text: string): AppUIMessage {
  return {
    id,
    role,
    parts: [{ type: "text", text }],
  } as AppUIMessage;
}

describe("ChatMessageList", () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    testGlobal.IS_REACT_ACT_ENVIRONMENT = true;
    vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => {
      callback(0);
      return 0;
    });
    Element.prototype.scrollIntoView = vi.fn();
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => {
      root.unmount();
    });
    container.remove();
    vi.unstubAllGlobals();
  });

  it("keeps following normal streaming, pauses on upward scroll, and resumes on a new message", () => {
    const messages = [
      createMessage("user-1", "user", "hello"),
      createMessage("assistant-1", "assistant", "partial response"),
    ];

    act(() => {
      root.render(<ChatMessageList messages={messages} isRunning={true} error={null} />);
    });

    const scrollContainer = container.firstElementChild as HTMLDivElement;
    let scrollTop = 600;

    Object.defineProperties(scrollContainer, {
      scrollTop: {
        configurable: true,
        get: () => scrollTop,
        set: (value: number) => {
          scrollTop = value;
        },
      },
      scrollHeight: {
        configurable: true,
        get: () => 1000,
      },
      clientHeight: {
        configurable: true,
        get: () => 400,
      },
    });

    const scrollIntoViewSpy = vi.mocked(Element.prototype.scrollIntoView);
    scrollIntoViewSpy.mockClear();

    act(() => {
      root.render(
        <ChatMessageList
          messages={[
            createMessage("user-1", "user", "hello"),
            createMessage("assistant-1", "assistant", "partial response updated"),
          ]}
          isRunning={true}
          error={null}
        />
      );
    });

    expect(scrollIntoViewSpy).toHaveBeenCalledTimes(1);

    scrollIntoViewSpy.mockClear();

    act(() => {
      scrollTop = 580;
      scrollContainer.dispatchEvent(new Event("scroll", { bubbles: true }));
    });

    act(() => {
      root.render(
        <ChatMessageList
          messages={[
            createMessage("user-1", "user", "hello"),
            createMessage("assistant-1", "assistant", "partial response updated"),
          ]}
          isRunning={true}
          error={null}
        />
      );
    });

    expect(scrollIntoViewSpy).not.toHaveBeenCalled();

    act(() => {
      root.render(
        <ChatMessageList
          messages={[
            createMessage("user-1", "user", "hello"),
            createMessage("assistant-1", "assistant", "partial response updated again"),
            createMessage("user-2", "user", "next question"),
          ]}
          isRunning={true}
          error={null}
        />
      );
    });

    expect(scrollIntoViewSpy).toHaveBeenCalledTimes(1);

    scrollIntoViewSpy.mockClear();

    act(() => {
      scrollTop = 580;
      scrollContainer.dispatchEvent(new Event("scroll", { bubbles: true }));
    });

    act(() => {
      root.render(
        <ChatMessageList
          messages={[
            createMessage("user-1", "user", "hello"),
            createMessage("assistant-1", "assistant", "partial response updated again"),
            createMessage("user-2", "user", "next question"),
            createMessage("assistant-2", "assistant", "new stream response"),
          ]}
          isRunning={true}
          error={null}
        />
      );
    });

    expect(scrollIntoViewSpy).toHaveBeenCalledTimes(1);
  });
});
