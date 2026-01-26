---
title: system.part_log Introspection
description: Monitor ClickHouse part operations - merges, mutations, downloads, removals. Track part-level performance, identify bottlenecks, and analyze data part lifecycle.
head:
  - - meta
    - name: keywords
      content: part_log, system.part_log, merge monitoring, mutation tracking, part operations, ClickHouse merges, data parts, part lifecycle, merge performance
---

# system.part_log Introspection

The Part Log Introspection tool tracks all part-level operations in your ClickHouse cluster, including merges, mutations, downloads, and removals.

It provides multiple filters and distribution charts as well as a detail table for us to quick find queries from the UI without manually writing multiple SQLs on the `system.part_log` table.

## Prerequisites

> **Note**: Read access to the `system.part_log` table is required to use this introspection tool. Ensure your user has the necessary system table privileges.

## UI

<Video src="./img/system-part-log-introspection.gif" alt="System part log interface showing data part merge operations, mutations, and partition management activities" />

## Use Cases

### Merge Monitoring

1. **Filter by MergeParts**: Focus on merge operations
2. **Monitor Duration**: Sort by duration to find slow merges
3. **Track Frequency**: Use distribution chart to see merge patterns
4. **Identify Issues**: Filter by error to find failed merges

### Mutation Tracking

1. **Filter by MutatePart**: Track ALTER operations
2. **Monitor Progress**: Check duration and status
3. **Identify Bottlenecks**: Find slow mutations
4. **Error Analysis**: Filter by error to debug issues

### Replication Monitoring

1. **Filter by DownloadPart**: Track part downloads from replicas
2. **Monitor Lag**: Check event times to identify replication delays
3. **Error Tracking**: Filter by error to find replication failures
4. **Node Comparison**: Filter by hostname to compare nodes

### Storage Analysis

1. **Filter by NewPart/RemovePart**: Track part lifecycle
2. **Monitor Size**: Sort by size_in_bytes to find large parts
3. **Track Growth**: Use time range to see storage trends
4. **Part Type Analysis**: Filter by part_type to understand storage formats

## Next Steps

- **[Cluster Dashboard](./cluster-dashboard.md)** — Monitor cluster-wide metrics
- **[Node Dashboard](./node-dashboard.md)** — Monitor individual node metrics
- **[System Log Introspection](./system-log-introspection.md)** — Overview of all system log tools
- **[system.ddl_distribution_queue Introspection](./system-ddl-distributed-queue.md)** — Monitor distributed DDL operations
- **[system.query_log Introspection](./system-query-log.md)** — Analyze query execution logs
- **[system.query_views_log Introspection](./system-query-views-log.md)** — Monitor query view executions

