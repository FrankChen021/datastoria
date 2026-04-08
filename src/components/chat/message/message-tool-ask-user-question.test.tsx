/**
 * @vitest-environment jsdom
 */

import type { AppUIMessage } from "@/lib/ai/chat-types";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MessageToolAskUserQuestion } from "./message-tool-ask-user-question";

const onToolOutputMock = vi.fn<(...args: unknown[]) => Promise<void>>();

vi.mock("../chat-action-context", () => ({
  useChatAction: () => ({
    onToolOutput: onToolOutputMock,
  }),
}));

function createToolPart(
  overrides: Partial<Record<string, unknown>> = {}
): AppUIMessage["parts"][0] {
  return {
    type: "dynamic-tool",
    toolName: "ask_user_question",
    toolCallId: "ask-user-question-1",
    state: "input-available",
    input: {
      questions: [
        {
          header: "What time range should I use to find slow queries in system.query_log?",
          options: [
            { id: "last_60m", label: "Last 60 minutes", input: "none" },
            { id: "last_3h", label: "Last 3 hours", input: "none" },
            { id: "custom", label: "Custom (I'll specify)", input: "text" },
          ],
        },
      ],
    },
    ...overrides,
  } as unknown as AppUIMessage["parts"][0];
}

function createSelectToolPart(
  overrides: Partial<Record<string, unknown>> = {}
): AppUIMessage["parts"][0] {
  return createToolPart({
    input: {
      questions: [
        {
          header: "Which metric should I use to find expensive queries?",
          options: [
            {
              id: "find_expensive_query",
              label: "Find expensive query",
              input: "select",
              choices: ["duration", "cpu"],
            },
          ],
        },
      ],
    },
    ...overrides,
  });
}

function clickText(container: HTMLElement, text: string) {
  const element = [...container.querySelectorAll("*")].find(
    (node) => node.textContent?.trim() === text
  );
  if (!(element instanceof HTMLElement)) {
    throw new Error(`Unable to find clickable text: ${text}`);
  }

  const target =
    element.closest("button, label, [role='radio']") ??
    [...element.querySelectorAll("button, label, [role='radio']")][0] ??
    element;

  act(() => {
    target.dispatchEvent(new MouseEvent("click", { bubbles: true }));
  });
}

describe("MessageToolAskUserQuestion", () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    (
      globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }
    ).IS_REACT_ACT_ENVIRONMENT = true;
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
    onToolOutputMock.mockReset();
    onToolOutputMock.mockResolvedValue(undefined);
  });

  afterEach(() => {
    act(() => {
      root.unmount();
    });
    container.remove();
  });

  it("renders the question when the payload arrives via tool args", () => {
    act(() => {
      root.render(
        <MessageToolAskUserQuestion
          part={createToolPart({
            input: undefined,
            args: {
              questions: [
                {
                  header: "What time range should I use to find slow queries in system.query_log?",
                  options: [{ id: "last_3h", label: "Last 3 hours", input: "none" }],
                },
              ],
            },
          })}
          isRunning={false}
        />
      );
    });

    expect(container.textContent).toContain(
      "What time range should I use to find slow queries in system.query_log?"
    );
    expect(container.textContent).not.toContain("Question unavailable.");
  });

  it("submits direct radio choices without requiring extra text", async () => {
    act(() => {
      root.render(<MessageToolAskUserQuestion part={createToolPart()} isRunning={false} />);
    });

    clickText(container, "Last 3 hours");

    expect(container.querySelector("textarea")).toBeNull();
    expect(container.textContent).toContain("Last 3 hours");

    await act(async () => {
      clickText(container, "Submit");
      await Promise.resolve();
    });

    expect(onToolOutputMock).toHaveBeenCalledWith({
      tool: "ask_user_question",
      toolCallId: "ask-user-question-1",
      output: {
        optionId: "last_3h",
        label: "Last 3 hours",
        input: "none",
        value: "Last 3 hours",
      },
    });
  });

  it("still requires typed input for custom options", async () => {
    act(() => {
      root.render(<MessageToolAskUserQuestion part={createToolPart()} isRunning={false} />);
    });

    clickText(container, "Custom (I'll specify)");

    expect(container.querySelector("textarea")).not.toBeNull();

    await act(async () => {
      clickText(container, "Submit");
      await Promise.resolve();
    });

    expect(onToolOutputMock).not.toHaveBeenCalled();
    expect(container.textContent).toContain("Please enter a value before submitting.");
  });

  it("submits the selected choice for select options", async () => {
    act(() => {
      root.render(<MessageToolAskUserQuestion part={createSelectToolPart()} isRunning={false} />);
    });

    expect(container.querySelector("textarea")).toBeNull();

    clickText(container, "duration");

    await act(async () => {
      clickText(container, "Submit");
      await Promise.resolve();
    });

    expect(onToolOutputMock).toHaveBeenCalledWith({
      tool: "ask_user_question",
      toolCallId: "ask-user-question-1",
      output: {
        optionId: "find_expensive_query",
        label: "Find expensive query",
        input: "select",
        value: "duration",
      },
    });
  });
});
