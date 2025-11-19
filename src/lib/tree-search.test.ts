import { describe, expect, it } from "vitest";
import type { TreeDataItem } from "@/components/ui/tree";
import { searchTree } from "./tree-search";

/**
 * Helper function to create a tree node
 */
function createNode(
  id: string,
  labelContent: string,
  children?: TreeDataItem[]
): TreeDataItem {
  return {
    id,
    labelContent,
    search: labelContent.toLowerCase(),
    children,
  };
}

/**
 * Helper function to extract the structure of search results (without React nodes)
 * This makes assertions easier to read and write
 */
function getStructure(
  nodes: TreeDataItem[]
): Array<{ labelContent: string; expanded: boolean; children?: ReturnType<typeof getStructure> }> {
  return nodes.map((node) => {
    // Extract original text - for non-highlighted nodes it's the labelContent itself,
    // for highlighted nodes we reconstruct from the React element or use the search field
    let labelText: string;
    if (typeof node.labelContent === "string") {
      labelText = node.labelContent;
    } else if (node._originalLabel) {
      // @ts-expect-error - _originalLabel is added by search function for testing
      labelText = node._originalLabel;
    } else {
      // For React nodes without _originalLabel, try to extract from props or use id as fallback
      // This handles cases like empty strings that become React fragments
      const reactNode = node.labelContent as React.ReactElement;
      if (reactNode && typeof reactNode === "object" && "props" in reactNode) {
        // Try to get text from React element children
        const props = reactNode.props as { children?: unknown };
        if (Array.isArray(props.children)) {
          // For fragments with array children, concat the text
          labelText = props.children
            .map((child: unknown) => {
              if (typeof child === "string") return child;
              if (child && typeof child === "object" && "props" in child) {
                return (child as { props: { children?: string } }).props.children || "";
              }
              return "";
            })
            .join("");
        } else if (typeof props.children === "string") {
          labelText = props.children;
        } else {
          labelText = node.id;
        }
      } else {
        // Fallback to id or empty string
        labelText = typeof reactNode === "string" ? reactNode : node.id;
      }
    }
    
    return {
      labelContent: labelText,
      expanded: node._expanded ?? false,
      children: node.children ? getStructure(node.children) : undefined,
    };
  });
}

