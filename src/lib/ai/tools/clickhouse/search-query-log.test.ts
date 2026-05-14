import type { Connection, JSONCompactFormatResponse } from "@/lib/connection/connection";
import { describe, expect, it, vi } from "vitest";
import {
  buildSearchQueryLogSql,
  resolveMetricExpression,
  searchQueryLogExecutor,
} from "./search-query-log";

function createJsonCompactResponse(
  meta: JSONCompactFormatResponse["meta"],
  data: JSONCompactFormatResponse["data"]
) {
  return {
    data: {
      json: () => ({
        meta,
        data,
        rows: data.length,
        statistics: {
          elapsed: 0,
          rows_read: 0,
          bytes_read: 0,
        },
      }),
    },
  };
}

describe("search_query_log helpers", () => {
  it("resolves cpu metric from ProfileEvents map when available", () => {
    expect(resolveMetricExpression("cpu", new Set(["ProfileEvents", "query_duration_ms"]))).toEqual(
      {
        expression: "ProfileEvents['OSCPUVirtualTimeMicroseconds']",
        label: "CPU Time (us)",
      }
    );
  });

  it("requires ProfileEvents for cpu metric access", () => {
    expect(() => resolveMetricExpression("cpu", new Set(["query_duration_ms"]))).toThrow(
      "Metric 'cpu' is not available in system.query_log on this server."
    );
  });

  it("builds patterns SQL with defaults and validated predicates", () => {
    const result = buildSearchQueryLogSql(
      {
        mode: "patterns",
        metric: "duration",
        time_window: 1440,
        predicates: [
          { field: "database", op: "has", value: "bithon" },
          { field: "user", op: "in", value: ["alice", "bob"] },
          { field: "query", op: "contains_ci", value: "join" },
        ],
      },
      new Set(["query_duration_ms"])
    );

    expect(result.defaultsApplied).toEqual([
      "type = QueryFinish",
      "is_initial_query = 1",
      "query_kind = Select",
    ]);
    expect(result.filtersApplied).toEqual([
      'database has "bithon"',
      'user in ["alice","bob"]',
      'query contains_ci "join"',
    ]);
    expect(result.sql).toContain("FROM {clusterAllReplicas:system.query_log}");
    expect(result.sql).toContain("has(databases, 'bithon')");
    expect(result.sql).toContain("user IN ('alice', 'bob')");
    expect(result.sql).toContain("positionCaseInsensitive(query, 'join') > 0");
    expect(result.sql).toContain("sum(query_duration_ms) AS metric_value");
    expect(result.sql).toContain("ORDER BY metric_value DESC, last_execution_time DESC");
  });

  it("keeps table predicates on the source column in patterns mode", () => {
    const result = buildSearchQueryLogSql(
      {
        mode: "patterns",
        metric_aggregation: "sum",
        limit: 20,
        time_window: 1440,
        predicates: [{ field: "table", op: "has", value: "bithon_trace_span_summary_local" }],
      },
      new Set(["query_duration_ms"])
    );

    expect(result.sql).toContain("has(tables, 'bithon_trace_span_summary_local')");
    expect(result.sql).toContain("any(tables) AS query_log_tables");
    expect(result.sql).not.toContain("any(tables) AS tables");
  });

  it("lets explicit predicates override default query_kind and is_initial_query filters", () => {
    const result = buildSearchQueryLogSql(
      {
        mode: "executions",
        predicates: [
          { field: "query_kind", op: "eq", value: "Insert" },
          { field: "is_initial_query", op: "eq", value: false },
          { field: "has_error", op: "eq", value: true },
        ],
      },
      new Set(["memory_usage"])
    );

    expect(result.defaultsApplied).toEqual(["type = QueryFinish"]);
    expect(result.sql).toContain("query_kind = 'Insert'");
    expect(result.sql).toContain("is_initial_query = 0");
    expect(result.sql).toContain("(ifNull(exception, '') != '') = 1");
    expect(result.sql).not.toContain("query_kind = 'Select'");
    expect(result.sql).not.toContain("is_initial_query = 1");
    expect(result.sql).toContain("ORDER BY event_time DESC");
  });

  it("treats date-only time_range.to as an inclusive day bound", () => {
    const result = buildSearchQueryLogSql(
      {
        mode: "patterns",
        time_range: { from: "2025-01-01", to: "2025-01-01" },
      },
      new Set(["query_duration_ms"])
    );

    expect(result.sql).toContain("event_time >= toDateTime('2025-01-01')");
    expect(result.sql).toContain("event_time < toDateTime('2025-01-01') + INTERVAL 1 DAY");
  });

  it("caches query_log columns inside the tool", async () => {
    const query = vi.fn((sql: string) => {
      if (sql.includes("FROM system.columns")) {
        return {
          response: Promise.resolve(
            createJsonCompactResponse(
              [{ name: "name", type: "String" }],
              [["ProfileEvents"], ["query_duration_ms"]]
            )
          ),
          abortController: new AbortController(),
        };
      }

      return {
        response: Promise.resolve(
          createJsonCompactResponse(
            [
              { name: "query_id", type: "String" },
              { name: "user", type: "String" },
              { name: "event_time", type: "DateTime" },
              { name: "query_kind", type: "String" },
              { name: "query_duration_ms", type: "UInt64" },
              { name: "memory_usage", type: "UInt64" },
              { name: "read_rows", type: "UInt64" },
              { name: "read_bytes", type: "UInt64" },
              { name: "result_rows", type: "UInt64" },
              { name: "exception", type: "String" },
              { name: "normalized_query_hash", type: "UInt64" },
              { name: "sql_preview", type: "String" },
              { name: "tables", type: "Array(String)" },
              { name: "metric_value", type: "UInt64" },
            ],
            []
          )
        ),
        abortController: new AbortController(),
      };
    });
    const connection = {
      metadata: {},
      query,
    } as unknown as Connection;

    await searchQueryLogExecutor({ mode: "executions", metric: "cpu" }, connection);
    await searchQueryLogExecutor({ mode: "executions", metric: "cpu" }, connection);

    const systemColumnsCalls = query.mock.calls.filter(([sql]) =>
      String(sql).includes("FROM system.columns")
    );

    expect(systemColumnsCalls).toHaveLength(1);
    expect(connection.metadata).toEqual({});
  });

  it("uses internal pattern table projection to qualify previews without leaking it", async () => {
    const query = vi.fn((sql: string) => {
      if (sql.includes("FROM system.columns")) {
        return {
          response: Promise.resolve(
            createJsonCompactResponse(
              [{ name: "name", type: "String" }],
              [
                ["query_duration_ms"],
                ["memory_usage"],
                ["read_rows"],
                ["read_bytes"],
                ["result_rows"],
              ]
            )
          ),
          abortController: new AbortController(),
        };
      }

      return {
        response: Promise.resolve(
          createJsonCompactResponse(
            [
              { name: "normalized_query_hash", type: "UInt64" },
              { name: "sample_query_id", type: "String" },
              { name: "sample_user", type: "String" },
              { name: "sql_preview", type: "String" },
              { name: "last_execution_time", type: "DateTime" },
              { name: "execution_count", type: "UInt64" },
              { name: "avg_duration_ms", type: "Float64" },
              { name: "max_duration_ms", type: "UInt64" },
              { name: "max_memory_usage", type: "UInt64" },
              { name: "sum_read_rows", type: "UInt64" },
              { name: "sum_read_bytes", type: "UInt64" },
              { name: "query_log_tables", type: "Array(String)" },
            ],
            [
              [
                "123",
                "query-1",
                "alice",
                "SELECT * FROM spans",
                "2026-05-14 12:00:00",
                3,
                10,
                15,
                1024,
                100,
                2048,
                ["analytics.spans"],
              ],
            ]
          )
        ),
        abortController: new AbortController(),
      };
    });
    const connection = {
      metadata: {},
      query,
    } as unknown as Connection;

    const result = await searchQueryLogExecutor({ mode: "patterns" }, connection);

    expect(result.success).toBe(true);
    expect(result.rows).toHaveLength(1);
    expect(result.rows[0].sql_preview).toBe("SELECT * FROM analytics.spans");
    expect(result.rows[0]).not.toHaveProperty("query_log_tables");
    expect(result.rows[0]).not.toHaveProperty("tables");
  });
});
