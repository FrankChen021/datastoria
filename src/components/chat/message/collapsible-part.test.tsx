/**
 * @vitest-environment jsdom
 */

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { CollapsiblePart, Timer } from "./collapsible-part";

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
    vi.useRealTimers();
    container.remove();
  });

  it("shows whole-second timer updates after the first second", () => {
    vi.useFakeTimers();
    vi.setSystemTime(0);

    act(() => {
      root.render(<Timer isRunning />);
    });

    expect(container.querySelector("span")).toBeNull();
    expect(container.textContent).toBe("");

    act(() => {
      vi.advanceTimersByTime(999);
    });

    expect(container.querySelector("span")).toBeNull();
    expect(container.textContent).toBe("");

    act(() => {
      vi.advanceTimersByTime(1);
    });

    expect(container.querySelector("span")?.className).toContain("min-w-[3ch]");
    expect(container.textContent).toBe("1s");

    act(() => {
      vi.advanceTimersByTime(1000);
    });

    expect(container.textContent).toBe("2s");
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

    const header = container.querySelector('button[aria-expanded="false"]');
    expect(header).not.toBeNull();

    act(() => {
      header!.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });

    expect(header?.getAttribute("aria-expanded")).toBe("true");
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
