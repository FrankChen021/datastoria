/**
 * @vitest-environment jsdom
 */

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MessageMarkdown } from "./message-markdown";

const vizlayerSpy = vi.fn();

vi.mock("@/components/connection/connection-context", () => ({
  useConnection: () => ({ connection: null }),
}));

vi.mock("@/components/settings/settings-dialog", () => ({
  showSettingsDialog: vi.fn(),
}));

vi.mock("@/components/table-tab/open-database-tab-button", () => ({
  OpenDatabaseTabButton: () => null,
}));

vi.mock("@/components/table-tab/open-table-tab-button", () => ({
  OpenTableTabButton: () => null,
}));

vi.mock("@/components/ui/button", () => ({
  Button: ({ children }: { children?: React.ReactNode }) => (
    <button type="button">{children}</button>
  ),
}));

vi.mock("@/components/ui/hover-card", () => ({
  HoverCard: ({ children }: { children?: React.ReactNode }) => <>{children}</>,
  HoverCardContent: ({ children }: { children?: React.ReactNode }) => <>{children}</>,
  HoverCardTrigger: ({ children }: { children?: React.ReactNode }) => <>{children}</>,
}));

vi.mock("./file-reference-utils", () => ({
  buildCodeViewerUrl: () => "#",
  replaceReferenceTokens: (text: string) => text,
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

vi.mock("./message-user-actions", () => ({
  MessageMarkdownUserActions: () => null,
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
        spec: '{"kind":"flowchart","document":{"title":"Example"}}',
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
    expect(container.textContent).toContain('{"title":"Example"}');
  });
});
