/**
 * @vitest-environment jsdom
 */

import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ChatInput } from "./chat-input";
import { removeLeadingCommand, replaceLeadingCommand } from "./command-utils";
import { getTableMentionMatches, removeTableMentionAt } from "./mention-utils";

vi.mock("@/components/connection/connection-context", () => ({
  useConnection: () => ({
    connection: {
      metadata: {
        tableNames: new Map([
          [
            "system.query_log",
            {
              database: "system",
              table: "query_log",
              engine: "MergeTree",
            },
          ],
        ]),
      },
    },
  }),
}));

vi.mock("../command-context", () => ({
  useChatCommands: () => ({
    commands: [
      {
        name: "review",
        skillId: "review-skill",
        description: "Review the current query",
      },
    ],
    commandsByName: new Map([
      [
        "review",
        {
          name: "review",
          skillId: "review-skill",
          description: "Review the current query",
        },
      ],
    ]),
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
  ModelSelector: () => React.createElement("div", null, "model-selector"),
}));

vi.mock("../message/chat-token-status", () => ({
  ChatTokenStatus: () => React.createElement("div", null, "token-status"),
}));

describe("replaceLeadingCommand", () => {
  it("replaces a partially typed hyphenated command without duplicating the suffix", () => {
    expect(replaceLeadingCommand("/diagnose-c", "diagnose-clickhouse-errors")).toBe(
      "/diagnose-clickhouse-errors "
    );
  });

  it("preserves any already typed arguments after the command name", () => {
    expect(replaceLeadingCommand("/diagnose-c error code: 115", "diagnose-clickhouse-errors")).toBe(
      "/diagnose-clickhouse-errors error code: 115"
    );
  });
});

describe("removeLeadingCommand", () => {
  it("removes the leading command and its trailing separator space", () => {
    expect(removeLeadingCommand("/review check this query")).toBe("check this query");
  });
});

describe("table mention helpers", () => {
  it("finds all mention ranges in the input text", () => {
    expect(getTableMentionMatches("compare @system.query_log and @system.query_log?")).toEqual([
      { value: "system.query_log", text: "@system.query_log", start: 8, end: 25 },
      { value: "system.query_log", text: "@system.query_log", start: 30, end: 47 },
    ]);
  });

  it("removes a mention without leaving double spaces behind", () => {
    expect(removeTableMentionAt("compare @system.query_log now", 8, 25)).toBe("compare now");
  });
});

describe("ChatInput inline tokens", () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    (
      globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }
    ).IS_REACT_ACT_ENVIRONMENT = true;
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

  it("renders command and mention tokens inline and removes them when dismissed", () => {
    act(() => {
      root.render(
        React.createElement(ChatInput, {
          onSubmit: vi.fn(),
          isRunning: false,
          externalInput: "/review check @system.query_log now",
        })
      );
    });

    expect(container.textContent).toContain("review");
    expect(container.textContent).toContain("system.query_log");

    const editor = container.querySelector('[role="textbox"]') as HTMLDivElement | null;
    expect(editor?.textContent).toContain("review");
    expect(editor?.textContent).toContain("check");
    expect(editor?.textContent).toContain("system.query_log");
    expect(editor?.textContent).toContain("now");

    const removeCommandButton = container.querySelector(
      'button[aria-label="Remove command review"]'
    ) as HTMLButtonElement | null;
    expect(removeCommandButton).not.toBeNull();

    act(() => {
      removeCommandButton?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });

    expect(editor?.textContent).not.toContain("review");
    expect(editor?.textContent).toContain("check");
    expect(editor?.textContent).toContain("system.query_log");

    const removeMentionButton = container.querySelector(
      'button[aria-label="Remove mention system.query_log"]'
    ) as HTMLButtonElement | null;
    expect(removeMentionButton).not.toBeNull();

    act(() => {
      removeMentionButton?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });

    expect(editor?.textContent).toContain("check");
    expect(editor?.textContent).toContain("now");
    expect(editor?.textContent).not.toContain("system.query_log");
  });
});
