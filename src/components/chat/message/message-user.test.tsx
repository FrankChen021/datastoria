/**
 * @vitest-environment jsdom
 */

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MessageUser } from "./message-user";

const messageMarkdownSpy = vi.fn();

vi.mock("../command-context", () => ({
  useChatCommands: () => ({
    commandsByName: new Map([
      [
        "review",
        {
          name: "review",
          description: "Review the plan",
          skillId: "plan-review",
        },
      ],
    ]),
  }),
}));

vi.mock("./message-markdown", () => ({
  MessageMarkdown: (props: unknown) => {
    messageMarkdownSpy(props);
    return null;
  },
}));

describe("MessageUser", () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    (
      globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }
    ).IS_REACT_ACT_ENVIRONMENT = true;
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
    messageMarkdownSpy.mockReset();
  });

  afterEach(() => {
    act(() => {
      root.unmount();
    });
    container.remove();
  });

  it("maps a known leading slash command to an inline skill link", () => {
    act(() => {
      root.render(<MessageUser text="/review check this query" />);
    });

    const props = messageMarkdownSpy.mock.calls[0]?.[0] as {
      text: string;
    };

    expect(props.text).toBe(
      '<a href="skill://plan-review" data-chat-command="true" title="Review the plan">/review</a> check this query'
    );
  });

  it("keeps unknown leading slash tokens as plain text", () => {
    act(() => {
      root.render(<MessageUser text="/unknown check this query" />);
    });

    const props = messageMarkdownSpy.mock.calls[0]?.[0] as {
      text: string;
    };

    expect(props.text).toBe("/unknown check this query");
  });
});
