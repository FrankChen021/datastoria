/**
 * ClickHouse tools.
 *
 * The same agent-facing tool schemas can execute in the browser or on the server. Browser
 * execution is handled by ChatFactory.onToolCall. Server execution is created by
 * createServerClickHouseTools when a ClickHouseConnection is provided in the chat request.
 */
import { Connection } from "@/lib/connection/connection";
import { tool, type Tool } from "ai";
import * as z from "zod";
import { ClickHouseToolExecutors } from "./clickhouse-tool-executors";
import type { EvidenceContext } from "./collect-sql-optimization-evidence";
import { type RcaEvidenceInput, type RcaEvidenceOutput } from "./rca/evidence-collector-common";
import { type SearchQueryLogInput, type SearchQueryLogOutput } from "./search-query-log";
import {
  type GetClusterStatusInput,
  type GetClusterStatusOutput,
} from "./status/collect-cluster-status";

export interface ClickHouseConnection {
  url: string;
  user: string;
  password: string;
}

export type ValidateSqlToolInput = {
  sql: string;
};

export type ValidateSqlToolOutput = {
  success: boolean;
  error?: string;
};

export const ClickHouseTools = {
  explore_schema: tool({
    description: `Explore table schemas: columns, engine, sorting/primary/partition keys. Supports multiple tables per call.
- Use fully qualified 'database.table' format (e.g., 'system.metric_log').
- If the user names specific columns or metrics, pass them in 'columns' to skip fetching the full schema.
- If output has 'truncated: true', retry with a narrower 'columns' list.`,
    inputSchema: z.object({
      tables: z
        .array(
          z.object({
            table: z.string().describe("'database.table' format, e.g. 'system.metric_log'."),
            columns: z
              .array(z.string())
              .optional()
              .describe("Specific columns to fetch; omit for broad discovery."),
          })
        )
        .min(1),
    }),
    outputSchema: z.array(
      z.object({
        database: z.string(),
        table: z.string(),
        columns: z.array(
          z.object({
            name: z.string(),
            type: z.string(),
            comment: z.string().optional(),
          })
        ),
        engine: z.string(),
        sortingKey: z.string(),
        primaryKey: z.string(),
        partitionBy: z.string(),
        totalColumns: z.number(),
        truncated: z
          .boolean()
          .describe("True if schema was capped; retry with a narrower 'columns' list."),
        guidance: z.string().optional().describe("Retry hint when truncated."),
      })
    ),
  }),
  get_tables: tool({
    description:
      "List tables with optional filters (name pattern, database, engine, partition key). NEVER call without at least one filter — unfiltered calls on large databases cause token overflow.",
    inputSchema: z.object({
      name_pattern: z
        .string()
        .optional()
        .describe("SQL LIKE pattern for table name (e.g., '%user%', 'fact_%')."),
      database: z.string().optional().describe("Filter by database; omit to search all."),
      engine: z
        .string()
        .optional()
        .describe("Engine filter (e.g., 'MergeTree', 'ReplicatedMergeTree')."),
      partition_key: z
        .string()
        .optional()
        .describe("SQL LIKE pattern for partition key (e.g., '%date%', '%toYYYYMM%')."),
      limit: z.number().optional().default(100).describe("Max tables to return (default: 100)."),
    }),
    outputSchema: z.array(
      z.object({
        database: z.string(),
        table: z.string(),
        engine: z.string(),
        partition_key: z.string().optional(),
      })
    ),
  }),
  execute_sql: tool({
    description: "Execute a SQL query on the ClickHouse database and return results.",
    inputSchema: z.object({
      sql: z.string(),
    }),
    outputSchema: z.object({
      columns: z.array(z.object({ name: z.string(), type: z.string() })),
      rows: z.array(z.any()).optional(),
      rowCount: z.number(),
      sampleRow: z.any().optional(),
      error: z.string().optional(),
    }),
  }),
  validate_sql: tool({
    description:
      "Validate ClickHouse SQL query syntax without executing it. Returns error message if invalid.",
    inputSchema: z.object({
      sql: z.string(),
    }) satisfies z.ZodType<ValidateSqlToolInput>,
    outputSchema: z.object({
      success: z.boolean(),
      error: z.string().optional(),
    }) satisfies z.ZodType<ValidateSqlToolOutput>,
  }),
  collect_sql_optimization_evidence: tool({
    description:
      "Gather optimization evidence (query logs, EXPLAIN plans, schemas, statistics) for a SQL query or query_id. Default to light mode unless raw ProfileEvents, extra settings, or full pipeline text are explicitly needed.",
    inputSchema: z.object({
      sql: z.string().optional().describe("SQL text to analyze (preferred if available)."),
      query_id: z.string().optional().describe("ClickHouse query_id to retrieve logs for."),
      goal: z
        .enum(["latency", "memory", "bytes", "dashboard", "other"])
        .optional()
        .describe("Optimization goal (latency|memory|bytes|dashboard|other)."),
      mode: z
        .enum(["light", "full"])
        .default("light")
        .describe(
          "Default to light. Use full only when the user explicitly asks for detailed/raw evidence or the light pass is insufficient."
        ),
      time_window: z
        .number()
        .min(5)
        .max(1440)
        .optional()
        .describe("Lookback in minutes (5-1440). Use this OR time_range, not both."),
      time_range: z
        .object({
          from: z.string().describe("ISO 8601 start (e.g., '2025-01-01')."),
          to: z.string().describe("ISO 8601 end (e.g., '2025-02-01')."),
        })
        .optional()
        .describe("Absolute time range. Use this OR time_window, not both."),
      requested: z
        .object({
          required: z.array(z.string()).optional(),
          optional: z.array(z.string()).optional(),
        })
        .optional(),
    }),
    outputSchema: z.custom<EvidenceContext>(),
  }),
  search_query_log: tool({
    description:
      "Search system.query_log with validated filters for ranked discovery, pattern lookup, and filtered execution search. Do NOT use this for visualization, time-bucketed aggregations, trends, or chart-oriented queries such as by hour/day/week; generate SQL for those instead.",
    inputSchema: z.object({
      mode: z
        .enum(["patterns", "executions"])
        .default("patterns")
        .describe(
          "patterns: group by normalized_query_hash; executions: return individual query executions."
        ),
      metric: z
        .enum(["cpu", "memory", "disk", "duration", "read_rows", "read_bytes"])
        .optional()
        .describe(
          "Optional ranking metric. If omitted, defaults to execution_count/event_time ordering."
        ),
      metric_aggregation: z
        .enum(["sum", "avg", "max"])
        .default("sum")
        .describe("Aggregation used for metric_value in patterns mode."),
      limit: z.number().min(1).max(100).default(10).describe("Rows or patterns to return."),
      time_window: z
        .number()
        .min(5)
        .max(10080)
        .optional()
        .describe("Lookback in minutes. Use this OR time_range, not both."),
      time_range: z
        .object({
          from: z.string().describe("ISO 8601 start (e.g., '2025-01-01')."),
          to: z.string().describe("ISO 8601 end (e.g., '2025-02-01')."),
        })
        .optional()
        .describe("Absolute time range. Use this OR time_window, not both."),
      predicates: z
        .array(
          z.object({
            field: z.enum([
              "user",
              "query_kind",
              "query",
              "query_id",
              "normalized_query_hash",
              "database",
              "table",
              "type",
              "is_initial_query",
              "has_error",
              "exception",
              "query_duration_ms",
              "read_rows",
              "read_bytes",
              "memory_usage",
              "result_rows",
            ]),
            op: z.enum([
              "eq",
              "neq",
              "in",
              "not_in",
              "contains_ci",
              "not_contains_ci",
              "has",
              "not_has",
              "gt",
              "gte",
              "lt",
              "lte",
              "is_null",
              "not_null",
            ]),
            value: z
              .union([
                z.string(),
                z.number(),
                z.boolean(),
                z.array(z.string()),
                z.array(z.number()),
                z.array(z.boolean()),
              ])
              .optional(),
          })
        )
        .optional()
        .describe(
          "Validated query_log predicates. Defaults still apply unless you override type/query_kind/is_initial_query."
        ),
    }) satisfies z.ZodType<SearchQueryLogInput>,
    outputSchema: z.object({
      success: z.boolean(),
      mode: z.enum(["patterns", "executions"]),
      metric: z.enum(["cpu", "memory", "disk", "duration", "read_rows", "read_bytes"]).optional(),
      metric_aggregation: z.enum(["sum", "avg", "max"]).optional(),
      time_window: z.number().optional(),
      time_range: z
        .object({
          from: z.string(),
          to: z.string(),
        })
        .optional(),
      defaults_applied: z.array(z.string()),
      filters_applied: z.array(z.string()),
      rowCount: z.number(),
      rows: z.array(z.record(z.string(), z.any())),
      message: z.string().optional(),
    }) satisfies z.ZodType<SearchQueryLogOutput>,
  }),
  collect_cluster_status: tool({
    description:
      "Collect ClickHouse cluster status from system tables. Supports current snapshot and time-windowed status. This is a collection tool (not diagnosis): it returns raw health summaries/outliers for the diagnose-clickhouse-clusters skill to interpret.",
    inputSchema: z.object({
      status_analysis_mode: z
        .enum(["snapshot", "windowed"])
        .optional()
        .describe("'snapshot' (default) or 'windowed' for time-series metrics."),
      checks: z
        .array(
          z.enum([
            "replication",
            "disk",
            "memory",
            "cpu",
            "merges",
            "mutations",
            "parts",
            "errors",
            "connections",
            "select_queries",
            "insert_queries",
            "ddl_queries",
          ])
        )
        .optional()
        .describe("Health check categories to run; defaults to all."),
      verbosity: z
        .enum(["summary", "detailed"])
        .optional()
        .describe("Verbosity level (informational only)."),
      thresholds: z
        .object({
          disk_warning: z.number().optional().describe("Disk warning % (default: 80)."),
          disk_critical: z.number().optional().describe("Disk critical % (default: 90)."),
          cpu_cores_used_warning: z
            .number()
            .optional()
            .describe("CPU warning in cores-used (default: 4)."),
          cpu_cores_used_critical: z
            .number()
            .optional()
            .describe("CPU critical in cores-used (default: 8)."),
          replication_lag_warning_seconds: z
            .number()
            .optional()
            .describe("Replication lag warning in seconds (default: 60)."),
          replication_lag_critical_seconds: z
            .number()
            .optional()
            .describe("Replication lag critical in seconds (default: 300)."),
          parts_warning: z.number().optional().describe("Parts warning per table (default: 500)."),
          parts_critical: z
            .number()
            .optional()
            .describe("Parts critical per table (default: 1000)."),
          query_p95_warning_ms: z
            .number()
            .optional()
            .describe("p95 latency warning in ms (default: 1000)."),
          query_p95_critical_ms: z
            .number()
            .optional()
            .describe("p95 latency critical in ms (default: 3000)."),
        })
        .optional()
        .describe("Override thresholds for WARNING/CRITICAL classification."),
      max_outliers: z.number().optional().describe("Max outliers per category (default: 10)."),
      window: z
        .object({
          metric_type: z
            .enum([
              "replication",
              "disk",
              "memory",
              "cpu",
              "merges",
              "mutations",
              "parts",
              "errors",
              "connections",
              "query_latency",
              "query_performance",
            ])
            .optional()
            .describe("Health category for the time-series signal (default: 'errors')."),
          time_window: z
            .number()
            .min(5)
            .max(7 * 24 * 60)
            .optional()
            .describe("Lookback in minutes (5-10080). Use this OR time_range, not both."),
          time_range: z
            .object({
              from: z.string().describe("ISO 8601 start (e.g., '2025-01-01')."),
              to: z.string().describe("ISO 8601 end (e.g., '2025-01-02')."),
            })
            .optional()
            .describe("Absolute time range; overrides time_window."),
          granularity_minutes: z
            .number()
            .min(1)
            .max(24 * 60)
            .optional()
            .describe("Bucket granularity in minutes (default: 5)."),
        })
        .optional()
        .describe("Time-window options (used when mode is 'windowed')."),
    }) as z.ZodType<GetClusterStatusInput>,
    outputSchema: z.object({
      success: z.boolean(),
      status_analysis_mode: z.enum(["snapshot", "windowed"]),
      scope: z.enum(["single_node", "cluster"]),
      cluster: z.string().optional(),
      node_count: z.number(),
      summary: z.object({
        total_nodes: z.number(),
        healthy_nodes: z.number(),
        nodes_with_issues: z.number(),
      }),
      categories: z.record(z.string(), z.any()),
      window: z
        .object({
          success: z.boolean(),
          metric_type: z.enum([
            "replication",
            "disk",
            "memory",
            "cpu",
            "merges",
            "mutations",
            "parts",
            "errors",
            "connections",
            "query_latency",
            "query_performance",
          ]),
          time_window: z.number().optional(),
          time_range: z
            .object({
              from: z.string(),
              to: z.string(),
            })
            .optional(),
          granularity_minutes: z.number(),
          series: z.array(
            z.object({
              timestamp: z.string(),
              value: z.number(),
            })
          ),
          summary: z.object({
            min: z.number().nullable(),
            max: z.number().nullable(),
            avg: z.number().nullable(),
            trend: z.enum(["up", "down", "flat", "unknown"]),
          }),
          message: z.string().optional(),
          error: z.string().optional(),
        })
        .optional(),
      generated_at: z.string(),
      error: z.string().optional(),
    }) as z.ZodType<GetClusterStatusOutput>,
  }),
  collect_rca_evidence: tool({
    description:
      "Collect root-cause analysis evidence for a cluster symptom. This tool returns observations, ranked cause candidates, possible actions, evidence gaps, and optional related symptoms. It is an evidence collector only; final conclusions must be produced by the cluster-diagnostics skill.",
    inputSchema: z.object({
      symptom: z.enum(["high_part_count", "unknown"]),
      scope: z.enum(["cluster", "node", "table", "query_pattern"]).optional(),
      target: z
        .object({
          database: z.string().optional(),
          table: z.string().optional(),
          node: z.string().optional(),
          query_hash: z.string().optional(),
        })
        .optional(),
      symptom_text: z
        .string()
        .optional()
        .describe("Required when symptom is 'unknown'. Natural language symptom phrase."),
      time_window: z
        .number()
        .min(5)
        .max(7 * 24 * 60)
        .optional()
        .describe(
          "Relative lookback window in minutes from now (5-10080). Use this OR time_range, not both."
        ),
      time_range: z
        .object({
          from: z.string().describe("Start datetime (ISO 8601 format)."),
          to: z.string().describe("End datetime (ISO 8601 format)."),
        })
        .optional()
        .describe("Absolute time range. If provided, takes precedence over time_window."),
      thresholds: z
        .object({
          high_part_count: z
            .object({
              inserts_per_minute_gt: z.number().optional(),
              avg_rows_per_insert_lt: z.number().optional(),
              total_active_parts_gt: z.number().optional(),
              active_merges_gt: z.number().optional(),
              max_merge_elapsed_seconds_gt: z.number().optional(),
              distinct_partitions_gt: z.number().optional(),
              partition_to_parts_ratio_gt: z.number().optional(),
              max_parts_per_partition_gt: z.number().optional(),
              related_symptom_distinct_partitions_gte: z.number().optional(),
              related_symptom_signal_strength_gte: z.number().optional(),
            })
            .optional(),
        })
        .optional()
        .describe("Optional RCA threshold overrides. Any omitted field uses built-in defaults."),
      status_context: z
        .object({
          generated_at: z
            .string()
            .describe("ISO 8601 timestamp from collect_cluster_status output."),
          status_analysis_mode: z.enum(["snapshot", "windowed"]),
          scope: z.enum(["single_node", "cluster"]),
          window: z
            .object({
              time_window: z.number().optional(),
              time_range: z
                .object({
                  from: z.string(),
                  to: z.string(),
                })
                .optional(),
            })
            .optional(),
          categories: z.record(z.string(), z.any()).optional(),
        })
        .optional()
        .describe("Optional prior status output to reduce redundant probes."),
    }) as z.ZodType<RcaEvidenceInput>,
    outputSchema: z.object({
      schema_version: z.literal(1),
      success: z.boolean(),
      symptom: z.enum(["high_part_count", "unknown"]),
      scope: z.enum(["cluster", "node", "table", "query_pattern"]),
      target: z
        .object({
          database: z.string().optional(),
          table: z.string().optional(),
          node: z.string().optional(),
          query_hash: z.string().optional(),
        })
        .optional(),
      related_symptoms: z.array(z.enum(["high_part_count", "unknown"])).optional(),
      observations: z.array(
        z.object({
          source: z.string(),
          description: z.string(),
          metrics: z.record(z.string(), z.union([z.number(), z.string(), z.null()])),
          partition_key_columns: z
            .array(
              z.object({
                name: z.string(),
                data_type: z.string(),
                sample_values: z.array(z.union([z.number(), z.string(), z.null()])).optional(),
              })
            )
            .optional(),
          scope_summary: z
            .object({
              level: z.enum(["cluster", "node", "table"]),
              aggregation_semantics: z.enum(["additive", "ratio", "quantile", "inventory"]),
              cluster_aggregation: z.string().optional(),
            })
            .optional(),
          top_nodes: z
            .array(
              z.object({
                node: z.string(),
                metrics: z.record(z.string(), z.union([z.number(), z.string(), z.null()])),
              })
            )
            .optional(),
          nodes_over_threshold: z
            .array(
              z.object({
                node: z.string(),
                metric: z.string(),
                value: z.number(),
                threshold: z.number(),
              })
            )
            .optional(),
        })
      ),
      candidates: z.array(
        z.object({
          cause: z.string(),
          support_score: z.number(),
          indicators_matched: z.number(),
          indicators_checked: z.number(),
          evidence_for: z.array(z.string()),
          evidence_against: z.array(z.string()),
          next_checks: z.array(z.string()),
        })
      ),
      excluded_candidates: z
        .array(
          z.object({
            cause: z.string(),
            missing_required: z.array(z.string()),
            evidence_against: z.array(z.string()),
          })
        )
        .optional(),
      possible_actions: z.array(
        z.object({
          title: z.string(),
          command: z.string().optional(),
          risk: z.enum(["low", "medium", "high"]),
          tied_to: z.string(),
        })
      ),
      gaps: z.array(
        z.object({
          description: z.string(),
          reason: z.string(),
        })
      ),
      generated_at: z.string(),
      error: z.string().optional(),
    }) as z.ZodType<RcaEvidenceOutput>,
  }),
};

