---
name: clickhouse-system-queries
description: Dispatcher skill for ClickHouse system-table operational queries. Use table-specific references for concrete SQL patterns.
---

# ClickHouse System Queries Skill

Use this skill when the user asks for operational inspection on ClickHouse `system.*` tables.

Current table coverage:

- `system.query_log` via `references/system-query-log.md`

Relationship to `sql-expert`:

- `sql-expert` handles general SQL generation and user/business tables.
- This skill handles system-table operational patterns and routing to table-specific references.

## Workflow

1. Resolve target system table and intent.
   - Identify whether the request is about query history (`system.query_log`) or other system tables.
   - If user does not provide a new time window, inherit the most recent explicit time window/range from conversation.
   - If no prior explicit time context exists, default to the last 60 minutes.

2. Load the matching reference and follow it strictly.
   - `system.query_log` -> `references/system-query-log.md`
   - For unsupported system tables, use `sql-expert` for safe fallback SQL generation.

3. Execute with `execute_sql`.
   - Default to `LIMIT 50` unless the user specifies otherwise.
   - Keep predicates aligned with intent and table semantics.

4. Summarize with concise findings and next actions.

## Guardrails

- Always apply time bounds for log-like system tables.
- Always use the table-specific reference when available.
- Never omit `LIMIT` in exploratory queries.
