/**
 * @vitest-environment jsdom
 */

import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  ChatInputSuggestions,
  type ChatInputSuggestionItem,
  type ChatInputSuggestionsType,
} from "./chat-input-suggestions";

describe("ChatInputSuggestions", () => {
  let container: HTMLDivElement;
  let root: Root;
  let ref: React.RefObject<ChatInputSuggestionsType | null>;

  const tableSuggestion: ChatInputSuggestionItem = {
    name: "query_log",
    type: "table",
    description: <div>table description</div>,
    search: "query_log",
    group: "system",
    badge: "MergeTree",
  };

  const databaseSuggestion: ChatInputSuggestionItem = {
    name: "analytics",
    type: "database",
    description: <div>database description</div>,
    search: "analytics Atomic",
    group: "Atomic",
  };

  const settingSuggestion: ChatInputSuggestionItem = {
    name: "max_threads",
    type: "setting",
    description: <div>setting description</div>,
    search: "max_threads Controls query threads",
    group: "settings",
  };

  beforeEach(() => {
    (
      globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }
    ).IS_REACT_ACT_ENVIRONMENT = true;
    vi.stubGlobal(
      "ResizeObserver",
      class ResizeObserver {
        observe() {}
        unobserve() {}
        disconnect() {}
      }
    );
    vi.stubGlobal("HTMLElement", HTMLElement);
    HTMLElement.prototype.scrollIntoView = vi.fn();
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
    ref = React.createRef<ChatInputSuggestionsType>();
  });

  afterEach(() => {
    if (root) {
      act(() => {
        root.unmount();
      });
    }
    vi.unstubAllGlobals();
    container?.remove();
  });

  it("opens in the groups view by default and can navigate with ArrowRight", () => {
    act(() => {
      root.render(
        <ChatInputSuggestions
          ref={ref}
          onSelect={vi.fn()}
          suggestions={{
            databases: [databaseSuggestion],
            tables: [tableSuggestion],
            settings: [settingSuggestion],
          }}
        />
      );
    });

    act(() => {
      ref.current?.open("");
    });

    expect(document.body.textContent).toContain("Databases");
    expect(document.body.textContent).toContain("Tables");
    expect(document.body.textContent).toContain("Settings");
    expect(ref.current?.getSelectedIndex()).toBe(-1);

    act(() => {
      ref.current?.handleKeyDown({
        key: "ArrowDown",
        preventDefault() {},
        stopPropagation() {},
      } as React.KeyboardEvent);
    });

    act(() => {
      ref.current?.handleKeyDown({
        key: "ArrowDown",
        preventDefault() {},
        stopPropagation() {},
      } as React.KeyboardEvent);
    });

    act(() => {
      ref.current?.handleKeyDown({
        key: "ArrowDown",
        preventDefault() {},
        stopPropagation() {},
      } as React.KeyboardEvent);
    });

    act(() => {
      ref.current?.handleKeyDown({
        key: "ArrowRight",
        preventDefault() {},
        stopPropagation() {},
      } as React.KeyboardEvent);
    });

    expect(document.body.textContent).toContain("max_threads");
    expect(document.body.textContent).toContain("setting description");

    act(() => {
      ref.current?.handleKeyDown({
        key: "ArrowDown",
        preventDefault() {},
        stopPropagation() {},
      } as React.KeyboardEvent);
    });

    expect(document.body.textContent).toContain("setting description");
  });

  it("filters settings by name instead of description keywords", () => {
    const unrelatedSetting: ChatInputSuggestionItem = {
      name: "apply_deleted_mask",
      type: "setting",
      description: <div>description mentioning filter</div>,
      search: "apply_deleted_mask description mentioning filter",
      group: "server_settings",
    };

    act(() => {
      root.render(
        <ChatInputSuggestions
          ref={ref}
          onSelect={vi.fn()}
          suggestions={{
            databases: [databaseSuggestion],
            tables: [tableSuggestion],
            settings: [settingSuggestion, unrelatedSetting],
          }}
        />
      );
    });

    act(() => {
      ref.current?.open("max");
    });

    expect(document.body.textContent).toContain("Settings");

    act(() => {
      ref.current?.handleKeyDown({
        key: "ArrowRight",
        preventDefault() {},
        stopPropagation() {},
      } as React.KeyboardEvent);
    });

    expect(document.body.textContent).not.toContain("apply_deleted_mask");
    expect(document.body.textContent).toContain("max_threads");
  });

  it("uses ArrowRight to enter the matched group when query narrows the group list", () => {
    act(() => {
      root.render(
        <ChatInputSuggestions
          ref={ref}
          onSelect={vi.fn()}
          suggestions={{
            databases: [databaseSuggestion],
            tables: [tableSuggestion],
            settings: [settingSuggestion],
          }}
        />
      );
    });

    act(() => {
      ref.current?.open("thread");
    });

    expect(document.body.textContent).toContain("Settings");
    expect(document.body.textContent).not.toContain("Databases");

    act(() => {
      ref.current?.handleKeyDown({
        key: "ArrowRight",
        preventDefault() {},
        stopPropagation() {},
      } as React.KeyboardEvent);
    });

    expect(document.body.textContent).toContain("max_threads");
    expect(document.body.textContent).toContain("setting description");

    act(() => {
      ref.current?.handleKeyDown({
        key: "ArrowDown",
        preventDefault() {},
        stopPropagation() {},
      } as React.KeyboardEvent);
    });

    expect(document.body.textContent).toContain("setting description");
  });

  it("keeps the current group open when the query updates while suggestions are open", () => {
    act(() => {
      root.render(
        <ChatInputSuggestions
          ref={ref}
          onSelect={vi.fn()}
          suggestions={{
            databases: [databaseSuggestion],
            tables: [tableSuggestion],
            settings: [settingSuggestion],
          }}
        />
      );
    });

    act(() => {
      ref.current?.open("max");
    });

    act(() => {
      ref.current?.handleKeyDown({
        key: "ArrowRight",
        preventDefault() {},
        stopPropagation() {},
      } as React.KeyboardEvent);
    });

    expect(document.body.textContent).toContain("max_threads");
    expect(document.body.textContent).not.toContain("Databases");

    act(() => {
      ref.current?.open("max_t");
    });

    expect(document.body.textContent).toContain("max_threads");
    expect(document.body.textContent).not.toContain("Databases");
    expect(document.body.textContent).not.toContain("Tables803");
  });
});
