import { describe, expect, it } from "vitest";
import { getExplainPlanEdgeLabel, parseExplainPlanResponse } from "./explain-plan-utils";

const samplePayload = JSON.stringify([
  {
    Plan: {
      "Node Type": "Expression",
      "Node Id": "Expression_7",
      Description: "(Project names + Projection)",
      Expression: {
        Inputs: [
          {
            Name: "count()",
            Type: "UInt64",
          },
          {
            Name: "__table1.author",
            Type: "LowCardinality(String)",
          },
        ],
        Actions: [
          {
            "Node Type": "INPUT",
            "Result Type": "UInt64",
            "Result Name": "count()",
            Arguments: [0],
            "Removed Arguments": [],
            Result: 0,
          },
        ],
        Outputs: [
          {
            Name: "author",
            Type: "LowCardinality(String)",
          },
        ],
        Positions: [0],
      },
      Plans: [
        {
          "Node Type": "Aggregating",
          "Node Id": "Aggregating_3",
          Keys: ["__table1.author"],
          Aggregates: [
            {
              Name: "count()",
              Function: {
                Name: "count",
                "Argument Types": [],
                "Result Type": "UInt64",
              },
              Arguments: [],
            },
          ],
          "Skip merging": false,
          Plans: [
            {
              "Node Type": "ReadFromMergeTree",
              "Node Id": "ReadFromMergeTree_0",
              Description: "git_clickhouse.commits",
              "Read Type": "Default",
              Parts: 1,
              Granules: 8,
              Indexes: [
                {
                  Type: "PrimaryKey",
                  Condition: "true",
                  "Initial Parts": 1,
                  "Selected Parts": 1,
                  "Initial Granules": 8,
                  "Selected Granules": 8,
                },
              ],
            },
          ],
        },
      ],
    },
  },
]);

describe("parseExplainPlanResponse", () => {
  it("parses the provided sample payload", () => {
    const result = parseExplainPlanResponse(samplePayload);

    expect(result.parseError).toBeUndefined();
    expect(result.rootNodes).toHaveLength(1);
    expect(result.nodeMap.size).toBe(3);

    const root = result.rootNodes[0];
    expect(root.id).toBe("Expression_7");
    expect(root.subtitle).toBe("on (Project names + Projection)");
    expect(root.expression?.actions).toHaveLength(1);

    const readNode = root.children[0]?.children[0];
    expect(readNode?.id).toBe("ReadFromMergeTree_0");
    expect(readNode?.subtitle).toBe("on git_clickhouse.commits");
    expect(readNode?.stats.parts).toBe(1);
    expect(readNode?.stats.granules).toBe(8);
    expect(readNode?.stats.indexCount).toBe(1);
    expect(readNode?.indexes[0]?.type).toBe("PrimaryKey");
    expect(getExplainPlanEdgeLabel(readNode!)).toBe("1 part / 8 granules");
  });

  it("parses a root object with Plan", () => {
    const result = parseExplainPlanResponse({
      Plan: {
        "Node Type": "ReadFromMergeTree",
        Description: "system.tables",
      },
    });

    expect(result.parseError).toBeUndefined();
    expect(result.rootNodes).toHaveLength(1);
    expect(result.rootNodes[0]?.subtitle).toBe("on system.tables");
  });

  it("creates a stable fallback node id when Node Id is missing", () => {
    const result = parseExplainPlanResponse({
      Plan: {
        "Node Type": "Expression",
        Plans: [
          {
            "Node Type": "ReadFromMergeTree",
            Description: "system.tables",
          },
        ],
      },
    });

    expect(result.parseError).toBeUndefined();
    expect(result.rootNodes[0]?.id).toBe("Expression_root.0");
    expect(result.rootNodes[0]?.children[0]?.id).toBe("ReadFromMergeTree_root.0.0");
  });

  it("handles nodes without Plans", () => {
    const result = parseExplainPlanResponse({
      Plan: {
        "Node Type": "ReadFromMergeTree",
        Description: "system.tables",
      },
    });

    expect(result.parseError).toBeUndefined();
    expect(result.rootNodes[0]?.children).toEqual([]);
  });

  it("returns a parse error for malformed JSON", () => {
    const result = parseExplainPlanResponse("{not valid json");

    expect(result.rootNodes).toEqual([]);
    expect(result.parseError).toBe("The EXPLAIN PLAN response is not valid JSON.");
  });

  it("returns a parse error for empty payload", () => {
    const result = parseExplainPlanResponse("");

    expect(result.rootNodes).toEqual([]);
    expect(result.parseError).toBe("No plan data returned.");
  });
});
