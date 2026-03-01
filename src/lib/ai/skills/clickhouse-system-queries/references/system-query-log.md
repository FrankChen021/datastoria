# system.query_log Reference

Use only for `system.query_log` analysis: slow/failed queries, heavy patterns, and user/database workload.

## Required Rules

- Source must be:

```sql
FROM {clusterAllReplicas:system.query_log}
```

- Always bound time with both columns:

```sql
WHERE event_date >= toDate('{from}')
  AND event_date <= toDate('{to}')
  AND event_time >= toDateTime('{from}')
  AND event_time <= toDateTime('{to}')
```

- Default filters: `type = 'QueryFinish'`, `is_initial_query = 1`, and `query_kind = 'Select'` unless the user specifies otherwise.
- `ProfileEvents` shape must be checked first:
  - Map form: `ProfileEvents['Name']`
  - Flattened form: `ProfileEvent_Name`

## Common Predicates

- SELECT only: `query_kind = 'Select'`
- Non-SELECT: `query_kind != 'Select'`
- User scoped: `user IN ('u1', 'u2')`
- Database scoped: `has(databases, 'db_name')`
- Text search: `positionCaseInsensitive(query, 'keyword') > 0`

## Result Formats

- Raw executions: include `query_id`, `user`, `event_time`, `query_duration_ms`, `read_rows`, `memory_usage`, `query`; order by target metric, then `event_time DESC`.
- Pattern aggregates: group by `normalized_query_hash`; include `count()`, `max(event_time)`, `any(substring(query, 1, 240))`, `avg(query_duration_ms)`, `sum(read_rows)`, `sum(read_bytes)`, `sum(ProfileEvents['OSCPUVirtualTimeMicroseconds'])`; order by the primary ranking metric.

## Resource Metrics

| Metric | Expression |
|---|---|
| CPU time | `ProfileEvents['OSCPUVirtualTimeMicroseconds']` |
| CPU wait | `ProfileEvents['OSCPUWaitMicroseconds']` |
| Memory | `memory_usage` |
| Rows read | `read_rows` |
| Bytes read | `read_bytes` |
| Disk read | `ProfileEvents['OSReadBytes']` |
| Disk write | `ProfileEvents['OSWriteBytes']` |
| Network egress | `result_bytes` |

## Output

- Use clear aliases: `sum_cpu_us`, `avg_duration_ms`, `sum_read_bytes`, `failed_queries`.
- Return a markdown table with top patterns and one sample SQL per pattern.
