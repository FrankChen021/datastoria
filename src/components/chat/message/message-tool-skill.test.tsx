/**
 * @vitest-environment jsdom
 */

import type { AppUIMessage } from "@/lib/ai/ai-types";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { MessageToolSkill } from "./message-tool-skill";

function createToolPart(
  input: unknown,
  output = "# Skill Resource: vizlayer / reference/flowchart.md\n\ncontent",
  state = "input-available"
): AppUIMessage["parts"][0] {
  return {
    type: "dynamic-tool",
    toolName: "skill_resource",
    toolCallId: "skill-resource-1",
    state,
    input,
    output,
  } as unknown as AppUIMessage["parts"][0];
}

describe("MessageToolSkill", () => {
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

  it("shows requested resource paths in the header and tool body", () => {
    act(() => {
      root.render(
        <MessageToolSkill
          part={createToolPart({
            resources: [
              {
                skill: "vizlayer",
                paths: ["reference/flowchart.md", "reference/sequence-diagram.md"],
              },
            ],
          })}
          isRunning={false}
          label="Load Skill Resources"
        />
      );
    });

    expect(container.textContent).toContain("Load Skill Resources");
    expect(container.textContent).toContain("vizlayer | reference/flowchart.md");
    expect(container.textContent).toContain("vizlayer | reference/sequence-diagram.md");
    expect(container.textContent).toContain("input:");
  });

  it("shows requested skill names for the skill manual loader", () => {
    act(() => {
      root.render(
        <MessageToolSkill
          part={createToolPart({ names: ["vizlayer", "clickhouse-best-practices"] })}
          isRunning={false}
          label="Load Skill"
        />
      );
    });

    expect(container.textContent).toContain("Load Skill");
    expect(container.textContent).toContain("vizlayer");
    expect(container.textContent).toContain("clickhouse-best-practices");
    expect(container.textContent).toContain("input:");
  });

  it("ignores malformed skill resource entries without breaking rendering", () => {
    act(() => {
      root.render(
        <MessageToolSkill
          part={createToolPart({
            resources: [
              null,
              { skill: "vizlayer", paths: ["reference/flowchart.md", 123] },
              { skill: 42, paths: ["reference/class-diagram.md"] },
              { skill: "broken" },
            ],
          })}
          isRunning={false}
          label="Load Skill Resources"
        />
      );
    });

    expect(container.textContent).toContain("Load Skill Resources");
    expect(container.textContent).toContain("vizlayer | reference/flowchart.md");
    expect(container.textContent).not.toContain("reference/class-diagram.md");
  });

  it("falls back to the loaded manual name when input is empty", () => {
    act(() => {
      root.render(
        <MessageToolSkill
          part={createToolPart({}, "# Manual Loaded: clickhouse-best-practices\n\n# Guidelines")}
          isRunning={false}
          label="Load Skill"
        />
      );
    });

    expect(container.textContent).toContain("Load Skill");
    expect(container.textContent).toContain("clickhouse-best-practices");
    expect(container.textContent).not.toContain("input:");
  });
});
