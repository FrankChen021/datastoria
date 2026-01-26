---
title: system.query_log Introspection
description: Analyze ClickHouse query_log with filters, charts, and AI insights. Monitor query performance, debug errors, and track execution patterns with visual query log analysis.
head:
  - - meta
    - name: keywords
      content: query_log, system.query_log, query log analysis, query monitoring, query performance, ClickHouse queries, query debugging, query metrics, execution tracking
---

# system.query_log Introspection

The Query Log Introspection tool provides deep insights into all queries executed on your ClickHouse cluster in visualized way.

It provides multiple filters and distribution charts as well as a detail table for us to quick find queries from the UI without manually writing multiple SQLs on the `system.query_log` table.

## Prerequisites

> **Note**: Read access to the `system.query_log` table is required to use this introspection tool. Ensure your user has the necessary system table privileges.

## UI

<Video src="./img/system-query-log.gif" alt="System query log interface displaying detailed query execution metrics including duration, memory usage, and rows processed" />

## When you can use the query log instropection tool

### Performance Analysis

1. **Filter by Duration**: Sort by duration to find slow queries
2. **Analyze Patterns**: Use distribution chart to identify peak times
3. **Compare Nodes**: Filter by hostname to compare performance across nodes
4. **Track Trends**: Use time range selector to see performance over time

### Error Debugging

1. **Filter by Exception**: Use exception_code filter to focus on errors
2. **View Error Details**: Expand rows to see full error messages
3. **Use AI Explain**: Click "Explain Error" to get AI-powered error analysis
4. **Track Error Frequency**: Use distribution chart to see error spikes

### Query Optimization

1. **Identify Expensive Queries**: Sort by read_bytes or duration
2. **Use AI Optimization**: Click "Ask AI for Optimization" on slow queries
3. **Compare Queries**: Filter by table to see all queries for a table
4. **Monitor Improvements**: Track query performance over time

### Security and Auditing

1. **Filter by User**: Monitor queries by specific users
2. **Track Table Access**: Filter by table to see who accesses what
3. **Review Failed Queries**: Filter by exception to see security-related errors
4. **Export Data**: Use table features to export audit logs

## Query Log Filtering

The query log supports comprehensive filtering:

### Time Filter

- **Type**: DateTime range selector
- **Default**: Last 15 minutes
- **Options**: Predefined ranges or custom time selection
- **Timezone**: Respects your configured timezone

### Hostname Filter

- **Type**: Multi-select dropdown
- **Source**: Distinct hostnames from `system.clusters`
- **Default**: Current node (in single-node mode, this filter is hidden)
- **Use Case**: Filter queries by specific nodes in a cluster

### Query Type Filter

- **Type**: Multi-select dropdown
- **Options**:
  - QueryStart
  - QueryFinish
  - ExceptionBeforeStart
  - ExceptionWhileProcessing
- **Default**: Excludes QueryStart (shows completed/failed queries)
- **Use Case**: Focus on completed queries or errors

### Query Kind Filter

- **Type**: Multi-select dropdown
- **Source**: Distinct query_kind values from `system.query_log`
- **Options**: Select, Insert, Create, Drop, Alter, etc.
- **Default**: Excludes Insert queries
- **Use Case**: Filter by operation type

### Database Filter

- **Type**: Multi-select dropdown
- **Source**: Distinct databases from `system.query_log`
- **Use Case**: Focus on queries for specific databases

### Table Filter

- **Type**: Multi-select dropdown
- **Source**: Distinct tables from `system.query_log`
- **Supported Comparators**: =, !=, in, not in
- **Use Case**: Track queries accessing specific tables

### Exception Code Filter

- **Type**: Multi-select dropdown
- **Source**: Distinct exception_code values
- **Use Case**: Filter by specific error types

### User Filter

- **Type**: Multi-select dropdown
- **Source**: Distinct initial_user values
- **Use Case**: Monitor queries by specific users

### Input Filter

- **Type**: Free-text search using ClickHouse filter expression
- **Scope**: Searches across all columns
- **Use Case**: Quick search for specific queries, users, or error messages
- **Example**:

  ```sql
  query like '%metrics%'
  ```

## AI-Powered Actions

Each query log row includes an action menu with AI-powered features:

### Ask AI for Optimization

- **Icon**: Sparkle/Wand icon
- **Function**: Analyzes the query and suggests optimizations
- **Process**:
  1. Extracts the query text from the log
  2. Opens a new chat with optimization request
- **Use Case**: Get AI suggestions for improving query performance

### Explain Error

- **Icon**: Alert circle icon (only shown for queries with exceptions)
- **Function**: Explains the error and suggests fixes
- **Process**:
  1. Extracts the query and error message from the log
  2. Opens a new chat with error explanation request
- **Use Case**: Understand and fix query errors quickly

## Next Steps

- **[Query Log Inspector](../03-query-experience/query-log-inspector.md)** — Analyze specific query execution
- **[System Log Introspection](./system-log-introspection.md)** — Overview of all system log tools
- **[system.ddl_distribution_queue Introspection](./system-ddl-distributed-queue.md)** — Monitor distributed DDL operations
- **[system.part_log Introspection](./system-part-log.md)** — Monitor part-level operations
- **[system.query_views_log Introspection](./system-query-views-log.md)** — Monitor query view executions

