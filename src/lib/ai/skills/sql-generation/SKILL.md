---
name: sql-generation
description: Generate ClickHouse SQL from natural language. Use when the user asks to write SQL, generate a query, or get data (counts, lists, filters).
---

# SQL Generation Skill

Use this skill when the user asks for SQL generation, query writing, or data retrieval (counts, lists, filters). **Generate the SQL yourself** following the rules below, then call `validate_sql` with your SQL. Do not write SQL in your conversational text; pass it only as the argument to `validate_sql` (and then `execute_sql` if the user wants to run it).

## Requirements

- Generate ONLY valid ClickHouse SQL syntax.
- **CRITICAL**: Always use fully qualified table names: `database.table` (e.g., `system.query_log`, `default.events`). Never use unqualified table names.
- Always use LIMIT clauses for queries that will be executed to fetch data.
- Use bounded time windows for time-series queries (e.g., last 24 hours, last 7 days).
- **CRITICAL**: Do NOT include a trailing semicolon (;) at the end of SQL queries.
- **Enum Column Filtering**: When filtering by enum columns, use the exact enum literal from the schema (case-sensitive). Do not guess enum values.
- **Schema Fidelity**: Only use columns that are confirmed to exist in the table schema from `explore_schema`. Do not assume standard columns exist if they are not in the tool output.

## Performance Optimization (CRITICAL)

When Schema Context shows PRIMARY KEY or PARTITION BY:
- **PRIMARY KEY**: Add filters on primary key columns in WHERE when possible; order by primary key columns for efficient scanning.
- **PARTITION BY**: Include a filter on the partition column when possible for partition pruning (e.g., `WHERE event_date >= today() - 30`).
- If both are shown, your WHERE clause MUST include filters on at least the partition key column(s).

## User Context

When the user asks about their own data or user-specific information, use the authenticated ClickHouse user from context (e.g., `WHERE user = '<clickHouseUser>'`). Do not use current_user() or placeholders.

## ProfileEvents & Metrics

- Check the schema for `ProfileEvents` (Map).
- If `ProfileEvents` Map exists: use syntax `ProfileEvents['EventName']`.
- If the schema has flattened columns (e.g., `ProfileEvent_Query`): use the column name directly (e.g., `ProfileEvent_DistributedConnectionFailTry`).
- **CRITICAL**: Do NOT assume `ProfileEvents` map exists. Verify it in the schema first.

## Workflow

1. If schema is missing, use `get_tables` and `explore_schema` to discover it.
2. Generate the SQL following the rules above (using the conversation and schema context).
3. Call `validate_sql` with your generated SQL. If validation fails, fix the SQL using the error message (e.g., wrong table/column names, syntax) and call `validate_sql` again. Retry up to 3 times.
4. Only after validation passes, call `execute_sql` with the same SQL if the user wants to run the query, or use the SQL for visualization/chart requests.

- ❌ Do not output raw SQL in markdown or text; pass it only to `validate_sql` and `execute_sql`.
- ✅ Generate SQL → validate_sql → fix and retry on error → execute_sql after validation passes.
