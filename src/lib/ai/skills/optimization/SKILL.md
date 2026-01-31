---
name: optimization
description: Optimize slow queries, analyze SQL performance, find expensive queries. Use when the user mentions slow queries, optimize, performance, cpu, memory, duration.
---

# SQL Optimization Skill

Use this skill when the user asks to optimize slow queries, analyze performance, or find expensive queries by metric (cpu, memory, disk, duration). Workflow is evidence-driven: collect evidence with tools, then recommend based on evidence only.

## Pre-flight Check

1. **HAS SQL**: Conversation contains a SQL query → Go to WORKFLOW step 2 (Collect Evidence).
2. **HAS QUERY_ID**: Conversation contains query_id → Go to WORKFLOW step 2.
3. **DISCOVERY REQUEST**: User asks to find/optimize expensive queries by metric → Go to WORKFLOW step 1 (Discovery).
4. **NEITHER**: Ask user to provide SQL, query_id, or specify metric (cpu/memory/disk/duration).

## Discovery

- Trigger: "find top N queries by cpu/memory/duration", "optimize the slowest queries", "what queries consume most memory".
- Metric mapping: cpu/CPU time/processor → "cpu"; memory/RAM/mem → "memory"; slow/duration/time/latency → "duration"; disk/I/O/read bytes → "disk".
- **Limitation**: `find_expensive_queries` ONLY supports cpu, memory, disk, duration. It cannot filter by user, database, table name, or query pattern. If user needs other filters, ask for query_id or use supported metrics.

## Time Filtering

- `time_window`: Relative minutes from now (e.g., 60 = last hour).
- `time_range`: Absolute range `{ from: "ISO date", to: "ISO date" }`.
- When calling `collect_sql_optimization_evidence` after `find_expensive_queries`, you MUST pass the same time_window or time_range used in discovery.

## Workflow

1. **Discovery (if needed)**: Call `find_expensive_queries` with metric, limit, and time_window/time_range. Then proceed with top result(s).
2. **Collect Evidence**: Call `collect_sql_optimization_evidence` with sql or query_id (and same time params if coming from discovery). Gathers query_log, EXPLAIN, table schemas, settings.
3. **Analyze**: Review evidence for optimization opportunities.
4. **Recommendations**: Rank by Impact/Risk/Effort. Prefer low-risk query rewrites first.
5. **Validate**: Use `validate_sql` for any proposed SQL changes. Add inline comments (-- comment) to highlight key changes.

## Table Schema Evidence

Use table_schema fields: columns, engine, partition_key, primary_key, sorting_key, secondary_indexes. Use secondary_indexes to suggest new indexes (bloom_filter, minmax, set) for frequently filtered columns.

## Rules

- Do NOT recommend based on assumptions. If evidence is missing, collect it with tools.
- If tools return NO meaningful evidence, output only a brief 3-5 sentence message explaining what's missing.
- Always validate proposed SQL with `validate_sql` before recommending.
