/**
 * @vitest-environment jsdom
 */

import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { QueryControl } from "./query-control";

const {
  postMessageMock,
  setDisplayModeMock,
  executeQueryMock,
  executeBatchMock,
  alertDialogMock,
  mockCommands,
  mockQueryInput,
  mockAgentSettings,
  mockConnection,
} = vi.hoisted(() => ({
  postMessageMock: vi.fn(),
  setDisplayModeMock: vi.fn(),
  executeQueryMock: vi.fn(),
  executeBatchMock: vi.fn(),
  alertDialogMock: vi.fn(),
  mockCommands: [
    {
      name: "review-sql",
      description: "Review SQL.",
      skillId: "review-sql",
      template: "Use review-sql: $ARGUMENTS",
      showInSqlEditorQuickAction: true,
    },
  ],
  mockQueryInput: {
    selectedText: "",
    text: "SELECT 1",
    cursorRow: 0,
    cursorColumn: 0,
  },
  mockAgentSettings: {
    aiResponseLanguage: "en",
  },
  mockConnection: {
    connectionId: "connection-1",
  },
}));

const testGlobal = globalThis as typeof globalThis & {
  IS_REACT_ACT_ENVIRONMENT?: boolean;
  ResizeObserver?: typeof ResizeObserver;
};

class ResizeObserverMock {
  observe() {}
  unobserve() {}
  disconnect() {}
}

if (!HTMLElement.prototype.scrollIntoView) {
  HTMLElement.prototype.scrollIntoView = () => {};
}

vi.mock("@/components/chat/view/use-chat-panel", () => ({
  useChatPanel: () => ({
    postMessage: postMessageMock,
    setDisplayMode: setDisplayModeMock,
  }),
}));

vi.mock("@/components/chat/agent-command-browser-panel", async () => {
  const React = await vi.importActual<typeof import("react")>("react");

  return {
    AgentCommandBrowserPanel: ({
      items,
      onSelectItem,
    }: {
      items: Array<{
        key: string;
        label: React.ReactNode;
        description?: string;
        separatorBefore?: boolean;
      }>;
      onSelectItem: (item: {
        key: string;
        label: React.ReactNode;
        description?: string;
        separatorBefore?: boolean;
      }) => void;
    }) => {
      const [activeIndex, setActiveIndex] = React.useState(0);
      const activeItem = items[activeIndex];

      return (
        <div>
          <div>
            {items.map((item, index) => (
              <React.Fragment key={item.key}>
                {item.separatorBefore ? <div cmdk-separator="" /> : null}
                <button
                  type="button"
                  cmdk-item=""
                  onMouseEnter={() => setActiveIndex(index)}
                  onClick={() => onSelectItem(item)}
                >
                  {item.label}
                </button>
              </React.Fragment>
            ))}
          </div>
          {activeItem?.description ? <div>{activeItem.description}</div> : null}
        </div>
      );
    },
  };
});

vi.mock("@/components/shared/use-dialog", () => ({
  Dialog: {
    alert: alertDialogMock,
  },
}));

vi.mock("@/components/chat/agent-command-context", () => ({
  useAgentCommands: () => ({
    commands: mockCommands,
    loading: false,
  }),
}));

vi.mock("@/components/connection/connection-context", () => ({
  useConnection: () => ({
    connection: mockConnection,
  }),
}));

vi.mock("@/components/settings/agent/agent-manager", async () => {
  const actual = await vi.importActual("@/components/settings/agent/agent-manager");
  return {
    ...actual,
    AgentConfigurationManager: {
      getConfiguration: () => mockAgentSettings,
    },
  };
});

vi.mock("../query-execution/query-executor", () => ({
  useQueryExecutor: () => ({
    isSqlExecuting: false,
    executeQuery: executeQueryMock,
    executeBatch: executeBatchMock,
  }),
}));

vi.mock("../query-input/use-query-input", () => ({
  useQueryInput: () => mockQueryInput,
}));

