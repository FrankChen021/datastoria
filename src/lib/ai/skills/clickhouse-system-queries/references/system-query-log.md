# system.query_log Reference

Use this reference for operational query inspection on `system.query_log` (slowest queries, top resource-heavy patterns, user/database scoped workload).

## SQL Construction

Always use the macro source:

```sql
FROM {clusterAllReplicas:system.query_log}
```

The execution tool resolves this macro automatically. Never hard-code `clusterAllReplicas(...)` or bare `system.query_log`.

Use time filters on both `event_date` and `event_time`:

```sql
WHERE event_date >= toDate('{from}')
  AND event_date <= toDate('{to}')
  AND event_time >= toDateTime('{from}')
  AND event_time <= toDateTime('{to}')
```

Use `type = 'QueryFinish'` and `is_initial_query = 1` by default for user-facing workload analysis unless user asks otherwise.

## Predicate Patterns

- SELECT only: `query_kind = 'Select'`
- Non-SELECT: `query_kind != 'Select'`
- User scoped: `user IN ('u1', 'u2')`
- Database scoped: `has(databases, 'db_name')`
- Text search: `positionCaseInsensitive(query, 'keyword') > 0`

## Result Patterns

- Raw executions:
  - Include `query_id`, `user`, optional `FQDN() AS host`, `event_time`, `query_duration_ms`, `read_rows`, `memory_usage`, `query`.
- Pattern aggregates:
  - Group by `normalized_query_hash`.
  - Include `count()`, `max(event_time)`, and representative SQL like `any(substring(query, 1, 240))`.
  - Add objective metrics: `avg(query_duration_ms)`, `sum(read_rows)`, `sum(read_bytes)`, `sum(ProfileEvents['OSCPUVirtualTimeMicroseconds'])`.

## Resource Metrics

- CPU time: `ProfileEvents['OSCPUVirtualTimeMicroseconds']`
- CPU wait: `ProfileEvents['OSCPUWaitMicroseconds']`
- Memory: `memory_usage`
- Rows read: `read_rows`
- Bytes read: `read_bytes`
- Disk read: `ProfileEvents['OSReadBytes']`
- Disk write: `ProfileEvents['OSWriteBytes']`
- Network egress: `result_bytes`

For "CPU-heavy" queries, use `ProfileEvents['OSCPUVirtualTimeMicroseconds']` as primary sort/aggregate metric.

## Execution & Output

- Use `execute_sql`.
- Default `LIMIT 50` unless user specifies otherwise.
- Summarize in markdown table with top patterns and one sample SQL preview per pattern.
