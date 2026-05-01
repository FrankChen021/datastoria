/**
 * @vitest-environment jsdom
 */

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { CollapsiblePart } from "./collapsible-part";

describe("CollapsiblePart", () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
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

  it("does not reset manual expansion on state changes when incomplete auto-expansion is disabled", () => {
    act(() => {
      root.render(
        <CollapsiblePart
          toolName="2 tool calls"
          state="input-available"
          isRunning={false}
          expandIncomplete={false}
        >
          <div>Grouped tool call details</div>
        </CollapsiblePart>
      );
    });

    expect(container.textContent).not.toContain("Grouped tool call details");

    const header = container.querySelector(".cursor-pointer");
    expect(header).not.toBeNull();

    act(() => {
      header!.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });

    expect(container.textContent).toContain("Grouped tool call details");

    act(() => {
      root.render(
        <CollapsiblePart
          toolName="2 tool calls"
          state="output-available"
          isRunning={false}
          expandIncomplete={false}
        >
          <div>Grouped tool call details</div>
        </CollapsiblePart>
      );
    });

    expect(container.textContent).toContain("Grouped tool call details");
  });
});
