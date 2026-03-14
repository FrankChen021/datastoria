const AUTO_EXPLAIN_CLICKHOUSE_ERROR_CODE_BLACKLIST = ["194", "241"] as const;

const AUTO_EXPLAIN_CLICKHOUSE_ERROR_CODE_BLACKLIST_SET = new Set<string>(
  AUTO_EXPLAIN_CLICKHOUSE_ERROR_CODE_BLACKLIST
);

export function isAutoExplainClickHouseErrorBlacklisted(errorCode?: string | number): boolean {
  if (errorCode === undefined || errorCode === null) {
    return false;
  }

  return AUTO_EXPLAIN_CLICKHOUSE_ERROR_CODE_BLACKLIST_SET.has(String(errorCode).trim());
}
