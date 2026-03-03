import type {
  GraphRcaContext,
  GraphRcaContextResolver,
} from "./collect-rca-evidence-provider";

/**
 * Demonstrates the commercial graph-resolver contract without requiring the
 * proprietary graph implementation in the OSS tree.
 */
export function createDemoCommercialGraphRcaContextResolver(): GraphRcaContextResolver {
  return {
    name: "demo-commercial-graph-resolver",
    async resolve(input): Promise<GraphRcaContext> {
      const targetLabel =
        input.context.target?.database && input.context.target?.table
          ? `${input.context.target.database}.${input.context.target.table}`
          : input.context.target?.table ||
            input.context.target?.node ||
            input.context.target?.query_hash ||
            "target scope";

      switch (input.symptom) {
        case "high_part_count":
          return {
            available: true,
            source: "commercial",
            observations: [
              {
                source: "commercial.graph.demo",
                description: `Graph RCA placeholder for upstream writers and MV fanout affecting ${targetLabel}`,
                metrics: {
                  graph_edges_considered: 0,
                  graph_nodes_considered: 0,
                },
              },
            ],
            possible_actions: [
              {
                title: "Inspect upstream writers and downstream materialized views",
                risk: "medium",
                tied_to: "graph_write_fanout",
              },
            ],
          };
        case "high_query_latency":
          return {
            available: true,
            source: "commercial",
            observations: [
              {
                source: "commercial.graph.demo",
                description: `Graph RCA placeholder for query-to-table dependency traversal around ${targetLabel}`,
                metrics: {
                  graph_edges_considered: 0,
                  graph_nodes_considered: 0,
                },
              },
            ],
            possible_actions: [
              {
                title: "Inspect upstream table lineage and dependent read paths",
                risk: "medium",
                tied_to: "graph_dependency_path",
              },
            ],
          };
        case "high_partition_count":
          return {
            available: true,
            source: "commercial",
            observations: [
              {
                source: "commercial.graph.demo",
                description: `Graph RCA placeholder for partition fanout and workload lineage around ${targetLabel}`,
                metrics: {
                  graph_edges_considered: 0,
                  graph_nodes_considered: 0,
                },
              },
            ],
            possible_actions: [
              {
                title: "Inspect partition-key fanout across upstream workloads",
                risk: "medium",
                tied_to: "graph_partition_fanout",
              },
            ],
          };
        default:
          return {
            available: false,
            source: "none",
          };
      }
    },
  };
}
