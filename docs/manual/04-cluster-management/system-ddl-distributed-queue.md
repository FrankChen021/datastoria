---
title: system.ddl_distribution_queue Introspection
description: Monitor distributed DDL operations across ClickHouse cluster. Track CREATE, ALTER, DROP statements execution, identify failures, and monitor DDL progress across nodes.
head:
  - - meta
    - name: keywords
      content: ddl_distribution_queue, distributed DDL, DDL monitoring, cluster DDL, DDL operations, DDL tracking, CREATE ALTER DROP, DDL execution, cluster operations
---

# system.ddl_distribution_queue Introspection

The DDL Distribution Queue Introspection tool provides insights into distributed DDL operations across your ClickHouse cluster. It tracks how DDL statements (CREATE, ALTER, DROP, etc.) are distributed and executed across cluster nodes, helping you monitor DDL operation status, identify failures, and track execution progress.

It provides multiple views and filters to help you understand the distribution and execution status of DDL operations across your cluster.

## Prerequisites

> **Note**: 
> 
> 1. Read access to the `system.distributed_ddl_queue` table is required to use this introspection tool. Ensure your user has the necessary system table privileges.
> 2. Your database connection is configured as cluster mode

## UI

<Video src="./img/system-ddl-distributed-queue.gif" alt="System DDL distributed queue interface showing DDL query execution status across cluster nodes with progress indicators" />

## Use Cases

### DDL Operation Monitoring

1. **Track DDL Progress**: Use Aggregated Entries view to see overall status of DDL operations across all hosts
2. **Monitor Execution**: Check per-host status to identify which hosts have completed, are active, or are queued
3. **Identify Failures**: Filter by status or check detail panel to see which hosts failed and why
4. **Track Duration**: Monitor query duration to identify slow DDL operations

### Cluster Health

1. **Host Comparison**: Compare execution status across hosts to identify problematic nodes
2. **Failure Analysis**: Use detail panel to see exception codes and error messages for failed operations
3. **Execution Patterns**: Use the chart to see DDL operation distribution over time
4. **Lag Detection**: Identify hosts that are lagging behind in DDL execution

### Troubleshooting

1. **Failed DDL Operations**: Click on entries with failures to see detailed error information
2. **Stuck Operations**: Identify DDL operations that remain in "Active" or "Queued" status for extended periods
3. **Host Issues**: Filter by host to see all DDL operations for a specific node
4. **Timing Analysis**: Compare query create times and durations across hosts

### DDL Management

1. **Operation Tracking**: Monitor all distributed DDL operations in one place
2. **Status Verification**: Quickly verify that DDL operations have completed successfully across all hosts
3. **Cluster Synchronization**: Ensure DDL operations are properly distributed and executed across the cluster
4. **Historical Analysis**: Use time range selector to review past DDL operations


## DDL Distribution Queue Features

The dashboard provides comprehensive visualization and analysis of distributed DDL operations:

### Charts

- **DDL Queue Entries By Host**: Stacked bar chart showing DDL queue entry count over time, grouped by host. This helps you visualize when DDL operations are being processed and identify any hosts that may be lagging.

### Views

The tool provides two different views for analyzing DDL operations:

#### Aggregated Entries View

This view groups DDL operations by entry ID, providing a high-level overview:

- **Entry**: Unique identifier for the DDL operation
- **Query Create Time**: When the DDL operation was created
- **Cluster**: Target cluster for the DDL operation
- **Query**: The DDL SQL statement (truncated with hover to see full query)
- **Status**: Summary showing percentage breakdown of statuses across all hosts (Finished, Active, Queued, Failed)
- **Hosts**: Number of hosts involved in this DDL operation

**Features:**
- Click on any entry to see detailed information in the side panel
- Status summary shows the distribution of execution states across hosts
- Sorted by query create time (newest first) by default

#### Raw Entries View

This view shows all individual DDL queue records without aggregation:

- **Entry**: DDL operation entry identifier
- **Query Create Time**: When the DDL operation was created
- **Host**: Hostname where the DDL is being executed
- **Status**: Current execution status (Finished, Active, Queued, Failed)
- **Query**: The DDL SQL statement (truncated with hover to see full query)
- **Query Duration**: Execution duration in milliseconds

**Features:**
- See per-host execution details
- Track individual host status for each DDL operation
- Identify which hosts have completed, are active, queued, or failed

### Detail Panel

When you click on an entry in the Aggregated Entries view, a detail panel opens showing:

#### Entry Details

- **Cluster**: Target cluster name
- **Create Time**: When the DDL operation was created
- **Entry Version**: Version of the DDL entry
- **Initiator Host**: Host that initiated the DDL operation

#### Distributed DDL Query

The full DDL SQL statement with syntax highlighting for easy reading.

#### Per-Host DDL Log

A detailed table showing the execution status for each host:

- **Host**: Hostname
- **Status**: Execution status with color-coded icons:
  - ✅ **Finished**: Green (successfully completed)
  - ▶️ **Active**: Blue (currently executing)
  - ⏰ **Queued**: Amber (waiting to execute)
  - ❌ **Failed**: Red (execution failed)
- **Query Create Time**: When the DDL was created on this host
- **Query Duration**: Execution duration in milliseconds
- **Exception Details**: If failed, shows exception code and error message in tooltip

## DDL Distribution Queue Filtering

The DDL distribution queue supports filtering:


## Next Steps

- **[Node Dashboard](../05-monitoring-dashboards/node-dashboard.md)** — Monitor individual node metrics
- **[System Log Introspection](./system-log-introspection.md)** — Overview of all system log tools
- **[system.part_log Introspection](./system-part-log.md)** — Monitor part-level operations
- **[system.query_log Introspection](./system-query-log.md)** — Analyze query execution logs
- **[system.query_views_log Introspection](./system-query-views-log.md)** — Monitor query view executions

