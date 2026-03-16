/**
 * Client-Side Tools for ClickHouse
 *
 * These tools are executed on the client via the onToolCall callback.
 * They provide schema introspection and query execution capabilities.
 */
import type { AppUIMessage } from "@/lib/ai/chat-types";
import { tool, type InferToolInput, type InferToolOutput, type UIMessage } from "ai";
import * as z from "zod";
import type { ToolExecutor } from "./client-tool-types";
import {
  collectSqlOptimizationEvidenceExecutor,
  type EvidenceContext,
} from "./collect-sql-optimization-evidence";
import { executeSqlExecutor } from "./execute-sql";
import { exploreSchemaExecutor } from "./explore-schema";
import { getTablesExecutor } from "./get-tables";
import {
  searchQueryLogExecutor,
  type SearchQueryLogInput,
  type SearchQueryLogOutput,
} from "./search-query-log";
import {
  getClusterStatusExecutor,
  type GetClusterStatusInput,
  type GetClusterStatusOutput,
} from "./status/collect-cluster-status";
import { validateSqlExecutor } from "./validate-sql";

export type ValidateSqlToolInput = {
  sql: string;
};

export type ValidateSqlToolOutput = {
  success: boolean;
  error?: string;
};

export const ClientTools = {
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
};

/**
 * Tool names for easy referencing without hardcoded strings
 */
export const CLIENT_TOOL_NAMES = {
  // Client-side introspection and execution tools
  EXPLORE_SCHEMA: "explore_schema",
  GET_TABLES: "get_tables",
  EXECUTE_SQL: "execute_sql",
  VALIDATE_SQL: "validate_sql",
  COLLECT_SQL_OPTIMIZATION_EVIDENCE: "collect_sql_optimization_evidence",
  SEARCH_QUERY_LOG: "search_query_log",
  COLLECT_CLUSTER_STATUS: "collect_cluster_status",
} as const;

export function convertToAppUIMessage(message: UIMessage): AppUIMessage {
  return message as AppUIMessage;
}

/**
 * Tool registry - maps tool names to their executor functions
 */
export const ClientToolExecutors: {
  [K in keyof typeof ClientTools]: ToolExecutor<
    InferToolInput<(typeof ClientTools)[K]>,
    InferToolOutput<(typeof ClientTools)[K]>
  >;
} = {
  explore_schema: exploreSchemaExecutor,
  get_tables: getTablesExecutor,
  execute_sql: executeSqlExecutor,
  validate_sql: validateSqlExecutor,
  collect_sql_optimization_evidence: collectSqlOptimizationEvidenceExecutor,
  search_query_log: searchQueryLogExecutor,
  collect_cluster_status: getClusterStatusExecutor,
};