describe("QueryControl", () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    testGlobal.IS_REACT_ACT_ENVIRONMENT = true;
    testGlobal.ResizeObserver = ResizeObserverMock as typeof ResizeObserver;
    postMessageMock.mockReset();
    setDisplayModeMock.mockReset();
    executeQueryMock.mockReset();
    executeBatchMock.mockReset();
    alertDialogMock.mockReset();
    mockCommands.splice(0, mockCommands.length, {
      name: "review-sql",
      description: "Review SQL.",
      skillId: "review-sql",
      template: "Use review-sql: $ARGUMENTS",
      showInSqlEditorQuickAction: true,
    });
    mockQueryInput.selectedText = "";
    mockQueryInput.text = "SELECT 1";
    mockQueryInput.cursorRow = 0;
    mockQueryInput.cursorColumn = 0;
    mockAgentSettings.aiResponseLanguage = "en";
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

  it("renders a single popover trigger when exactly one sql editor command is available", async () => {
    await act(async () => {
      root.render(<QueryControl onOpenHistory={vi.fn()} />);
    });

    const trigger = Array.from(container.querySelectorAll("button")).find((candidate) =>
      candidate.textContent?.includes("AI Actions")
    );

    expect(trigger).toBeTruthy();

    await act(async () => {
      trigger?.dispatchEvent(new MouseEvent("pointerdown", { bubbles: true }));
      trigger?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });

    const reviewItem = Array.from(document.querySelectorAll("[cmdk-item]")).find((candidate) =>
      candidate.textContent?.includes("/review-sql")
    );
    expect(reviewItem).toBeTruthy();
    const items = Array.from(document.querySelectorAll("[cmdk-item]"));
    expect(items.at(-1)?.textContent ?? "").toContain("Toggle Agent");

    await act(async () => {
      reviewItem?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });

    expect(postMessageMock).toHaveBeenCalledWith(
      expect.stringContaining("/review-sql"),
      expect.objectContaining({
        forceNewChat: true,
        agentContext: expect.objectContaining({
          responseLanguage: "en",
        }),
      })
    );
    expect(postMessageMock).toHaveBeenCalledWith(
      expect.stringContaining("```sql\nSELECT 1\n```"),
      expect.any(Object)
    );
  });

  it("renders a dropdown when multiple sql editor commands are available", async () => {
    mockCommands.push({
      name: "diagnose-sql",
      description: "Diagnose SQL.",
      skillId: "diagnose-sql",
      template: "Use diagnose-sql: $ARGUMENTS",
      showInSqlEditorQuickAction: true,
    });

    await act(async () => {
      root.render(<QueryControl onOpenHistory={vi.fn()} />);
    });

    const trigger = Array.from(container.querySelectorAll("button")).find((candidate) =>
      candidate.textContent?.includes("AI Actions")
    );

    expect(trigger).toBeTruthy();

    await act(async () => {
      trigger?.dispatchEvent(new MouseEvent("pointerdown", { bubbles: true }));
      trigger?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });

    const reviewItem = Array.from(document.querySelectorAll("[cmdk-item]")).find((candidate) =>
      candidate.textContent?.includes("/review-sql")
    );

    expect(reviewItem).toBeTruthy();
    expect(document.body.textContent).toContain("Review SQL.");

    await act(async () => {
      reviewItem?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });

    expect(postMessageMock).toHaveBeenCalledWith(
      expect.stringContaining("/review-sql"),
      expect.any(Object)
    );
  });

  it("adds a Toggle Agent item as the last dropdown action", async () => {
    mockCommands.push({
      name: "diagnose-sql",
      description: "Diagnose SQL.",
      skillId: "diagnose-sql",
      template: "Use diagnose-sql: $ARGUMENTS",
      showInSqlEditorQuickAction: true,
    });

    await act(async () => {
      root.render(<QueryControl onOpenHistory={vi.fn()} />);
    });

    const trigger = Array.from(container.querySelectorAll("button")).find((candidate) =>
      candidate.textContent?.includes("AI Actions")
    );

    await act(async () => {
      trigger?.dispatchEvent(new MouseEvent("pointerdown", { bubbles: true }));
      trigger?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });

    const items = Array.from(document.querySelectorAll("[cmdk-item]"));
    expect(items.at(-1)?.textContent).toContain("Toggle Agent");
    const separators = Array.from(document.querySelectorAll("[cmdk-separator]"));
    expect(separators.length).toBeGreaterThan(0);

    await act(async () => {
      items.at(-1)?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });

    expect(setDisplayModeMock).toHaveBeenCalledWith("panel");
    expect(postMessageMock).not.toHaveBeenCalled();
  });

  it("does not launch sql editor commands for obvious multi-statement input", async () => {
    mockQueryInput.text = "SELECT 1; SELECT 2";

    await act(async () => {
      root.render(<QueryControl onOpenHistory={vi.fn()} />);
    });

    const trigger = Array.from(container.querySelectorAll("button")).find((candidate) =>
      candidate.textContent?.includes("AI Actions")
    );

    await act(async () => {
      trigger?.dispatchEvent(new MouseEvent("pointerdown", { bubbles: true }));
      trigger?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });

    const reviewItem = Array.from(document.querySelectorAll("[cmdk-item]")).find((candidate) =>
      candidate.textContent?.includes("/review-sql")
    );

    await act(async () => {
      reviewItem?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });

    expect(postMessageMock).not.toHaveBeenCalled();
    expect(alertDialogMock).toHaveBeenCalledWith(
      expect.objectContaining({
        title: "Single Statement Required",
      })
    );
  });

  it("shows an information dialog when no runnable sql is available", async () => {
    mockQueryInput.text = "-- only comments";

    await act(async () => {
      root.render(<QueryControl onOpenHistory={vi.fn()} />);
    });

    const trigger = Array.from(container.querySelectorAll("button")).find((candidate) =>
      candidate.textContent?.includes("AI Actions")
    );

    await act(async () => {
      trigger?.dispatchEvent(new MouseEvent("pointerdown", { bubbles: true }));
      trigger?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });

    const reviewItem = Array.from(document.querySelectorAll("[cmdk-item]")).find((candidate) =>
      candidate.textContent?.includes("/review-sql")
    );

    await act(async () => {
      reviewItem?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });

    expect(postMessageMock).not.toHaveBeenCalled();
    expect(alertDialogMock).toHaveBeenCalledWith(
      expect.objectContaining({
        title: "No SQL To Send",
      })
    );
  });

  it("uses the dedicated sql review language setting for sql editor commands", async () => {
    mockAgentSettings.aiResponseLanguage = "ja";

    await act(async () => {
      root.render(<QueryControl onOpenHistory={vi.fn()} />);
    });

    const trigger = Array.from(container.querySelectorAll("button")).find((candidate) =>
      candidate.textContent?.includes("AI Actions")
    );

    await act(async () => {
      trigger?.dispatchEvent(new MouseEvent("pointerdown", { bubbles: true }));
      trigger?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });

    const reviewItem = Array.from(document.querySelectorAll("[cmdk-item]")).find((candidate) =>
      candidate.textContent?.includes("/review-sql")
    );

    await act(async () => {
      reviewItem?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });

    expect(postMessageMock).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({
        agentContext: expect.objectContaining({
          responseLanguage: "ja",
        }),
      })
    );
  });

  it("shows Toggle Agent even when no sql editor quick action commands are available", async () => {
    mockCommands.splice(0, mockCommands.length, {
      name: "review-sql",
      description: "Review SQL.",
      skillId: "review-sql",
      template: "Use review-sql: $ARGUMENTS",
      showInSqlEditorQuickAction: false,
    });

    await act(async () => {
      root.render(<QueryControl onOpenHistory={vi.fn()} />);
    });

    const trigger = Array.from(container.querySelectorAll("button")).find((candidate) =>
      candidate.textContent?.includes("AI Actions")
    );
    expect(trigger).toBeTruthy();

    await act(async () => {
      trigger?.dispatchEvent(new MouseEvent("pointerdown", { bubbles: true }));
      trigger?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });

    const items = Array.from(document.querySelectorAll("[cmdk-item]"));
    expect(items).toHaveLength(1);
    expect(items[0]?.textContent ?? "").toContain("Toggle Agent");

    await act(async () => {
      items[0]?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });

    expect(setDisplayModeMock).toHaveBeenCalledWith("panel");
    expect(postMessageMock).not.toHaveBeenCalled();
  });
});
