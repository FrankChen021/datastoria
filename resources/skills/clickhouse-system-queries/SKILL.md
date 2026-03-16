---
name: clickhouse-system-queries
description: Dispatcher skill for ClickHouse system-table operational queries. Use table-specific references for concrete SQL patterns.
metadata:
  author: DataStoria
---

# ClickHouse System Queries Skill

Use this skill when the user asks for operational inspection on ClickHouse `system.*` tables.

Current table coverage:

- `system.query_log` via `references/system-query-log.md`

Relationship to `sql-expert`:

- `sql-expert` handles general SQL generation and user/business tables.
- This skill handles system-table operational patterns and routing to table-specific references.

## System Metrics and ProfileEvents

- For metric-style columns in system tables, first confirm the actual column shape from schema/reference before writing predicates.
- If the user already named an exact metric or event identifier, your first `explore_schema` call MUST pass that identifier in the `columns` list instead of loading the full table schema.
- Treat exact flattened metric names such as `ProfileEvent_DistributedConnectionFailTry` as candidate columns unless the schema shows the table stores them in a map instead.
- If `ProfileEvents` is a `Map`, access entries as `ProfileEvents['Name']`.
- If the table exposes flattened columns, use `ProfileEvent_Name`.
- Apply the same rule to other metric maps or flattened event columns: use the representation that exists in the target table, not the one you assume.

## Workflow

1. Resolve target system table and intent.
   - Identify whether the request is about query history (`system.query_log`) or other system tables.
   - If user does not provide a new time window, inherit the most recent explicit time window/range from conversation.
   - If no prior explicit time context exists, default to the last 60 minutes.

2. Load the matching reference and follow it strictly.
   - For `system.query_log`, you MUST call `skill_resource` to load `references/system-query-log.md` before writing, validating, or executing any SQL against `system.query_log`.
   - For unsupported system tables, use `sql-expert` for safe fallback SQL generation.

3. Execute with `execute_sql`.
   - For `system.query_log`, use `search_query_log` only for standard ranked searches and filtered lookups that return raw executions or grouped patterns.
   - If the user wants visualization, time-bucketed aggregation, trends, histograms, or SQL grouped by hour/day/week/month, do NOT use `search_query_log`; generate SQL from `references/system-query-log.md` instead.
   - Use `execute_sql` only when the request cannot be expressed by `search_query_log`, or when the task explicitly needs SQL output for visualization/chart rendering.
   - Default to `LIMIT 50` unless the user specifies otherwise.
   - Keep predicates aligned with intent and table semantics.

4. Summarize with concise findings and next actions.

## Guardrails

- Always apply time bounds for log-like system tables.
- Always use the table-specific reference when available.
- Never generate `system.query_log` SQL until `references/system-query-log.md` is loaded in the current turn.
- Never use `search_query_log` for chart-oriented `system.query_log` requests.
- Never omit `LIMIT` in exploratory queries.
