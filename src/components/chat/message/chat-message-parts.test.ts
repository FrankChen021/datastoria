import type { AppUIMessage } from "@/lib/ai/ai-types";
import { describe, expect, it } from "vitest";
import { getToolGroupState, groupRenderableParts } from "./chat-message-parts";

function createToolPart(
  toolName: string,
  toolCallId: string,
  state = "output-available",
  output: unknown = { success: true }
): AppUIMessage["parts"][0] {
  return {
    type: "dynamic-tool",
    toolName,
    toolCallId,
    state,
    input: {},
    output,
  } as unknown as AppUIMessage["parts"][0];
}

describe("chat message part grouping", () => {
  it("collapses consecutive tool calls when later content follows", () => {
    const groups = groupRenderableParts([
      createToolPart("skill", "skill-1"),
      createToolPart("validate_sql", "validate-1"),
      createToolPart("execute_sql", "execute-1"),
      { type: "text", text: "What the query does" },
    ]);

    expect(groups).toHaveLength(2);
    expect(groups[0]).toMatchObject({ type: "tool-group", startIndex: 0 });
    expect(groups[0].type === "tool-group" ? groups[0].parts : []).toHaveLength(3);
    expect(groups[1]).toMatchObject({ type: "part", index: 3 });
  });

  it("ignores invisible stream separators between visually consecutive tool calls", () => {
    const groups = groupRenderableParts([
      createToolPart("skill", "skill-1"),
      { type: "step-start" } as unknown as AppUIMessage["parts"][0],
      { type: "reasoning", text: "" } as unknown as AppUIMessage["parts"][0],
      createToolPart("skill", "skill-2"),
      createToolPart("skill_resource", "skill-resource-1"),
      { type: "step-start" } as unknown as AppUIMessage["parts"][0],
      { type: "reasoning", text: "   " } as unknown as AppUIMessage["parts"][0],
      createToolPart("get_tables", "get-tables-1"),
      createToolPart("validate_sql", "validate-1"),
      { type: "text", text: "Here's what the query does:" },
    ]);

    expect(groups).toHaveLength(2);
    expect(groups[0]).toMatchObject({ type: "tool-group", startIndex: 0 });
    expect(groups[0].type === "tool-group" ? groups[0].parts : []).toHaveLength(5);
    expect(groups[1]).toMatchObject({ type: "part", index: 9 });
  });

  it("keeps trailing consecutive tool calls visible when no later content exists", () => {
    const groups = groupRenderableParts([
      { type: "text", text: "Checking the query" },
      { type: "step-start" } as unknown as AppUIMessage["parts"][0],
      createToolPart("validate_sql", "validate-1"),
      { type: "reasoning", text: "" } as unknown as AppUIMessage["parts"][0],
      { type: "step-start" } as unknown as AppUIMessage["parts"][0],
      createToolPart("execute_sql", "execute-1"),
    ]);

    expect(groups).toHaveLength(3);
    expect(groups.map((group) => group.type)).toEqual(["part", "part", "part"]);
  });

  it("marks a grouped tool run as failed when any tool failed", () => {
    const state = getToolGroupState([
      createToolPart("validate_sql", "validate-1"),
      createToolPart("execute_sql", "execute-1", "output-error", { error: "bad sql" }),
    ]);

    expect(state).toEqual({ state: "output-error", success: false });
  });
});
