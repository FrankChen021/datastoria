/**
 * @vitest-environment jsdom
 */

import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { QueryControl } from "./query-control";

const {
  setDisplayModeMock,
  mockChatPanelState,
  executeQueryMock,
  executeBatchMock,
  mockQueryInput,
  mockConnection,
} = vi.hoisted(() => ({
  setDisplayModeMock: vi.fn(),
  mockChatPanelState: {
    displayMode: "hidden" as "hidden" | "panel" | "tabWidth" | "fullscreen",
  },
  executeQueryMock: vi.fn(),
  executeBatchMock: vi.fn(),
  mockQueryInput: {
    selectedText: "",
    text: "SELECT 1",
    cursorRow: 0,
    cursorColumn: 0,
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
    displayMode: mockChatPanelState.displayMode,
    setDisplayMode: setDisplayModeMock,
  }),
}));

vi.mock("@/components/connection/connection-context", () => ({
  useConnection: () => ({
    connection: mockConnection,
  }),
}));

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
    setDisplayModeMock.mockReset();
    mockChatPanelState.displayMode = "hidden";
    executeQueryMock.mockReset();
    executeBatchMock.mockReset();
    mockQueryInput.selectedText = "";
    mockQueryInput.text = "SELECT 1";
    mockQueryInput.cursorRow = 0;
    mockQueryInput.cursorColumn = 0;
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

  it("renders Toggle Agent and omits AI Actions", async () => {
    await act(async () => {
      root.render(<QueryControl onOpenHistory={vi.fn()} />);
    });

    expect(container.textContent).toContain("Toggle Agent");
    expect(container.textContent).not.toContain("AI Actions");
  });

  it("opens the chat panel in panel mode when it is hidden", async () => {
    await act(async () => {
      root.render(<QueryControl onOpenHistory={vi.fn()} />);
    });

    const toggleButton = Array.from(container.querySelectorAll("button")).find((candidate) =>
      candidate.textContent?.includes("Toggle Agent")
    );

    expect(toggleButton).toBeTruthy();

    await act(async () => {
      toggleButton?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });

    expect(setDisplayModeMock).toHaveBeenCalledWith("panel");
  });

  it("closes the chat panel when it is already visible", async () => {
    mockChatPanelState.displayMode = "tabWidth";

    await act(async () => {
      root.render(<QueryControl onOpenHistory={vi.fn()} />);
    });

    const toggleButton = Array.from(container.querySelectorAll("button")).find((candidate) =>
      candidate.textContent?.includes("Toggle Agent")
    );

    expect(toggleButton).toBeTruthy();

    await act(async () => {
      toggleButton?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });

    expect(setDisplayModeMock).toHaveBeenCalledWith("hidden");
  });

  it("runs the selected text when selection exists", async () => {
    mockQueryInput.selectedText = "SELECT version()";

    await act(async () => {
      root.render(<QueryControl onOpenHistory={vi.fn()} />);
    });

    const runButton = Array.from(container.querySelectorAll("button")).find((candidate) =>
      candidate.textContent?.includes("Run Selected Text")
    );

    expect(runButton).toBeTruthy();

    await act(async () => {
      runButton?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });

    expect(executeQueryMock).toHaveBeenCalledWith("SELECT version()");
  });
});
