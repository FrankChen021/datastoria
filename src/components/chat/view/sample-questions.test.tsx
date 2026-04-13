/**
 * @vitest-environment jsdom
 */

import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SampleQuestions } from "./sample-questions";

const testGlobal = globalThis as typeof globalThis & {
  IS_REACT_ACT_ENVIRONMENT?: boolean;
};

const useAgentCommandsMock = vi.fn();

vi.mock("../agent-command-context", () => ({
  useAgentCommands: () => useAgentCommandsMock(),
}));

describe("SampleQuestions", () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    testGlobal.IS_REACT_ACT_ENVIRONMENT = true;

    vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => {
      callback(0);
      return 0;
    });

    window.innerWidth = 1280;
    window.matchMedia = vi.fn().mockImplementation((query: string) => ({
      matches: query.includes("767px") ? window.innerWidth <= 767 : false,
      media: query,
      onchange: null,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      addListener: vi.fn(),
      removeListener: vi.fn(),
      dispatchEvent: vi.fn(),
    }));

    HTMLElement.prototype.scrollTo = vi.fn();
    Element.prototype.scrollIntoView = vi.fn();

    container = document.createElement("div");
    container.setAttribute("data-sample-questions-scroll-root", "true");
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => {
      root.unmount();
    });
    container.remove();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it("filters questions that require unavailable skills", () => {
    useAgentCommandsMock.mockReturnValue({
      commands: [],
      loading: false,
    });

    act(() => {
      root.render(<SampleQuestions onQuestionClick={vi.fn()} />);
    });

    expect(container.textContent).toContain("What are the best practices for partitioning?");
    expect(container.textContent).not.toContain("How does async_insert work from the source code?");
  });

  it("scrolls to the selected group section from the desktop sidebar", () => {
    useAgentCommandsMock.mockReturnValue({
      commands: [{ skillId: "source-code-inspection" }],
      loading: false,
    });

    act(() => {
      root.render(<SampleQuestions onQuestionClick={vi.fn()} />);
    });

    const navButton = Array.from(container.querySelectorAll("button")).find(
      (button) => button.textContent?.trim() === "Visualization"
    );

    expect(navButton).toBeTruthy();

    act(() => {
      navButton?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });

    expect(Element.prototype.scrollIntoView).toHaveBeenCalled();
  });

  it("marks the first visible group active near the bottom of the pane", () => {
    useAgentCommandsMock.mockReturnValue({
      commands: [{ skillId: "source-code-inspection" }],
      loading: false,
    });

    act(() => {
      root.render(<SampleQuestions onQuestionClick={vi.fn()} />);
    });

    const rightPane = container.querySelector(
      "[data-sample-questions-right-pane='true']"
    ) as HTMLDivElement | null;
    const sections = Array.from(container.querySelectorAll("section"));

    expect(rightPane).toBeTruthy();
    expect(sections.length).toBeGreaterThan(0);

    Object.defineProperties(rightPane!, {
      scrollTop: {
        configurable: true,
        writable: true,
        value: 500,
      },
      clientHeight: {
        configurable: true,
        value: 300,
      },
      scrollHeight: {
        configurable: true,
        value: 800,
      },
    });

    rightPane!.getBoundingClientRect = vi.fn(() => ({
      top: 0,
      bottom: 300,
      left: 0,
      right: 0,
      width: 0,
      height: 300,
      x: 0,
      y: 0,
      toJSON: () => ({}),
    }));

    [0, 140, 280, 420, 540, 620].forEach((offsetTop, index) => {
      Object.defineProperty(sections[index], "offsetTop", {
        configurable: true,
        value: offsetTop,
      });
      Object.defineProperty(sections[index], "offsetHeight", {
        configurable: true,
        value: 120,
      });
      sections[index].getBoundingClientRect = vi.fn(() => ({
        top: offsetTop - 500,
        bottom: offsetTop - 500 + 120,
        left: 0,
        right: 0,
        width: 0,
        height: 120,
        x: 0,
        y: offsetTop - 500,
        toJSON: () => ({}),
      }));
    });

    act(() => {
      rightPane?.dispatchEvent(new Event("scroll", { bubbles: true }));
    });

    const generalButton = Array.from(container.querySelectorAll("button")).find(
      (button) => button.textContent?.trim() === "SQL Optimization"
    );

    expect(generalButton?.className).toContain("bg-muted/40");
  });

  it("marks SQL Generation active when it becomes the first visible group", () => {
    useAgentCommandsMock.mockReturnValue({
      commands: [{ skillId: "source-code-inspection" }],
      loading: false,
    });

    act(() => {
      root.render(<SampleQuestions onQuestionClick={vi.fn()} />);
    });

    const rightPane = container.querySelector(
      "[data-sample-questions-right-pane='true']"
    ) as HTMLDivElement | null;
    const sections = Array.from(container.querySelectorAll("section"));

    expect(rightPane).toBeTruthy();

    Object.defineProperties(rightPane!, {
      scrollTop: {
        configurable: true,
        writable: true,
        value: 560,
      },
      clientHeight: {
        configurable: true,
        value: 260,
      },
      scrollHeight: {
        configurable: true,
        value: 900,
      },
    });

    rightPane!.getBoundingClientRect = vi.fn(() => ({
      top: 0,
      bottom: 260,
      left: 0,
      right: 0,
      width: 0,
      height: 260,
      x: 0,
      y: 0,
      toJSON: () => ({}),
    }));

    [0, 140, 280, 420, 560, 700].forEach((offsetTop, index) => {
      Object.defineProperty(sections[index], "offsetTop", {
        configurable: true,
        value: offsetTop,
      });
      Object.defineProperty(sections[index], "offsetHeight", {
        configurable: true,
        value: 110,
      });
      sections[index].getBoundingClientRect = vi.fn(() => ({
        top: offsetTop - 560,
        bottom: offsetTop - 560 + 110,
        left: 0,
        right: 0,
        width: 0,
        height: 110,
        x: 0,
        y: offsetTop - 560,
        toJSON: () => ({}),
      }));
    });

    act(() => {
      rightPane?.dispatchEvent(new Event("scroll", { bubbles: true }));
    });

    const sqlGenerationButton = Array.from(container.querySelectorAll("button")).find(
      (button) => button.textContent?.trim() === "SQL Generation"
    );

    expect(sqlGenerationButton?.className).toContain("bg-muted/40");
  });
});