export const CLICKHOUSE_TOOL_NAMES = {
  EXPLORE_SCHEMA: "explore_schema",
  GET_TABLES: "get_tables",
  EXECUTE_SQL: "execute_sql",
  VALIDATE_SQL: "validate_sql",
  COLLECT_SQL_OPTIMIZATION_EVIDENCE: "collect_sql_optimization_evidence",
  SEARCH_QUERY_LOG: "search_query_log",
  COLLECT_CLUSTER_STATUS: "collect_cluster_status",
  COLLECT_RCA_EVIDENCE: "collect_rca_evidence",
} as const;

export type ClickHouseToolName = (typeof CLICKHOUSE_TOOL_NAMES)[keyof typeof CLICKHOUSE_TOOL_NAMES];
type ServerClickHouseTools = Record<ClickHouseToolName, Tool>;

export function hasClickHouseConnection(connection: unknown): connection is ClickHouseConnection {
  const candidate = connection as Partial<ClickHouseConnection> | null;
  return Boolean(
    candidate &&
    typeof candidate === "object" &&
    typeof candidate.url === "string" &&
    typeof candidate.user === "string" &&
    typeof candidate.password === "string" &&
    candidate.password.length > 0
  );
}

export function createServerClickHouseTools(config: ClickHouseConnection): ServerClickHouseTools {
  const connection = Connection.create({
    name: `${config.user}@${config.url}`,
    url: config.url,
    user: config.user,
    password: config.password,
    cluster: "",
    editable: false,
  });

  const bind = (toolName: ClickHouseToolName): Tool => {
    const clickHouseTool = ClickHouseTools[toolName] as {
      description?: string;
      inputSchema: Tool["inputSchema"];
    };

    const executableTool = {
      description: clickHouseTool.description,
      inputSchema: clickHouseTool.inputSchema,
      execute: (input: unknown) => ClickHouseToolExecutors[toolName](input as never, connection),
    };

    return tool(executableTool as unknown as Parameters<typeof tool>[0]) as Tool;
  };

  return {
    explore_schema: bind(CLICKHOUSE_TOOL_NAMES.EXPLORE_SCHEMA),
    get_tables: bind(CLICKHOUSE_TOOL_NAMES.GET_TABLES),
    execute_sql: bind(CLICKHOUSE_TOOL_NAMES.EXECUTE_SQL),
    validate_sql: bind(CLICKHOUSE_TOOL_NAMES.VALIDATE_SQL),
    collect_sql_optimization_evidence: bind(
      CLICKHOUSE_TOOL_NAMES.COLLECT_SQL_OPTIMIZATION_EVIDENCE
    ),
    search_query_log: bind(CLICKHOUSE_TOOL_NAMES.SEARCH_QUERY_LOG),
    collect_cluster_status: bind(CLICKHOUSE_TOOL_NAMES.COLLECT_CLUSTER_STATUS),
    collect_rca_evidence: bind(CLICKHOUSE_TOOL_NAMES.COLLECT_RCA_EVIDENCE),
  };
}
