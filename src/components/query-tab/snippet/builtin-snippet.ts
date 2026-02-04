import type { Snippet } from "./snippet";

export const builtinSnippet: Snippet[] = [
  {
    builtin: true,
    caption: "show_stack_trace",
    sql: `WITH arrayMap(x -> demangle(addressToSymbol(x)), trace) AS all 
SELECT thread_name, thread_id, query_id, arrayStringConcat(all, '\\n') AS stack 
FROM system.stack_trace
-- WHERE stack LIKE '%xxx%' -- Change to your own
SETTINGS allow_introspection_functions = 1\\G`,
  },

  {
    builtin: true,
    caption: "show_query_log",
    sql: `SELECT * FROM system.query_log WHERE event_date = today()
-- AND has(databases, '\${db}') -- Change to your database name
-- AND has(tables, '\${table}') -- Change to your table name
-- AND query_kind = 'Select' -- Select/Insert/...
-- AND type = 'QueryFinish'  --
ORDER BY event_time`,
  },

  {
    builtin: true,
    caption: "show_disks",
    sql: `SELECT 
FQDN() as host, type, name, path, formatReadableSize(free_space) AS free, formatReadableSize(total_space) AS total, round(free_space/total_space,2) as free_ratio 
FROM clusterAllReplicas('{cluster}', system.disks)
ORDER BY host`,
  },

  {
    builtin: true,
    caption: "show_mutations",
    sql: `SELECT create_time, database, table, mutation_id, command, length(block_numbers.number), is_done, latest_fail_time, latest_fail_reason FROM system.mutations
WHERE is_done = 0
-- AND database = '' -- Change to your own
ORDER BY create_time`,
  },

  {
    builtin: true,
    caption: "show_merges",
    sql: `SELECT database, table, round(elapsed, 2) AS elapsed, progress, num_parts, formatReadableSize(total_size_bytes_compressed) AS total_byte_compressed, formatReadableSize(bytes_read_uncompressed) AS bytes_read, formatReadableSize(bytes_written_uncompressed) AS bytes_written, rows_read, rows_written,columns_written, formatReadableSize(memory_usage) AS memory_usage, thread_id, merge_type, merge_algorithm 
FROM system.merges 
ORDER BY progress DESC, total_size_bytes_compressed DESC`,
  },

  {
    builtin: true,
    caption: "show_zookeeper_connection",
    sql: `SELECT FQDN(), * FROM clusterAllReplicas('{cluster}', system.zookeeper_connection) ORDER BY FQDN()`,
  },

  {
    builtin: true,
    caption: "show_part_history",
    sql: `SELECT event_time, event_type, query_id, database, table, part_name, duration_ms, rows, formatReadableSize(size_in_bytes) AS bytes, exception FROM system.part_log WHERE
event_date = today()
-- AND table = '' -- change to your own table name
ORDER BY duration_ms`,
  },

  {
    builtin: true,
    caption: "show_data_part",
    sql: `SELECT * FROM system.parts WHERE active 
-- AND database = '' -- change to your own database name
-- AND table = '' -- change to your own table name`,
  },
];
