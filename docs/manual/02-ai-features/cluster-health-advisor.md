---
title: Cluster Health Advisor
description: Use AI-powered cluster health analysis to detect issues in your ClickHouse cluster before they become critical. Get instant diagnostics, outlier detection, and actionable remediation commands for replication, disk, memory, parts, mutations, merges, errors, and connections.
head:
  - - meta
    - name: keywords
      content: ClickHouse cluster health, ClickHouse monitoring, replication lag, disk usage, memory usage, parts explosion, stuck mutations, ClickHouse errors, ClickHouse observability, AI cluster advisor, database health check
---

# Cluster Health Advisor

The **Cluster Health Advisor** is an AI-powered assistant that analyzes the health of your ClickHouse cluster, identifies issues across nodes, and suggests concrete remediation steps. It helps you move from reactive firefighting to **proactive cluster operations**, even on large deployments.

## What the Cluster Health Advisor Does

The Cluster Health Advisor combines live system tables with historical metrics to:

- **Summarize cluster health**: Quickly see if your cluster is healthy, degraded, or critical
- **Highlight outliers**: Surface only problematic nodes and tables instead of every replica
- **Classify severity**: Distinguish between 🟢 OK, 🟠 WARNING, and 🔴 CRITICAL conditions
- **Recommend fixes**: Provide ready-to-run ClickHouse commands for remediation

It understands both **single-node** deployments and **clustered** setups, using `clusterAllReplicas` where appropriate to cover all replicas without overwhelming the UI or the AI model.

## Instant Health Checks

### Running a Quick Health Diagnostic

To get an instant snapshot of your cluster health, open the AI chat panel and ask:

- **"Check cluster health"**
- **"Is my ClickHouse cluster healthy?"**
- **"@health full diagnostic"**

Behind the scenes, the Cluster Health Advisor uses the `check_cluster_health` tool to query system tables and return a compact, aggregated view of your environment. Only **outlier nodes and tables** are included in detail so the response stays readable even for large clusters.

### Health Categories Covered

The instant health check evaluates multiple categories:

- **Replication**: Lag, replica availability, read-only replicas, and expired sessions
- **Disk**: Disk usage percentage, free space, and nodes approaching capacity
- **Memory**: Current memory usage and pressure relative to configured limits
- **Merges**: Active merges and long-running merge operations
- **Mutations**: Pending or stuck mutations and their age
- **Parts**: Tables with too many active parts (part explosion)
- **Errors**: Recent errors from `system.errors`, sorted by frequency
- **Connections**: Active queries, active users, and remote addresses

For each category, the advisor summarizes:

- Overall status (🟢 OK, 🟠 WARNING, 🔴 CRITICAL)
- Key metrics (for example, max replication lag or maximum disk usage)
- Top outliers, such as:
  - Replicas with high lag or read-only status
  - Disks above warning or critical thresholds
  - Tables with extreme part counts

This makes it easy to see **which nodes or tables need attention right now**.

## Historical Trend Analysis

### When to Use Historical Metrics

Use historical analysis when you need to answer questions like:

- **"Has memory usage been increasing over the last week?"**
- **"Is this spike in resource usage new or a recurring pattern?"**
- **"How does current pressure compare to typical off-peak hours?"**

In these cases, the Cluster Health Advisor calls the `analyze_cluster_metrics` tool to read from log tables such as `system.metric_log` and build **time-series trends**.

### Current Capabilities

The historical analysis currently focuses on:

- **Memory usage trends**: Derived from `system.metric_log` using the `MemoryTracking` metric

For each historical query, the advisor returns:

- A **time series** of aggregated points (bucketed by a configurable granularity)
- Summary statistics:
  - **min**, **max**, and **average** values
  - A simple **trend direction**: `up`, `down`, `flat`, or `unknown`

The advisor combines this historical view with the instant snapshot to help you answer:

- Whether a problem is **new** or **long-standing**
- Whether it is **getting worse** or **stabilizing**
- Where to focus capacity planning and optimization efforts

## Typical Workflows

### 1. Routine Health Check

Use this when you want to confirm cluster health at the start of the day or before a release:

1. Ask: **"@health full diagnostic"**
2. Review the summary table for overall status and number of affected nodes
3. Inspect category sections (Replication, Disk, Memory, Parts, etc.) for warnings and critical items
4. Apply the suggested remediation commands for the most severe issues first

This workflow is especially useful on large clusters where manually checking all system tables would be time-consuming.

### 2. Investigating a Slow or Unstable Cluster

When you notice slow queries or intermittent instability:

1. Ask: **"Check cluster health"** to get an instant view of current issues
2. If memory or disk looks high, follow up with:
   - **"Show memory usage trend for the last 24 hours"**
3. Use the historical trend to see whether:
   - The issue is tied to a recurring pattern (for example, daily batch jobs)
   - The problem started after a specific change or deployment
4. Use the remediation commands to:
   - Kill stuck mutations
   - Optimize problematic tables
   - Address disk or memory pressure

### 3. Troubleshooting Replication Problems

For replication-related questions:

1. Ask: **"Is replication lagging anywhere?"**
2. The advisor will:
   - Highlight replicas with high `absolute_delay`
   - Mark read-only or expired replicas
   - Show the worst-lagging tables and replicas as outliers
3. Use the recommended commands, for example:
   - `SYSTEM SYNC REPLICA db.table`
   - Commands to investigate or fix missing parts and mutations

By focusing on outlier replicas, the Cluster Health Advisor helps you quickly identify **which nodes are causing cluster-wide replication issues**.

## How Severity and Outliers Are Determined

The health checks internally apply **sensible default thresholds** and surface only significant deviations:

- **Disk usage**
  - 🟠 WARNING when usage is above **80%**
  - 🔴 CRITICAL when usage is above **90%**
- **Replication lag**
  - 🟠 WARNING when lag is above **60 seconds**
  - 🔴 CRITICAL when lag is above **300 seconds**
- **Parts per table**
  - 🟠 WARNING when parts are above **500**
  - 🔴 CRITICAL when parts are above **1000**

For large clusters, the advisor:

- Aggregates metrics for the whole cluster
- Returns only the **top outliers per category** (for example, tables with the highest part counts or disks with the highest usage)

This ensures that responses remain **token-efficient and readable**, even when operating on hundreds of nodes.

## Best Practices

To get the most out of the Cluster Health Advisor:

- **Run checks regularly**: Use the advisor as part of your routine operations, not just during incidents
- **Drill into outliers**: Focus on nodes and tables that repeatedly appear as outliers across checks
- **Combine instant and historical views**: Use the instant snapshot to locate issues and historical trends to understand their evolution
- **Apply remediation commands carefully**: Review suggested commands and confirm they match your environment before executing them

If you run into situations where the advisor cannot access certain system tables or log tables, it will surface descriptive error messages so you can adjust permissions or configuration.

## Related AI Features

- **[Ask AI for Help](./ask-ai-for-help.md)** — Let AI explain and fix SQL errors directly from the Query Editor
- **[Natural Language SQL](./natural-language-sql.md)** — Generate ClickHouse queries from plain-language questions
- **[Query Optimization](./query-optimization.md)** — Analyze slow queries and get evidence-based performance recommendations

