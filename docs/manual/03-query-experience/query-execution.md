---
title: Query Execution
description: Execute ClickHouse queries with DataStoria - run full queries or selections, view results, export data. Complete guide to query execution, result viewing, and data management.
head:
  - - meta
    - name: keywords
      content: query execution, run SQL query, execute ClickHouse query, SQL results, query output, data export, query management, ClickHouse execution
---

# Query Execution

DataStoria provides a powerful query execution system that allows you to run ClickHouse queries, view results in various formats. This guide covers everything you need to know about executing queries and managing results.

## Overview

The query execution system provides:

- **Multiple Execution Methods**: Execute full queries or selected portions
- **Query Log Inspector**: Provides an inspector for query log

## Running Queries

> **Tip**: Use the [SQL Editor](./sql-editor.md) to write queries, and check [Query Log Inspector](./query-log-inspector.md) to analyze performance.

### Basic Execution

1. **Type Your Query**: Enter your SQL query in the editor
2. **Execute**: Press `Ctrl + Enter` (Windows/Linux) or `Command + Enter` (Mac)
3. **View Results**: Results appear in the query results panel below the editor

### Executing Selected Text

You can execute only a portion of your query:

1. **Select Text**: Highlight the portion of the query you want to execute
2. **Execute Selection**: Press `Ctrl + Enter` / `Command + Enter`
3. **Results**: Only the selected portion is executed

This is useful for:
- Testing individual parts of complex queries
- Debugging specific query sections
- Running queries incrementally

## Viewing Results

### Result Formats

DataStoria by default uses ClickHouse's PrettyCompactMonoBlock format, but you can use the FORMAT clause in SQL to change the output format as you want.

#### Table View (Default)

- **PrettyCompactMonoBlock**: Formatted text table with row numbers
- **Best for**: Human-readable results, small to medium datasets
- **Features**: 
  - Row numbers
  - Formatted numbers and dates
  - Scrollable table

#### Vertical Format

Execute queries ending with `\G` to get vertical format:

```sql
SELECT * FROM users WHERE id = 1 \G
```

- **Best for**: Wide tables with many columns
- **Features**: Each row displayed as key-value pairs

#### JSON Format

- **Best for**: Programmatic access, API integration
- **Features**: Structured JSON output

#### CSV Format

- **Best for**: Data export, spreadsheet import
- **Features**: Comma-separated values

### Result Display Features

#### Scrolling and Navigation

- **Auto-scroll**: Results automatically scroll as new data arrives
- **Manual Scroll**: Scroll through results manually
- **Jump to Top/Bottom**: Quick navigation buttons

## Query History

Coming soon

## Query Management

### Cancelling Queries

To cancel a running query:

1. **Identify Running Query**: Look for queries marked as "Executing"
2. **Click Cancel**: Use the cancel button on the query
3. **Confirmation**: Query execution stops immediately

**Note:** Cancelled queries may still show partial results if data was already received.

### Query Timeout

- **Default Timeout**: Queries have a default timeout period
- **Long-running Queries**: Very long queries may timeout
- **Adjusting Timeout**: Configure timeout in connection settings or in the 'App Setting'

### Concurrent Queries

- **Multiple Queries**: You can run multiple queries simultaneously
- **Query Queue**: Queries are queued and executed in order
- **Resource Management**: System manages resources efficiently

## Performance Metrics

### Execution Information

For each query, you can view:

- **Execution Time**: Total time taken to execute
- **Rows Returned**: Number of result rows
- **Bytes Read**: Amount of data read from disk
- **Memory Used**: Memory consumption during execution
- **Query ID**: ClickHouse query ID for server-side tracking


## Limitations

- **Result Size**: Very large result sets may impact browser performance
- **History Limit**: Query history has a maximum size limit
- **Concurrent Queries**: Too many concurrent queries may slow down the interface
- **Export Limits**: Very large exports may take significant time

## Next Steps

- **[Query Explain](./query-explain.md)** — Understand query execution plans
- **[Error Diagnostics](./error-diagnostics.md)** — Learn how to diagnose and fix errors
- **[Query Log Inspector](./query-log-inspector.md)** — Analyze query performance and history

