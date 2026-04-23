/**
 * @vitest-environment jsdom
 */

import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ChatInput } from "./chat-input";
import { removeLeadingCommand, replaceLeadingCommand } from "./command-utils";
import { getTableMentionMatches, removeTableMentionAt } from "./mention-utils";
import { sqlSnippetTokenCodec } from "./sql-snippet-token";

const mockSettingsByName = new Map();

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

vi.mock("../agent-command-context", () => ({
  useAgentCommands: () => ({
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

vi.mock("../use-clickhouse-settings", () => ({
  useClickHouseSettings: () => ({
    settings: [],
    settingsByName: mockSettingsByName,
    isLoading: false,
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

vi.mock("@/hooks/use-model-config", () => ({
  useModelConfig: () => ({
    availableModels: [],
    selectedModel: { provider: "System", modelId: "Auto" },
  }),
}));

vi.mock("../message/chat-token-status", () => ({
  ChatTokenStatus: () => React.createElement("div", null, "token-status"),
}));

vi.mock("@number-flow/react", () => ({
  default: () => null,
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

describe("SQL snippet token helpers", () => {
  it("creates and expands SQL snippet tokens", () => {
    const token = sqlSnippetTokenCodec.createToken("SELECT *\nFROM system.query_log");

    expect(sqlSnippetTokenCodec.getMatches(`Explain ${token}`)).toEqual([
      expect.objectContaining({
        text: token,
        sql: "SELECT *\nFROM system.query_log",
        start: 8,
        end: 8 + token.length,
      }),
    ]);
    expect(sqlSnippetTokenCodec.expand(token)).toBe("```sql\nSELECT *\nFROM system.query_log\n```");
  });

  it("expands SQL snippet tokens into fenced blocks separated from surrounding prose", () => {
    const token = sqlSnippetTokenCodec.createToken(
      "admin_de_presto_prod_.presto_alb_jdbc_access_log_view.big_data_account"
    );

    expect(sqlSnippetTokenCodec.expand(`what's the type of this column ${token}`)).toBe(
      "what's the type of this column\n\n```sql\nadmin_de_presto_prod_.presto_alb_jdbc_access_log_view.big_data_account\n```"
    );
  });

  it("removes SQL snippet tokens without leaving double spaces behind", () => {
    const token = sqlSnippetTokenCodec.createToken("SELECT 1");
    expect(sqlSnippetTokenCodec.removeAt(`Explain ${token} now`, 8, 8 + token.length)).toBe(
      "Explain now"
    );
  });
});

describe("ChatInput inline tokens", () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    mockSettingsByName.clear();
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
          externalInput: { text: "/review check @system.query_log now", mode: "replace", nonce: 1 },
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
      removeCommandButton?.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true }));
    });

    expect(editor?.textContent).not.toContain("review");
    expect(editor?.textContent).toContain("check");
    expect(editor?.textContent).toContain("system.query_log");

    const removeMentionButton = container.querySelector(
      'button[aria-label="Remove mention system.query_log"]'
    ) as HTMLButtonElement | null;
    expect(removeMentionButton).not.toBeNull();

    act(() => {
      removeMentionButton?.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true }));
    });

    expect(editor?.textContent).toContain("check");
    expect(editor?.textContent).toContain("now");
    expect(editor?.textContent).not.toContain("system.query_log");
  });

  it("renders SQL snippet tokens inline and expands them on submit", () => {
    const onSubmit = vi.fn();
    const externalInput = sqlSnippetTokenCodec.createToken("SELECT 1");

    act(() => {
      root.render(
        React.createElement(ChatInput, {
          onSubmit,
          isRunning: false,
          externalInput: { text: externalInput, mode: "replace", nonce: 1 },
        })
      );
    });

    expect(container.textContent).toContain("SELECT 1");

    const removeSnippetButton = container.querySelector(
      'button[aria-label="Remove SQL selection SELECT 1"]'
    ) as HTMLButtonElement | null;
    expect(removeSnippetButton).not.toBeNull();

    const sendButton = Array.from(container.querySelectorAll("button")).find((candidate) =>
      candidate.getAttribute("aria-label")?.includes("Send")
    );
    expect(sendButton).toBeTruthy();

    act(() => {
      sendButton?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });

    expect(onSubmit).toHaveBeenCalledWith({
      text: "```sql\nSELECT 1\n```",
      files: [],
    });
  });

  it("renders selected settings as inline tokens and removes them when dismissed", () => {
    mockSettingsByName.set("max_threads", {
      name: "max_threads",
      type: "UInt64",
      description: "Maximum number of execution threads.",
      value: "8",
      readonly: false,
      source: "settings",
    });

    act(() => {
      root.render(
        React.createElement(ChatInput, {
          onSubmit: vi.fn(),
          isRunning: false,
          externalInput: { text: "Use `max_threads` now", mode: "replace", nonce: 2 },
        })
      );
    });

    const editor = container.querySelector('[role="textbox"]') as HTMLDivElement | null;
    expect(editor?.textContent).toContain("Use");
    expect(editor?.textContent).toContain("max_threads");
    expect(editor?.textContent).toContain("now");

    const removeSettingButton = container.querySelector(
      'button[aria-label="Remove setting max_threads"]'
    ) as HTMLButtonElement | null;
    expect(removeSettingButton).not.toBeNull();

    act(() => {
      removeSettingButton?.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true }));
    });

    expect(editor?.textContent).toContain("Use");
    expect(editor?.textContent).toContain("now");
    expect(editor?.textContent).not.toContain("max_threads");
  });

  it("appends external input chips to the existing composer content", () => {
    act(() => {
      root.render(
        React.createElement(ChatInput, {
          onSubmit: vi.fn(),
          isRunning: false,
          externalInput: { text: "Explain", mode: "replace", nonce: 1 },
        })
      );
    });

    act(() => {
      root.render(
        React.createElement(ChatInput, {
          onSubmit: vi.fn(),
          isRunning: false,
          externalInput: {
            text: sqlSnippetTokenCodec.createToken("SELECT count() FROM events"),
            mode: "append",
            nonce: 2,
          },
        })
      );
    });

    const editor = container.querySelector('[role="textbox"]') as HTMLDivElement | null;
    expect(editor?.textContent).toContain("Explain");
    expect(editor?.textContent).toContain("SELECT count() FROM events");
  });

  it("does not intercept Enter while IME composition is active", () => {
    act(() => {
      root.render(
        React.createElement(ChatInput, {
          onSubmit: vi.fn(),
          isRunning: false,
          externalInput: { text: "ni", mode: "replace", nonce: 1 },
        })
      );
    });

    const editor = container.querySelector('[role="textbox"]') as HTMLDivElement | null;
    expect(editor).not.toBeNull();

    act(() => {
      editor?.dispatchEvent(new Event("compositionstart", { bubbles: true }));
    });

    act(() => {
      const enterEvent = new KeyboardEvent("keydown", {
        key: "Enter",
        bubbles: true,
        cancelable: true,
      });
      Object.defineProperty(enterEvent, "isComposing", {
        configurable: true,
        value: true,
      });
      editor?.dispatchEvent(enterEvent);
    });

    expect(editor?.innerHTML).not.toContain("<br");

    act(() => {
      if (!editor) {
        return;
      }

      editor.textContent = "你";
      editor.dispatchEvent(new Event("input", { bubbles: true }));
      editor.dispatchEvent(new Event("compositionend", { bubbles: true }));
    });

    expect(editor?.textContent).toBe("你");
  });

  it("keeps placeholder state in sync during IME composition", () => {
    act(() => {
      root.render(
        React.createElement(ChatInput, {
          onSubmit: vi.fn(),
          isRunning: false,
        })
      );
    });

    expect(container.textContent).toContain("Press Enter for new line");

    const editor = container.querySelector('[role="textbox"]') as HTMLDivElement | null;
    expect(editor).not.toBeNull();

    act(() => {
      editor?.dispatchEvent(new Event("compositionstart", { bubbles: true }));
    });

    act(() => {
      if (!editor) {
        return;
      }

      editor.textContent = "ni";
      editor.dispatchEvent(new Event("input", { bubbles: true }));
    });

    expect(container.textContent).not.toContain("Press Enter for new line");
  });
});
