/**
 * @vitest-environment jsdom
 */

import { act } from "react";
import { createPortal } from "react-dom";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MessageMarkdown } from "./message-markdown";

const vizlayerSpy = vi.fn();
const syntaxHighlighterSpy = vi.fn();
const openNodeTabButtonSpy = vi.fn();
const mockConnectionState: {
  connection: { metadata?: { hostNames?: Set<string> } } | null;
} = {
  connection: null,
};
const mockSettingsState = {
  settings: [] as Array<{
    name: string;
    type: string;
    description: string;
    value: string;
    readonly: boolean | null;
    source: string;
  }>,
  settingsByName: new Map<
    string,
    {
      name: string;
      type: string;
      description: string;
      value: string;
      readonly: boolean | null;
      source: string;
    }
  >(),
  isLoading: false,
};

vi.mock("@/components/connection/connection-context", () => ({
  useConnection: () => mockConnectionState,
}));

vi.mock("@/components/settings/settings-dialog", () => ({
  showSettingsDialog: vi.fn(),
}));

vi.mock("@/components/chat/use-clickhouse-settings", () => ({
  useClickHouseSettings: () => mockSettingsState,
}));

vi.mock("@/components/table-tab/open-database-tab-button", () => ({
  OpenDatabaseTabButton: () => null,
}));

vi.mock("@/components/table-tab/open-table-tab-button", () => ({
  OpenTableTabButton: () => null,
}));

vi.mock("@/components/node-tab/open-node-tab-button", () => ({
  OpenNodeTabButton: (props: unknown) => {
    openNodeTabButtonSpy(props);
    return null;
  },
}));

vi.mock("@/components/ui/button", () => ({
  Button: ({ children }: { children?: React.ReactNode }) => (
    <button type="button">{children}</button>
  ),
}));

vi.mock("@/components/ui/hover-card", () => ({
  HoverCard: ({ children }: { children?: React.ReactNode }) => <>{children}</>,
  HoverCardContent: ({ children }: { children?: React.ReactNode }) =>
    createPortal(<>{children}</>, document.body),
  HoverCardTrigger: ({ children }: { children?: React.ReactNode }) => <>{children}</>,
}));

vi.mock("@/components/shared/themed-syntax-highlighter", () => ({
  ThemedSyntaxHighlighter: (props: unknown) => {
    syntaxHighlighterSpy(props);
    return null;
  },
}));

vi.mock("./message-markdown-chat", () => ({
  MessageMarkdownChartSpec: () => null,
}));

vi.mock("./message-markdown-sql", () => ({
  MessageMarkdownSql: () => null,
}));

vi.mock("./message-markdown-vizlayer", () => ({
  MessageMarkdownVizlayer: (props: unknown) => {
    vizlayerSpy(props);
    return null;
  },
}));

