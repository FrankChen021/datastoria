/**
 * @vitest-environment jsdom
 */

import { ChatPanelProvider } from "@/components/chat/view/use-chat-panel";
import { ConnectionContext } from "@/components/connection/connection-context";
import { MainPageTabList } from "@/components/main-page-tab-list";
import { TabManager } from "@/components/tab-manager";
import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const queryLogRenderCounts: Record<string, number> = {};

vi.mock("@/components/app-logo", () => ({
  AppLogo: () => <div>logo</div>,
}));

vi.mock("@/components/query-tab/query-tab", () => ({
  QueryTab: () => <div>query tab</div>,
}));

vi.mock("@/components/node-tab/node-tab", () => ({
  NodeTab: () => <div>node tab</div>,
}));

vi.mock("@/components/cluster-tab/cluster-tab", () => ({
  ClusterTab: () => <div>cluster tab</div>,
}));

vi.mock("@/components/database-tab/database-tab", () => ({
  DatabaseTab: () => <div>database tab</div>,
}));

vi.mock("@/components/table-tab/table-tab", () => ({
  TableTab: () => <div>table tab</div>,
}));

vi.mock("@/components/span-log-inspector/span-log-inspector-tab", () => ({
  SpanLogInspectorTab: () => <div>span log tab</div>,
}));

vi.mock("@/components/dashboard-tab/custom-dashboard-tab", () => ({
  CustomDashboardTab: () => <div>custom dashboard tab</div>,
}));

vi.mock("@/components/system-table-tab/system-table-registry", () => ({
  SYSTEM_TABLE_REGISTRY: new Map(),
}));

vi.mock("@/components/query-log-inspector/query-log-inspector-tab", () => ({
  QueryLogInspectorTab: ({ initialQueryId }: { initialQueryId?: string }) => {
    const key = initialQueryId ?? "unknown";
    queryLogRenderCounts[key] = (queryLogRenderCounts[key] ?? 0) + 1;
    return <div data-testid={`query-log-${key}`}>{key}</div>;
  },
}));

function getConnectionContextValue() {
  return {
    isConnectionAvailable: false,
    setIsConnectionAvailable: () => {},
    connection: null,
    pendingConfig: null,
    isInitialized: true,
    switchConnection: () => {},
    updateConnectionMetadata: () => {},
    commitConnection: () => {},
  };
}

function findTabButton(container: HTMLElement, label: string): HTMLButtonElement {
  const button = Array.from(container.querySelectorAll<HTMLButtonElement>('[role="tab"]')).find(
    (element) => element.textContent?.includes(label)
  );

  if (!button) {
    throw new Error(`Tab button "${label}" not found`);
  }

  return button;
}

describe("MainPageTabList", () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    globalThis.IS_REACT_ACT_ENVIRONMENT = true;
    globalThis.ResizeObserver = class ResizeObserver {
      observe() {}
      unobserve() {}
      disconnect() {}
    };
    Element.prototype.scrollIntoView = vi.fn();
    Object.keys(queryLogRenderCounts).forEach((key) => delete queryLogRenderCounts[key]);
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

  it("does not rerender unrelated tab panels when switching tabs", async () => {
    act(() => {
      root.render(
        <ConnectionContext.Provider value={getConnectionContextValue()}>
          <ChatPanelProvider>
            <MainPageTabList selectedConnection={null} />
          </ChatPanelProvider>
        </ConnectionContext.Provider>
      );
    });

    act(() => {
      TabManager.openTab({ id: "query-log-1", type: "query-log", queryId: "q1" });
      TabManager.openTab({ id: "query-log-2", type: "query-log", queryId: "q2" });
      TabManager.openTab({ id: "query-log-3", type: "query-log", queryId: "q3" });
    });

    await vi.waitFor(() => {
      expect(queryLogRenderCounts.q1).toBe(1);
      expect(queryLogRenderCounts.q2).toBe(1);
      expect(queryLogRenderCounts.q3).toBeGreaterThanOrEqual(1);
    });

    const initialQ3RenderCount = queryLogRenderCounts.q3;

    act(() => {
      findTabButton(container, "query log: q1").click();
    });

    await vi.waitFor(() => {
      expect(queryLogRenderCounts.q3).toBe(initialQ3RenderCount + 1);
    });

    const q3RenderCountAfterSwitchingAway = queryLogRenderCounts.q3;

    act(() => {
      findTabButton(container, "query log: q2").click();
    });

    await vi.waitFor(() => {
      expect(queryLogRenderCounts.q2).toBe(2);
    });

    expect(queryLogRenderCounts.q3).toBe(q3RenderCountAfterSwitchingAway);
  });
});