describe("tree-search", () => {
  describe("exact path matching for non-terminal segments", () => {
    const tree: TreeDataItem[] = [
      createNode("system", "system", [
        createNode("query", "query", [
          createNode("query_log", "query_log"),
          createNode("query_cache", "query_cache"),
        ]),
        createNode("processes", "processes", [
          createNode("query", "query"),
          createNode("mutations", "mutations"),
        ]),
        createNode("metrics", "metrics"),
      ]),
      createNode("default", "default", [
        createNode("query", "query"),
      ]),
    ];

    it("should match exact path: system.query.", () => {
      const results = searchTree(tree, "system.query.");
      const structure = getStructure(results);

      // Should only match system -> query (not system -> processes -> query)
      expect(structure).toEqual([
        {
          labelContent: "system",
          expanded: true,
        children: [
          {
              labelContent: "query",
              expanded: true,
            children: [
                { labelContent: "query_log", expanded: false, children: undefined },
                { labelContent: "query_cache", expanded: false, children: undefined },
              ],
              },
          ],
        },
      ]);
    });

    it("should match exact path: system.processes.", () => {
      const results = searchTree(tree, "system.processes.");
      const structure = getStructure(results);

      // Should only match system -> processes
      expect(structure).toEqual([
        {
          labelContent: "system",
          expanded: true,
            children: [
              {
              labelContent: "processes",
              expanded: true,
              children: [
                { labelContent: "query", expanded: false, children: undefined },
                { labelContent: "mutations", expanded: false, children: undefined },
              ],
              },
            ],
        },
      ]);
    });

    it("should recursively match 'system.query' in all descendants", () => {
      const results = searchTree(tree, "system.query");
      const structure = getStructure(results);

      // Fuzzy last segment searches recursively through ALL descendants
      // Should match: system -> query, system -> query's children, AND system -> processes -> query
      expect(structure).toEqual([
        {
          labelContent: "system",
          expanded: true,
          children: [
            {
              labelContent: "query",
              expanded: true,
              children: [
                { labelContent: "query_log", expanded: true, children: undefined },
                { labelContent: "query_cache", expanded: true, children: undefined },
              ],
            },
            {
              labelContent: "processes",
              expanded: true,
              children: [
                { labelContent: "query", expanded: true, children: undefined },
              ],
          },
        ],
      },
      ]);
    });

    it("should NOT match system -> processes -> query for 'system.query.' (exact match with trailing dot)", () => {
      const results = searchTree(tree, "system.query.");
      const structure = getStructure(results);

      // Trailing dot makes it exact match - only system -> query (not system -> processes -> query)
      const systemNode = structure[0];
      expect(systemNode.children).toHaveLength(1);
      expect(systemNode.children?.[0].labelContent).toBe("query");
      expect(systemNode.children?.[0].labelContent).not.toBe("processes");
    });

    it("should demonstrate difference: 'system.query' vs 'system.query.'", () => {
      // Without trailing dot: fuzzy recursive search
      const fuzzyResults = searchTree(tree, "system.query");
      const fuzzyStructure = getStructure(fuzzyResults);
      
      // Should find both system->query AND system->processes->query
      expect(fuzzyStructure[0].children?.length).toBe(2); // query and processes branches
      
      // With trailing dot: exact match only
      const exactResults = searchTree(tree, "system.query.");
      const exactStructure = getStructure(exactResults);
      
      // Should find ONLY system->query
      expect(exactStructure[0].children?.length).toBe(1); // only query branch
      expect(exactStructure[0].children?.[0].labelContent).toBe("query");
    });

    it("should match only default -> query for 'default.query.'", () => {
      const results = searchTree(tree, "default.query.");
      const structure = getStructure(results);

      expect(structure).toEqual([
        {
          labelContent: "default",
          expanded: true,
        children: [
          {
              labelContent: "query",
              expanded: true,
              children: undefined,
          },
        ],
      },
      ]);
    });

    it("should not match anything for non-existent path 'system.nonexistent.'", () => {
      const results = searchTree(tree, "system.nonexistent.");
      expect(results).toEqual([]);
    });

    it("should not match anything for 'nonexistent.query.'", () => {
      const results = searchTree(tree, "nonexistent.query.");
      expect(results).toEqual([]);
    });
  });

  describe("fuzzy matching on last segment", () => {
    const tree: TreeDataItem[] = [
      createNode("system", "system", [
        createNode("query_log", "query_log"),
        createNode("query_cache", "query_cache"),
        createNode("metric_log", "metric_log"),
      ]),
    ];

    it("should fuzzy match 'system.query' to query_log and query_cache", () => {
      const results = searchTree(tree, "system.query");
      const structure = getStructure(results);

      expect(structure).toEqual([
        {
          labelContent: "system",
          expanded: true,
          children: [
            { labelContent: "query_log", expanded: true, children: undefined },
            { labelContent: "query_cache", expanded: true, children: undefined },
          ],
        },
      ]);
    });

    it("should fuzzy match 'system.log' to query_log and metric_log", () => {
      const results = searchTree(tree, "system.log");
      const structure = getStructure(results);

      expect(structure).toEqual([
        {
          labelContent: "system",
          expanded: true,
          children: [
            { labelContent: "query_log", expanded: true, children: undefined },
            { labelContent: "metric_log", expanded: true, children: undefined },
          ],
        },
      ]);
    });
  });

  describe("single segment search", () => {
    const tree: TreeDataItem[] = [
      createNode("system", "system", [
        createNode("query", "query"),
      ]),
      createNode("information_schema", "information_schema", [
        createNode("tables", "tables"),
      ]),
    ];

    it("should fuzzy match 'sys' to system", () => {
      const results = searchTree(tree, "sys");
      const structure = getStructure(results);

      // Single segment fuzzy match - node matches but children don't, so no children shown
      expect(structure).toEqual([
        {
          labelContent: "system",
          expanded: true,
          children: undefined,
        },
      ]);
    });

    it("should fuzzy match 'schema' to information_schema", () => {
      const results = searchTree(tree, "schema");
      const structure = getStructure(results);

      expect(structure).toEqual([
        {
          labelContent: "information_schema",
          expanded: true,
          children: undefined,
        },
      ]);
    });
  });

  describe("trailing dot expansion", () => {
    const tree: TreeDataItem[] = [
      createNode("system", "system", [
        createNode("query_log", "query_log"),
        createNode("metric_log", "metric_log"),
      ]),
    ];

    it("should expand 'system.' to show all children", () => {
      const results = searchTree(tree, "system.");
      const structure = getStructure(results);

      expect(structure).toEqual([
        {
          labelContent: "system",
          expanded: true,
          children: [
            { labelContent: "query_log", expanded: false, children: undefined },
            { labelContent: "metric_log", expanded: false, children: undefined },
          ],
        },
      ]);
    });
  });

  describe("deep nesting", () => {
    const tree: TreeDataItem[] = [
      createNode("a", "a", [
        createNode("b", "b", [
          createNode("c", "c", [
            createNode("d", "d"),
          ]),
          createNode("x", "x", [
            createNode("c", "c"),
          ]),
        ]),
        createNode("y", "y", [
          createNode("b", "b", [
            createNode("c", "c"),
          ]),
        ]),
      ]),
    ];

    it("should match exact path: a.b.c.", () => {
      const results = searchTree(tree, "a.b.c.");
      const structure = getStructure(results);

      // Should only match a -> b -> c (not a -> b -> x -> c or a -> y -> b -> c)
      expect(structure).toEqual([
        {
          labelContent: "a",
          expanded: true,
          children: [
            {
              labelContent: "b",
              expanded: true,
              children: [
                {
                  labelContent: "c",
                  expanded: true,
                  children: [
                    { labelContent: "d", expanded: false, children: undefined },
                  ],
                },
              ],
            },
          ],
        },
      ]);
    });

    it("should NOT match a -> b -> x -> c for 'a.b.c.'", () => {
      const results = searchTree(tree, "a.b.c.");
      const structure = getStructure(results);

      const aNode = structure[0];
      const bNode = aNode.children?.[0];
      expect(bNode?.labelContent).toBe("b");
      expect(bNode?.children).toHaveLength(1);
      expect(bNode?.children?.[0].labelContent).toBe("c");
    });

    it("should NOT match a -> y -> b -> c for 'a.b.c.'", () => {
      const results = searchTree(tree, "a.b.c.");
      const structure = getStructure(results);

      const aNode = structure[0];
      expect(aNode.children).toHaveLength(1);
      expect(aNode.children?.[0].labelContent).toBe("b");
      expect(aNode.children?.[0].labelContent).not.toBe("y");
    });
  });

  describe("case sensitivity", () => {
    const tree: TreeDataItem[] = [
      createNode("System", "System", [
        createNode("Query", "Query"),
      ]),
    ];

    it("should match 'system.query' case-insensitively for exact segments", () => {
      const results = searchTree(tree, "system.query");
      const structure = getStructure(results);

      expect(structure).toEqual([
        {
          labelContent: "System",
          expanded: true,
          children: [
            { labelContent: "Query", expanded: true, children: undefined },
          ],
        },
      ]);
    });

    it("should match 'SYSTEM.QUERY.' case-insensitively", () => {
      const results = searchTree(tree, "SYSTEM.QUERY.");
      const structure = getStructure(results);

      expect(structure).toEqual([
        {
          labelContent: "System",
          expanded: true,
          children: [
            { labelContent: "Query", expanded: true, children: undefined },
          ],
        },
      ]);
    });
  });

  describe("empty search", () => {
    const tree: TreeDataItem[] = [
      createNode("system", "system", [
        createNode("query", "query"),
      ]),
    ];

    it("should return original tree for empty search", () => {
      const results = searchTree(tree, "");
      expect(results).toEqual(tree);
    });
  });

  describe("edge cases", () => {
    it("should handle undefined tree", () => {
      const results = searchTree(undefined, "system");
      expect(results).toEqual([]);
    });

    it("should handle empty tree", () => {
      const results = searchTree([], "system");
      expect(results).toEqual([]);
    });

    it("should handle search with only dots", () => {
      const tree: TreeDataItem[] = [
        createNode("system", "system"),
      ];
      const results = searchTree(tree, "...");
      // All empty segments are filtered out, returning original tree (same as empty search)
      expect(results).toEqual(tree);
    });

    it("should handle middle empty segments (e.g., 'system..sys')", () => {
      const tree: TreeDataItem[] = [
        createNode("system", "system", [
          createNode("query", "query"),
          createNode("processes", "processes"),
        ]),
      ];
      const results = searchTree(tree, "system..sys");
      
      // Middle empty strings are preserved: "system..sys" → ["system", "", "sys"]
      // This means: match "system", then match empty (which fails), so no results
      expect(results).toEqual([]);
    });

    it("should handle empty-named nodes with middle empty segments", () => {
      const tree: TreeDataItem[] = [
        createNode("a", "a", [
          createNode("", "", [  // Empty-named node
            createNode("c", "c"),
          ]),
          createNode("b", "b"),
        ]),
      ];
      
      // a.b → ["a", "b"] → should match a -> b (direct child)
      const results1 = searchTree(tree, "a.b");
      expect(results1).toHaveLength(1);
      
      // a..c → ["a", "", "c"] → WILL match a -> "" -> c (empty node matches empty segment)
      const results2 = searchTree(tree, "a..c");
      expect(results2).toHaveLength(1);
      const structure2 = getStructure(results2);
      expect(structure2[0].children?.[0].labelContent).toBe(""); // Empty node
      expect(structure2[0].children?.[0].children?.[0].labelContent).toBe("c");
      
      // Most real trees won't have empty-named nodes, so a..anything typically matches nothing
      const normalTree: TreeDataItem[] = [
        createNode("system", "system", [
          createNode("query", "query"),
        ]),
      ];
      expect(searchTree(normalTree, "system..query")).toEqual([]);
    });

    it("should distinguish 'system..' vs 'system.'", () => {
      const tree: TreeDataItem[] = [
        createNode("system", "system", [
          createNode("query", "query"),
        ]),
      ];
      
      // system. → ["system", ""] → expand system to show children
      const results1 = searchTree(tree, "system.");
      expect(results1).toHaveLength(1);
      expect(results1[0].children).toHaveLength(1);
      
      // system.. → ["system", "", ""] → match system, then try to match empty in children (fails)
      const results2 = searchTree(tree, "system..");
      expect(results2).toEqual([]);
    });

    it("should handle multiple trailing dots correctly", () => {
      const tree: TreeDataItem[] = [
        createNode("system", "system", [
          createNode("query", "query", [
            createNode("query_log", "query_log"),
          ]),
        ]),
      ];
      
      // One dot: expand
      expect(searchTree(tree, "system.")).toHaveLength(1);
      expect(searchTree(tree, "system.")[0].children).toHaveLength(1);
      
      // Two dots: no match (try to match empty string in children)
      expect(searchTree(tree, "system..")).toEqual([]);
      
      // Three dots: no match
      expect(searchTree(tree, "system...")).toEqual([]);
      
      // system.query. → expand query
      const resultsQuery = searchTree(tree, "system.query.");
      expect(resultsQuery).toHaveLength(1);
      expect(resultsQuery[0].children?.[0].children).toHaveLength(1);
      
      // system.query.. → no match (try to match empty after query)
      expect(searchTree(tree, "system.query..")).toEqual([]);
    });
  });
});
