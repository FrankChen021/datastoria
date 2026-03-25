/**
 * @vitest-environment jsdom
 */

import type { AppUIMessage } from "@/lib/ai/chat-types";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MessageToolExecuteSql } from "./message-tool-execute-sql";

const dataTableSpy = vi.fn();

vi.mock("@/components/shared/dashboard/data-table", () => ({
  DataTable: (props: unknown) => {
    dataTableSpy(props);
    return <div data-testid="execute-sql-data-table">mocked table</div>;
  },
}));

vi.mock("./message-markdown-sql", () => ({
  MessageMarkdownSql: ({ code }: { code: string }) => <div>{code}</div>,
}));

function createToolPart(output: {
  columns: Array<{ name: string; type: string }>;
  rows?: Array<Record<string, unknown>>;
  rowCount: number;
  sampleRow?: Record<string, unknown>;
  error?: string;
}): AppUIMessage["parts"][0] {
  return {
    type: "dynamic-tool",
    toolName: "execute_sql",
    toolCallId: "execute-sql-1",
    state: "done",
    input: { sql: "SELECT 1" },
    output,
  } as unknown as AppUIMessage["parts"][0];
}

describe("MessageToolExecuteSql", () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    (
      globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }
    ).IS_REACT_ACT_ENVIRONMENT = true;
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
    dataTableSpy.mockReset();
  });

  afterEach(() => {
    act(() => {
      root.unmount();
    });
    container.remove();
  });

  it("renders a DataTable for successful query results", () => {
    act(() => {
      root.render(
        <MessageToolExecuteSql
          part={createToolPart({
            columns: [{ name: "value", type: "UInt8" }],
            rows: [{ value: 1 }],
            rowCount: 1,
            sampleRow: { value: 1 },
          })}
          isRunning={false}
        />
      );
    });

    expect(container.textContent).toContain("output:");
    expect(container.querySelector('[data-testid="execute-sql-data-table"]')).not.toBeNull();

    expect(dataTableSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        data: [{ value: 1 }],
        meta: [{ name: "value", type: "UInt8" }],
        enableIndexColumn: true,
        enableCompactMode: true,
        pagination: {
          pageSize: 10,
          mode: "client",
        },
      })
    );
  });

  it("renders an empty success state when no rows are returned", () => {
    act(() => {
      root.render(
        <MessageToolExecuteSql
          part={createToolPart({
            columns: [{ name: "value", type: "UInt8" }],
            rows: [],
            rowCount: 0,
            sampleRow: {},
          })}
          isRunning={false}
        />
      );
    });

    expect(container.textContent).toContain("success: no data returned");
    expect(dataTableSpy).not.toHaveBeenCalled();
  });

  it("renders the error output when execution fails", () => {
    act(() => {
      root.render(
        <MessageToolExecuteSql
          part={createToolPart({
            columns: [],
            rows: [],
            rowCount: 0,
            sampleRow: {},
            error: "Syntax error near FROM",
          })}
          isRunning={false}
        />
      );
    });

    expect(container.textContent).toContain("Syntax error near FROM");
    expect(container.innerHTML).toContain("text-destructive");
    expect(dataTableSpy).not.toHaveBeenCalled();
  });
});
