/**
 * @vitest-environment jsdom
 */

import { ConnectionContext } from "@/components/connection/connection-context";
import { Zookeeper } from "@/components/system-table-tab/zookeeper";
import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@tanstack/react-virtual", () => ({
  useVirtualizer: () => ({
    getTotalSize: () => 32,
    getVirtualItems: () => [
      {
        index: 0,
        size: 32,
        start: 0,
      },
    ],
  }),
}));

function getConnectionContextValue(connection: {
  query: (
    sql: string,
    options?: unknown
  ) => { response: Promise<{ data: { json: () => Promise<unknown> } }> };
}) {
  return {
    isConnectionAvailable: true,
    setIsConnectionAvailable: () => {},
    connection,
    pendingConfig: null,
    isInitialized: true,
    switchConnection: () => {},
    updateConnectionMetadata: () => {},
    commitConnection: () => {},
  };
}

describe("Zookeeper", () => {
  let container: HTMLDivElement;
  let root: Root;
  let consoleErrorSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    (
      globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }
    ).IS_REACT_ACT_ENVIRONMENT = true;
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
    consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => {
    act(() => {
      root.unmount();
    });
    container.remove();
    consoleErrorSpy.mockRestore();
    vi.restoreAllMocks();
  });

  it("does not auto-retry the root query after a failed initial load", async () => {
    const queryMock = vi.fn().mockReturnValue({
      response: Promise.reject(new Error("HTTP 500")),
    });

    const renderWithConnection = async () => {
      await act(async () => {
        root.render(
          <ConnectionContext.Provider
            value={getConnectionContextValue({ query: queryMock }) as never}
          >
            <Zookeeper database="system" table="zookeeper" />
          </ConnectionContext.Provider>
        );
      });
    };

    await renderWithConnection();

    await vi.waitFor(() => {
      expect(queryMock).toHaveBeenCalledTimes(1);
      expect(container.textContent).toContain("Failed to load ZooKeeper nodes");
    });

    act(() => {
      root.unmount();
    });
    root = createRoot(container);

    await renderWithConnection();

    expect(queryMock).toHaveBeenCalledTimes(1);

    const refreshButton = container.querySelector('button[title="Refresh"]');
    expect(refreshButton).not.toBeNull();

    await act(async () => {
      refreshButton?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });

    await vi.waitFor(() => {
      expect(queryMock).toHaveBeenCalledTimes(2);
    });
  });
});