describe("MessageMarkdown", () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    (
      globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }
    ).IS_REACT_ACT_ENVIRONMENT = true;
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
    vizlayerSpy.mockReset();
    syntaxHighlighterSpy.mockReset();
    openNodeTabButtonSpy.mockReset();
    mockConnectionState.connection = null;
    mockSettingsState.settings = [];
    mockSettingsState.settingsByName = new Map();
  });

  afterEach(() => {
    act(() => {
      root.unmount();
    });
    container.remove();
  });

  it("renders Mermaid fences as plain code blocks", () => {
    act(() => {
      root.render(<MessageMarkdown text={"```mermaid\nflowchart TD\nA --> B\n```"} />);
    });

    expect(vizlayerSpy).not.toHaveBeenCalled();
    expect(container.textContent).toContain("flowchart TD");
    expect(container.textContent).toContain("A --> B");
  });

  it("renders LaTeX inline math from backslash delimiters", () => {
    act(() => {
      root.render(
        <MessageMarkdown text={"Average is \\(\\text{sum(bytes_on_disk)} / \\text{sum(rows)}\\)"} />
      );
    });

    expect(container.querySelector(".katex")).not.toBeNull();
    expect(container.querySelector(".katex-display")).toBeNull();
  });

  it("renders LaTeX display math from backslash delimiters", () => {
    act(() => {
      root.render(
        <MessageMarkdown
          text={
            "\\[\n\\text{avg_row_size} = \\frac{\\text{sum(bytes_on_disk)}}{\\text{sum(rows)}}\n\\]"
          }
        />
      );
    });

    expect(container.querySelector(".katex-display")).not.toBeNull();
    expect(container.querySelector(".katex")).not.toBeNull();
  });

  it("preserves surrounding list structure when display math appears inside a bullet", () => {
    act(() => {
      root.render(
        <MessageMarkdown
          text={`2. **Calculates Metrics**:
- **\`avg_row_size\`**: The average size of a single row in bytes, calculated as:
  \\[
  \\text{avg_row_size} = \\frac{\\text{sum(bytes_on_disk)}}{\\text{sum(rows)}}
  \\]
- **\`sum(bytes_on_disk)\`**: The total disk space used by the active parts of the table.
- **\`sum(rows)\`**: The total number of rows in the active parts of the table.`}
        />
      );
    });

    expect(container.querySelector(".katex-display")).not.toBeNull();
    expect(container.querySelector(".katex-error")).toBeNull();
    expect(container.textContent).toContain(
      "The total disk space used by the active parts of the table."
    );
    expect(container.textContent).toContain(
      "The total number of rows in the active parts of the table."
    );
    expect(container.textContent).not.toContain("undefined");
  });

  it("normalizes display math in lists into a standalone markdown block", async () => {
    const { normalizeMathMarkdown } = await import("./message-markdown-math");
    const normalized = normalizeMathMarkdown(`- item:
  \\[
  x = y
  \\]
- next`);

    expect(normalized).toContain(`- item:\n\n  $$\n  x = y\n  $$\n\n- next`);
  });

  it("does not parse LaTeX delimiters inside fenced code blocks", () => {
    act(() => {
      root.render(<MessageMarkdown text={"```text\n\\[\n\\text{avg_row_size}\n\\]\n```"} />);
    });

    expect(container.querySelector(".katex")).toBeNull();
    expect(syntaxHighlighterSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        language: "text",
        children: "\\[\n\\text{avg_row_size}\n\\]",
      })
    );
  });

  it("does not parse LaTeX delimiters inside tilde-fenced code blocks", () => {
    act(() => {
      root.render(<MessageMarkdown text={"~~~text\n\\[\n\\text{avg_row_size}\n\\]\n~~~"} />);
    });

    expect(container.querySelector(".katex")).toBeNull();
    expect(syntaxHighlighterSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        language: "text",
        children: "\\[\n\\text{avg_row_size}\n\\]",
      })
    );
  });

  it("routes non-sql fenced code blocks to the themed syntax highlighter", () => {
    act(() => {
      root.render(<MessageMarkdown text={"```cpp\nint main() {}\n```"} />);
    });

    expect(syntaxHighlighterSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        language: "cpp",
        children: "int main() {}",
      })
    );
  });

  it("routes unified vizlayer fences to the Vizlayer renderer", () => {
    act(() => {
      root.render(
        <MessageMarkdown
          text={`\`\`\`vizlayer\n{"kind":"flowchart","document":{"title":"Example"}}\n\`\`\``}
        />
      );
    });

    expect(vizlayerSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        spec: '{"kind":"flowchart","document":{"title":"Example"}}\n',
      })
    );
  });

  it("does not route legacy vizlayer family fences anymore", () => {
    act(() => {
      root.render(
        <MessageMarkdown text={`\`\`\`vizlayer-flowchart\n{"title":"Example"}\n\`\`\``} />
      );
    });

    expect(vizlayerSpy).not.toHaveBeenCalled();
    expect(syntaxHighlighterSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        language: "vizlayer-flowchart",
        children: '{"title":"Example"}',
      })
    );
  });

  it("routes inline node names to the open node tab button", () => {
    mockConnectionState.connection = {
      metadata: {
        hostNames: new Set(["node-a"]),
      },
    };

    act(() => {
      root.render(<MessageMarkdown text={"Node `node-a` is hot"} />);
    });

    expect(openNodeTabButtonSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        host: "node-a",
      })
    );
  });

  it("renders known ClickHouse settings as hoverable inline code", () => {
    const setting = {
      name: "max_threads",
      type: "UInt64",
      description: "Controls the maximum number of query execution threads.",
      value: "8",
      readonly: false,
      source: "settings",
    };
    mockSettingsState.settings = [setting];
    mockSettingsState.settingsByName = new Map([["max_threads", setting]]);

    act(() => {
      root.render(<MessageMarkdown text={"Use `max_threads` for this query"} />);
    });

    expect(container.textContent).toContain("max_threads");
    expect(document.body.textContent).toContain("UInt64");
    expect(document.body.textContent).toContain("ReadOnly");
    expect(document.body.textContent).toContain("No");
    expect(document.body.textContent).toContain(
      "Controls the maximum number of query execution threads."
    );
    expect(document.body.textContent).toContain("8");
  });
});
