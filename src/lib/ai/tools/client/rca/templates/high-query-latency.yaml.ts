export const HIGH_QUERY_LATENCY_TEMPLATE_SOURCE = String.raw`
symptom: high_query_latency

observations:
  - id: query_log
    kind: sql_observation
    stage: "rca high_query_latency: query_log"
    progress: 40
    source: system.query_log
    description: "Latency summary over last {timeWindowMinutes} minutes"
    scope_summary:
      level: cluster
      aggregation_semantics: quantile
      cluster_aggregation: "cluster-wide query_log quantiles"
    sql: |
      SELECT
        quantileExact(0.95)(query_duration_ms) AS p95_ms,
        quantileExact(0.99)(query_duration_ms) AS p99_ms,
        avg(read_rows) AS avg_read_rows,
        avg(read_bytes) AS avg_read_bytes,
        avg(memory_usage) AS avg_memory_bytes,
        any(toString(normalized_query_hash)) AS sample_query_hash
      FROM {clusterAllReplicas:system.query_log}
      WHERE {timeFilterExpression}
        AND type = 'QueryFinish'
        AND {scopeFilterExpression}
    metrics:
      - name: p95_ms
        type: number
        decimals: 2
      - name: p99_ms
        type: number
        decimals: 2
      - name: avg_read_rows
        type: number
        decimals: 2
      - name: avg_read_bytes
        type: number
        decimals: 2
      - name: avg_memory_bytes
        type: number
        decimals: 2
      - name: sample_query_hash
        type: string

  - id: merges
    kind: sql_observation
    stage: "rca high_query_latency: merges"
    progress: 45
    source: system.merges
    description: "Merge pressure snapshot"
    scope_summary:
      level: cluster
      aggregation_semantics: additive
      cluster_aggregation: "sum/max across replicas"
    sql: |
      SELECT
        count() AS active_merges,
        max(elapsed) AS max_merge_elapsed_seconds
      FROM {clusterAllReplicas:system.merges}
    metrics:
      - name: active_merges
        type: number
      - name: max_merge_elapsed_seconds
        type: number
        decimals: 2

  - id: memory_metrics
    kind: sql_observation
    stage: "rca high_query_latency: metrics"
    progress: 50
    source: system.asynchronous_metrics
    description: "Memory pressure hotspot snapshot over last {timeWindowMinutes} minutes"
    scope_summary:
      level: cluster
      aggregation_semantics: ratio
      cluster_aggregation: "max per-node memory ratio"
    top_nodes:
      use: single_metric_node
      node_metric: max_memory_node
      metric_name: memory_used_percent
      value_metric: memory_used_percent_max
    nodes_over_threshold:
      use: single_metric_threshold
      node_metric: max_memory_node
      metric_name: memory_used_percent
      value_metric: memory_used_percent_max
      threshold: memory_used_percent_gte
    sql: |
      SELECT
        ifNull(max(memory_used_percent), 0) AS memory_used_percent_max,
        ifNull(argMax(host, memory_used_percent), '') AS max_memory_node
      FROM (
        SELECT
          hostName() AS host,
          (SELECT value FROM system.metrics WHERE metric = 'MemoryTracking') AS usedBytes,
          (SELECT value FROM system.asynchronous_metrics WHERE metric = 'OSMemoryTotal') AS totalBytes,
          ifNull(usedBytes / nullIf(totalBytes, 0) * 100, 0) AS memory_used_percent
        FROM {clusterAllReplicas:system.one}
      )
    metrics:
      - name: memory_used_percent_max
        type: number
        decimals: 2
      - name: max_memory_node
        type: string

candidates:
  - cause: full_scan
    observations: [query_log]
    next_checks:
      - "inspect query plan for high-latency hashes and verify predicate selectivity"
    indicators:
      - description: "avg read rows >= {threshold.avg_read_rows_gte}"
        actual_template: "{query_log.avg_read_rows:.2f}"
        match:
          kind: comparison
          left: { observation: query_log, metric: avg_read_rows }
          operator: gte
          right: { threshold: avg_read_rows_gte }
      - description: "avg read bytes >= {threshold.avg_read_bytes_gte}"
        actual_template: "{query_log.avg_read_bytes:.2f}"
        match:
          kind: comparison
          left: { observation: query_log, metric: avg_read_bytes }
          operator: gte
          right: { threshold: avg_read_bytes_gte }
      - description: "p99 latency >= {threshold.p99_latency_ms_gte}ms"
        required: true
        actual_template: "{query_log.p99_ms:.2f}ms"
        match:
          kind: comparison
          left: { observation: query_log, metric: p99_ms }
          operator: gte
          right: { threshold: p99_latency_ms_gte }

  - cause: merge_pressure
    observations: [query_log, merges]
    next_checks:
      - "check part churn and merge scheduler pressure on top tables"
    indicators:
      - description: "active merges > {threshold.active_merges_gt}"
        required: true
        actual_template: "{merges.active_merges}"
        match:
          kind: comparison
          left: { observation: merges, metric: active_merges }
          operator: gt
          right: { threshold: active_merges_gt }
      - description: "max merge elapsed > {threshold.max_merge_elapsed_seconds_gt}s"
        actual_template: "{merges.max_merge_elapsed_seconds:.2f}s"
        match:
          kind: comparison
          left: { observation: merges, metric: max_merge_elapsed_seconds }
          operator: gt
          right: { threshold: max_merge_elapsed_seconds_gt }
      - description: "p95 latency >= {threshold.p95_latency_ms_gte}ms"
        actual_template: "{query_log.p95_ms:.2f}ms"
        match:
          kind: comparison
          left: { observation: query_log, metric: p95_ms }
          operator: gte
          right: { threshold: p95_latency_ms_gte }

  - cause: memory_pressure
    observations: [query_log, memory_metrics]
    indicators:
      - description: "memory used >= {threshold.memory_used_percent_gte}%"
        required: true
        actual_template: "{memory_metrics.memory_used_percent_max:.2f}%"
        match:
          kind: comparison
          left: { observation: memory_metrics, metric: memory_used_percent_max }
          operator: gte
          right: { threshold: memory_used_percent_gte }
      - description: "avg query memory >= {threshold.avg_query_memory_bytes_gte}"
        actual_template: "{query_log.avg_memory_bytes:.2f}"
        match:
          kind: comparison
          left: { observation: query_log, metric: avg_memory_bytes }
          operator: gte
          right: { threshold: avg_query_memory_bytes_gte }
      - description: "p99 latency >= {threshold.p99_latency_ms_gte}ms"
        actual_template: "{query_log.p99_ms:.2f}ms"
        match:
          kind: comparison
          left: { observation: query_log, metric: p99_ms }
          operator: gte
          right: { threshold: p99_latency_ms_gte }

actions:
  - title: "Inspect top slow query patterns and optimize filters/index usage"
    risk: low
    tied_to: full_scan
  - title: "Reduce merge pressure by smoothing ingest and checking part churn"
    risk: medium
    tied_to: merge_pressure
  - title: "Review memory-heavy queries and memory limits"
    risk: medium
    tied_to: memory_pressure
`;
