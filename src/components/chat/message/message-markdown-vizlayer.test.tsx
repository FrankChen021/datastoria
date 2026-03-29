/**
 * @vitest-environment jsdom
 */

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MessageMarkdownVizlayer } from "./message-markdown-vizlayer";

const copyButtonSpy = vi.fn();
const toChartSpecSpy = vi.fn();
const parseVizlayerSpecSpy = vi.fn();

vi.mock("@/components/shared/dashboard/use-is-dark-theme", () => ({
  default: () => false,
}));

vi.mock("@/components/ui/copy-button", () => ({
  CopyButton: (props: unknown) => {
    copyButtonSpy(props);
    return null;
  },
}));

vi.mock("@vizlayer/react", async () => {
  const actual = await vi.importActual<typeof import("@vizlayer/react")>("@vizlayer/react");

  return {
    ...actual,
    VizlayerDiagram: () => null,
    toChartSpec: (props: unknown) => toChartSpecSpy(props),
    VizlayerSpecParser: {
      ...actual.VizlayerSpecParser,
      parseVizlayerSpec: (spec: string) => {
        parseVizlayerSpecSpy(spec);
        return actual.VizlayerSpecParser.parseVizlayerSpec(spec);
      },
    },
  };
});

describe("MessageMarkdownVizlayer", () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    (
      globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }
    ).IS_REACT_ACT_ENVIRONMENT = true;
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
    copyButtonSpy.mockReset();
    toChartSpecSpy.mockReset();
    parseVizlayerSpecSpy.mockReset();
  });

  afterEach(() => {
    act(() => {
      root.unmount();
    });
    container.remove();
  });

  it("copies generated Mermaid text for unified vizlayer payloads", () => {
    toChartSpecSpy.mockReturnValue("flowchart TD\n  a --> b");

    act(() => {
      root.render(
        <MessageMarkdownVizlayer spec='{"kind":"flowchart","document":{"direction":"TD","nodes":[{"id":"a","label":"A"},{"id":"b","label":"B"}],"edges":[{"from":"a","to":"b"}]}}' />
      );
    });

    expect(parseVizlayerSpecSpy).toHaveBeenCalledWith(
      '{"kind":"flowchart","document":{"direction":"TD","nodes":[{"id":"a","label":"A"},{"id":"b","label":"B"}],"edges":[{"from":"a","to":"b"}]}}'
    );
    expect(toChartSpecSpy).toHaveBeenCalledWith({
      kind: "flowchart",
      document: {
        direction: "TD",
        nodes: [
          { id: "a", label: "A" },
          { id: "b", label: "B" },
        ],
        edges: [{ from: "a", to: "b" }],
      },
    });
    expect(copyButtonSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        value: "flowchart TD\n  a --> b",
        title: "Copy Mermaid code",
        "aria-label": "Copy Mermaid code",
      })
    );
  });

  it("parses unified vizlayer payloads and maps their kind", () => {
    toChartSpecSpy.mockReturnValue("sequenceDiagram\nuser->>agent: request");

    act(() => {
      root.render(
        <MessageMarkdownVizlayer spec='{"kind":"sequenceDiagram","document":{"participants":[{"id":"user","label":"User"},{"id":"agent","label":"Agent"}],"messages":[{"from":"user","to":"agent","text":"request"}]}}' />
      );
    });

    expect(toChartSpecSpy).toHaveBeenCalledWith({
      kind: "sequenceDiagram",
      document: {
        participants: [
          { id: "user", label: "User" },
          { id: "agent", label: "Agent" },
        ],
        messages: [{ from: "user", to: "agent", text: "request" }],
      },
    });
    expect(copyButtonSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        value: "sequenceDiagram\nuser->>agent: request",
        title: "Copy Mermaid code",
      })
    );
  });

  it("keeps copying raw Vizlayer JSON when parsing fails", () => {
    act(() => {
      root.render(<MessageMarkdownVizlayer spec='{"kind":"flowchart"' />);
    });

    expect(parseVizlayerSpecSpy).toHaveBeenCalledWith('{"kind":"flowchart"');
    expect(toChartSpecSpy).not.toHaveBeenCalled();
    expect(copyButtonSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        value: '{"kind":"flowchart"',
        title: "Copy Vizlayer JSON",
        "aria-label": "Copy Vizlayer JSON",
      })
    );
    expect(container.textContent).toContain("Vizlayer payload is still streaming.");
    expect(container.textContent).toContain('{"kind":"flowchart"');
  });

  it("parses complete payloads with trailing whitespace after the closing brace", () => {
    toChartSpecSpy.mockReturnValue("flowchart TD\n  a --> b");

    act(() => {
      root.render(
        <MessageMarkdownVizlayer
          spec={
            '{"kind":"flowchart","document":{"direction":"TD","nodes":[{"id":"a","label":"A"},{"id":"b","label":"B"}],"edges":[{"from":"a","to":"b"}]}}\n  '
          }
        />
      );
    });

    expect(parseVizlayerSpecSpy).toHaveBeenCalledOnce();
    expect(toChartSpecSpy).toHaveBeenCalledWith({
      kind: "flowchart",
      document: {
        direction: "TD",
        nodes: [
          { id: "a", label: "A" },
          { id: "b", label: "B" },
        ],
        edges: [{ from: "a", to: "b" }],
      },
    });
  });

  it("shows an error for unified vizlayer payloads without kind", () => {
    act(() => {
      root.render(<MessageMarkdownVizlayer spec='{"document":{"title":"Example"}}' />);
    });

    expect(toChartSpecSpy).not.toHaveBeenCalled();
    expect(copyButtonSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        value: '{"document":{"title":"Example"}}',
        title: "Copy Vizlayer JSON",
      })
    );
    expect(container.textContent).toContain(
      "Unified Vizlayer payloads must include `kind` set to `flowchart`, `sequenceDiagram`, or `classDiagram`."
    );
    expect(container.textContent).toContain('{"document":{"title":"Example"}}');
  });

  it("shows an error for flowchart-like objects without the unified envelope", () => {
    act(() => {
      root.render(<MessageMarkdownVizlayer spec='{"direction":"TD","nodes":[],"edges":[]}' />);
    });

    expect(toChartSpecSpy).not.toHaveBeenCalled();
    expect(copyButtonSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        value: '{"direction":"TD","nodes":[],"edges":[]}',
        title: "Copy Vizlayer JSON",
      })
    );
    expect(container.textContent).toContain(
      "Unified Vizlayer payloads must include `kind` set to `flowchart`, `sequenceDiagram`, or `classDiagram`."
    );
    expect(container.textContent).toContain('{"direction":"TD","nodes":[],"edges":[]}');
  });
});
