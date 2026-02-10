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
import { findExpensiveQueriesExecutor } from "./find-expensive-queries";
import { getTablesExecutor } from "./get-tables";
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
    description:
      "Use this tool to explore table schemas in detail, including columns, engine, sorting/primary/partition keys. You can query multiple tables at once. IMPORTANT: If the user provides a fully qualified table name (e.g., 'system.metric_log'), you MUST split it into database='system' and table='metric_log'. The 'table' field should ONLY contain the table name without the database prefix. OPTIMIZATION: If user mentions specific column names for a table, provide them in the 'columns' array for that table to fetch only those columns (saves tokens for large tables).",
    inputSchema: z.object({
      tables: z
        .array(
          z.object({
            database: z
              .string()
              .describe("The database name. For 'system.metric_log', use 'system'."),
            table: z
              .string()
              .describe(
                "The table name ONLY (without database prefix). For 'system.metric_log', use 'metric_log'."
              ),
            columns: z
              .array(z.string())
              .optional()
              .describe(
                "Optional: Fetch only these specific columns for this table. Omit to fetch all columns. Use this when user mentions specific column names to reduce token usage for large tables."
              ),
          })
        )
        .min(1)
        .describe(
          "An array of tables to query. Each entry must have separate 'database' and 'table' fields. If given a fully qualified name like 'database.table', split it into database='database' and table='table'."
        ),
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
      })
    ),
  }),
  get_tables: tool({
    description:
      "Use this tool to get a list of tables from the database with optional filters. IMPORTANT: ALWAYS use filters to narrow down results - NEVER call without filters on large databases. Use filters to find tables by name patterns, database, engine type, or partition key. Examples: name_pattern='%user%' for user-related tables, partition_key='%date%' for date-partitioned tables, engine='MergeTree' for MergeTree tables.",
    inputSchema: z.object({
      name_pattern: z
        .string()
        .optional()
        .describe(
          "SQL LIKE pattern for table name filtering (e.g., '%user%', 'fact_%', '%_log'). Extract keywords from user query to build this pattern."
        ),
      database: z
        .string()
        .optional()
        .describe("Filter by specific database name. If not provided, searches all databases."),
      engine: z
        .string()
        .optional()
        .describe(
          "Filter by table engine type (e.g., 'MergeTree', 'ReplicatedMergeTree', 'Log'). Use exact engine name or prefix."
        ),
      partition_key: z
        .string()
        .optional()
        .describe(
          "SQL LIKE pattern for partition key expression (e.g., '%date%', '%toYYYYMM%'). Use this for queries about partitioning scheme."
        ),
      limit: z
        .number()
        .optional()
        .default(100)
        .describe(
          "Maximum number of tables to return. Default: 100. Use this to prevent token overflow on large databases."
        ),
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
    description:
      "Execute SQL query on ClickHouse database (client-side execution). Use this tool to select data from the database to improve your response.",
    inputSchema: z.object({
      sql: z.string().describe("The SQL query to execute"),
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
      sql: z.string().describe("The SQL query to validate"),
    }) satisfies z.ZodType<ValidateSqlToolInput>,
    outputSchema: z.object({
      success: z.boolean(),
      error: z.string().optional(),
    }) satisfies z.ZodType<ValidateSqlToolOutput>,
  }),
  collect_sql_optimization_evidence: tool({
    description:
      "Collect ClickHouse evidence for SQL optimization and return a normalized EvidenceContext. This tool gathers query logs, EXPLAIN plans, table schemas, and statistics needed for optimization analysis.",
    inputSchema: z.object({
      sql: z.string().optional().describe("SQL text to analyze (preferred if available)."),
      query_id: z
        .string()
        .optional()
        .describe("ClickHouse query_id to retrieve logs for (optional)."),
      goal: z
        .enum(["latency", "memory", "bytes", "dashboard", "other"])
        .optional()
        .describe("Optimization goal (latency|memory|bytes|dashboard|other)."),
      mode: z
        .enum(["light", "full"])
        .default("light")
        .describe("light: minimal safe evidence; full: includes more stats/settings."),
      time_window: z
        .number()
        .min(5)
        .max(1440)
        .optional()
        .describe(
          "Relative lookback window in minutes from now (5-1440). Use this OR time_range, not both. When called after find_expensive_queries, pass the same value."
        ),
      time_range: z
        .object({
          from: z.string().describe("Start datetime (ISO 8601 format, e.g., '2025-01-01')."),
          to: z.string().describe("End datetime (ISO 8601 format, e.g., '2025-02-01')."),
        })
        .optional()
        .describe("Absolute time range for query_log lookup. Use for specific date ranges."),
      requested: z
        .object({
          required: z.array(z.string()).optional(),
          optional: z.array(z.string()).optional(),
        })
        .optional()
        .describe("Fields requested by EvidenceRequest."),
    }),
    outputSchema: z.custom<EvidenceContext>(),
  }),
  find_expensive_queries: tool({
    description:
      "Find expensive queries from system.query_log by resource metric. Queries are grouped by pattern (normalized_query_hash) and metrics are aggregated across all executions. Use when user asks to find/optimize heavy queries without providing specific SQL or query_id. Supported metrics: cpu (CPU time), memory (peak RAM usage), disk (bytes read), duration (execution time). Returns execution_count showing how many times each query pattern ran. NOT supported: filtering by user, database, table name, or query pattern. Time filtering: use 'time_window' for relative time (last N minutes) or 'time_range' for absolute dates.",
    inputSchema: z.object({
      metric: z
        .enum(["cpu", "memory", "disk", "duration"])
        .describe(
          "Resource metric to sort by: 'cpu' (CPU time), 'memory' (peak RAM usage), 'disk' (bytes read from disk), 'duration' (query execution time)"
        ),
      limit: z
        .number()
        .min(1)
        .max(10)
        .default(3)
        .describe("Number of queries to return (1-10, default: 3)"),
      time_window: z
        .number()
        .min(5)
        .max(1440)
        .optional()
        .describe(
          "Relative lookback window in minutes from now (5-1440, default: 60). Use this OR time_range, not both."
        ),
      time_range: z
        .object({
          from: z
            .string()
            .describe(
              "Start datetime (ISO 8601 format, e.g., '2025-01-01' or '2025-01-01T00:00:00')."
            ),
          to: z
            .string()
            .describe(
              "End datetime (ISO 8601 format, e.g., '2025-02-01' or '2025-02-01T23:59:59')."
            ),
        })
        .optional()
        .describe(
          "Absolute time range for specific date ranges like 'between 2025-01-01 and 2025-02-01'."
        ),
    }),
    outputSchema: z.object({
      success: z.boolean(),
      message: z.string().optional(),
      metric: z.string(),
      metric_label: z.string(),
      time_window: z.number().optional(),
      time_range: z
        .object({
          from: z.string(),
          to: z.string(),
        })
        .optional(),
      queries: z.array(
        z.object({
          rank: z.number(),
          normalized_query_hash: z.string(),
          query_id: z.string(),
          user: z.string(),
          sql_preview: z.string(),
          metric_value: z.number(),
          duration_ms: z.number(),
          memory_bytes: z.number(),
          read_rows: z.number(),
          read_bytes: z.number(),
          last_execution_time: z.string(),
          execution_count: z.number(),
        })
      ),
    }),
  }),
  check_cluster_health: tool({
    description:
      "Analyze current ClickHouse cluster health using system tables. Returns aggregated metrics and only outlier nodes to keep responses compact. Supports categories: replication, disk, memory, merges, mutations, parts, errors, connections.",
    inputSchema: z
      .object({
        checks: z
          .array(
            z.enum([
              "replication",
              "disk",
              "memory",
              "merges",
              "mutations",
              "parts",
              "errors",
              "connections",
            ])
          )
          .optional()
          .describe(
            "Optional list of health check categories to run. Defaults to all categories when omitted."
          ),
        verbosity: z
          .enum(["summary", "detailed"])
          .optional()
          .describe("Verbosity level for explanations. Currently informational only."),
        thresholds: z
          .object({
            disk_warning: z
              .number()
              .optional()
              .describe("Disk usage warning threshold as percentage (default: 80)."),
            disk_critical: z
              .number()
              .optional()
              .describe("Disk usage critical threshold as percentage (default: 90)."),
            replication_lag_warning_seconds: z
              .number()
              .optional()
              .describe("Replication lag warning threshold in seconds (default: 60)."),
            replication_lag_critical_seconds: z
              .number()
              .optional()
              .describe("Replication lag critical threshold in seconds (default: 300)."),
            parts_warning: z
              .number()
              .optional()
              .describe("Per-table part count warning threshold (default: 500)."),
            parts_critical: z
              .number()
              .optional()
              .describe("Per-table part count critical threshold (default: 1000)."),
          })
          .optional()
          .describe("Optional override thresholds used to classify WARNING vs CRITICAL."),
        max_outliers: z
          .number()
          .optional()
          .describe("Maximum number of outlier nodes/tables to return per category. Default: 10."),
      })
      .satisfies(z.ZodType<CheckClusterHealthInput>),
    outputSchema: z
      .object({
        success: z.boolean(),
        mode: z.enum(["single_node", "cluster"]),
        cluster: z.string().optional(),
        node_count: z.number(),
        summary: z.object({
          total_nodes: z.number(),
          healthy_nodes: z.number(),
          nodes_with_issues: z.number(),
        }),
        categories: z.record(z.any()),
        generated_at: z.string(),
        error: z.string().optional(),
      })
      .satisfies(z.ZodType<CheckClusterHealthOutput>),
  }),
  analyze_cluster_metrics: tool({
    description:
      "Analyze historical cluster metrics (currently memory usage) using system.metric_log. Returns aggregated time-series suitable for trend and anomaly analysis.",
    inputSchema: z
      .object({
        metric_type: z
          .enum(["memory", "disk", "query_latency"])
          .describe(
            "Type of metric to analyze. Currently only 'memory' is implemented; other metrics return an explanatory message."
          ),
        time_window: z
          .number()
          .min(5)
          .max(7 * 24 * 60)
          .optional()
          .describe(
            "Relative lookback window in minutes from now (5 - 10080). Use this OR time_range, not both."
          ),
        time_range: z
          .object({
            from: z
              .string()
              .describe(
                "Start datetime (ISO 8601 format, e.g., '2025-01-01T00:00:00' or '2025-01-01')."
              ),
            to: z
              .string()
              .describe(
                "End datetime (ISO 8601 format, e.g., '2025-01-02T00:00:00' or '2025-01-02')."
              ),
          })
          .optional()
          .describe(
            "Absolute time range for historical analysis. If provided, takes precedence over time_window."
          ),
        granularity_minutes: z
          .number()
          .min(1)
          .max(24 * 60)
          .optional()
          .describe(
            "Aggregation granularity in minutes for time buckets. Default: 5. Example: 60 = one point per hour."
          ),
      })
      .satisfies(z.ZodType<AnalyzeClusterMetricsInput>),
    outputSchema: z
      .object({
        success: z.boolean(),
        metric_type: z.enum(["memory", "disk", "query_latency"]),
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
      .satisfies(z.ZodType<AnalyzeClusterMetricsOutput>),
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
  FIND_EXPENSIVE_QUERIES: "find_expensive_queries",
  CHECK_CLUSTER_HEALTH: "check_cluster_health",
  ANALYZE_CLUSTER_METRICS: "analyze_cluster_metrics",
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
  find_expensive_queries: findExpensiveQueriesExecutor,
  check_cluster_health: checkClusterHealthExecutor,
  analyze_cluster_metrics: analyzeClusterMetricsExecutor,
};
