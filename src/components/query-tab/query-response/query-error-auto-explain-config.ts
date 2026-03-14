import { AgentConfigurationManager } from "@/components/settings/agent/agent-manager";

const AUTO_EXPLAIN_CLICKHOUSE_ERROR_CODE_BLACKLIST = [
  "62",   // SYNTAX_ERROR
  "194",  // REQUIRED_PASSWORD
  "241"] as const;

const AUTO_EXPLAIN_CLICKHOUSE_ERROR_CODE_BLACKLIST_SET = new Set<string>(
  AUTO_EXPLAIN_CLICKHOUSE_ERROR_CODE_BLACKLIST
);

export function shouldAutoExplain(clickHouseErrorCode?: string | number): boolean {
  const configuration = AgentConfigurationManager.getConfiguration();
  return (
    Boolean(configuration.autoExplainClickHouseErrors) &&
    Boolean(clickHouseErrorCode) &&
    !AUTO_EXPLAIN_CLICKHOUSE_ERROR_CODE_BLACKLIST_SET.has(String(clickHouseErrorCode).trim())
  );
}
