---
name: optimization
description: Optimize slow queries and analyze SQL performance. Use when the user mentions optimize, slow, latency, performance, cpu, memory, or duration.
---

# SQL Optimization Skill

Use this skill when the user asks to optimize slow queries or analyze SQL performance. Workflow is evidence-driven: collect evidence with tools, then recommend based on evidence only.

## Pre-flight Check

1. **HAS SQL**: Conversation contains a SQL query → Go to WORKFLOW step 2 (Collect Evidence).
2. **HAS QUERY_ID**: Conversation contains query_id → Go to WORKFLOW step 2 (Call `collect_sql_optimization_evidence` immediately).
3. **DISCOVERY REQUEST**: User asks to optimize the slowest/heaviest queries but does not provide SQL/query_id → Go to WORKFLOW step 1 (Discovery).
4. **NEITHER**: Output ONLY a concise 1-sentence request for the SQL query or query_id (e.g. "Please provide the SQL query or query_id you'd like to optimize."). Do NOT ask for any other details (like version, table sizes, etc.). Then include the following UI trigger block in the response (must be present and unchanged; place it at the end of the reply):

```user_actions
{ "type": "optimization_skill_input" }
```

## Discovery

- When candidates need to be found from `system.query_log` (slowest, most expensive, user-scoped, etc.), load the `clickhouse-system-queries` skill and follow its reference for `system.query_log`. Do NOT write ad-hoc SQL against `system.query_log` from this skill.
- Extract `query_id` from the discovery results for the next step (evidence collection).

## Time Filtering

- `time_window`: Relative minutes from now (e.g., 60 = last hour).
- `time_range`: Absolute range `{ from: "ISO date", to: "ISO date" }`.
- When calling `collect_sql_optimization_evidence` after discovery, you MUST pass the same time_window or time_range used in discovery.

## Workflow

1. **Discovery (if needed)**: Load `clickhouse-system-queries` skill and use its `system.query_log` reference to find candidates. Extract `query_id` from the results.
2. **Collect Evidence**: Call `collect_sql_optimization_evidence` with query_id (preferred) or sql (and same time params if coming from discovery).
3. **Analyze**: Review evidence for optimization opportunities.
4. **Recommendations**: Rank by Impact/Risk/Effort. Prefer low-risk query rewrites first.
5. **Validate**: Use `validate_sql` for any proposed SQL changes. Add inline comments (-- comment) to highlight key changes.

## Table Schema Evidence

- Use table_schema fields: columns, engine, partition_key, primary_key, sorting_key, secondary_indexes.
- Suggest secondary indexes only when evidence shows frequent WHERE filters on selective columns and the index type fits the predicate.
  - Use `minmax` for range predicates on sorted columns.
  - Use `set` for low-cardinality equality filters.
  - Use `bloom_filter` for high-cardinality equality filters (e.g., trace_id, user_id).
  - Use `tokenbf_v1` for frequent token-based text search.

## Rules

- Do NOT recommend based on assumptions. If evidence is missing, collect it with tools.
- If tools return NO meaningful evidence, output only a brief 3-5 sentence message explaining what's missing.
- Always validate proposed SQL with `validate_sql` before recommending.
- If discovery results include both query text and query_id, prefer query_id to avoid truncation issues.
- If the SQL appears incomplete (truncated/ellipsized/ends mid-clause), use `query_id` instead of sql.
- When both `query_id` and SQL are available, prefer `query_id` to reduce tokens and avoid truncation issues.
