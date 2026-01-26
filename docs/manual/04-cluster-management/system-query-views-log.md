---
title: system.query_views_log Introspection
description: Monitor ClickHouse materialized views and live views execution. Track view performance, analyze read/write patterns, and debug view errors with detailed metrics.
head:
  - - meta
    - name: keywords
      content: query_views_log, system.query_views_log, materialized views, live views, view monitoring, view performance, view execution, ClickHouse views, view metrics
---

# system.query_views_log Introspection

The Query Views Log Introspection tool provides insights into all query view executions on your ClickHouse cluster. It tracks how materialized views, live views, and other view types are being executed and their performance metrics.

It provides multiple filters and more dashboards on the metrics of views for better intropsection.

## Prerequisites

> **Note**: Read access to the `system.query_views_log` table is required to use this introspection tool. Ensure your user has the necessary system table privileges.

## UI

<Video src="./img/system-query-views-log.gif" alt="System query views log interface displaying query execution history with filtering and sorting capabilities" />


## Query Views Log Use Cases

### View Performance Analysis

1. **Monitor View Duration**: Track average view execution times to identify slow views
2. **Analyze Read Patterns**: Use read rows/bytes charts to understand data consumption
3. **Track Write Patterns**: Monitor written rows/bytes to see view output volume
4. **Compare Views**: Filter by view_name to compare performance across different views

### Error Debugging

1. **Filter by Exception**: Use exception_code filter to focus on failed view executions
2. **View Error Details**: Expand rows to see full error messages
3. **Track Error Frequency**: Use distribution chart to see error spikes
4. **Identify Problematic Views**: Filter by view_name and exception to find views with issues

### View Optimization

1. **Identify Slow Views**: Sort by view_duration_ms to find views that need optimization
2. **Monitor Resource Usage**: Track peak_memory_usage and read/write patterns
3. **Compare Time Periods**: Use time range selector to compare performance over time
4. **Node Comparison**: Filter by hostname to compare view performance across nodes

### Materialized View Monitoring

1. **Track Materialization**: Monitor written_rows and written_bytes to see materialization activity
2. **Monitor Lag**: Check event times to identify delays in materialized view updates
3. **Resource Planning**: Use read/write metrics for capacity planning
4. **View Health**: Track exception rates to ensure views are functioning correctly

## Next Steps

- **[Query Log Inspector](../03-query-experience/query-log-inspector.md)** — Analyze specific query execution
- **[System Log Introspection](./system-log-introspection.md)** — Overview of all system log tools
- **[system.ddl_distribution_queue Introspection](./system-ddl-distributed-queue.md)** — Monitor distributed DDL operations
- **[system.part_log Introspection](./system-part-log.md)** — Monitor part-level operations
- **[system.query_log Introspection](./system-query-log.md)** — Analyze query execution logs

