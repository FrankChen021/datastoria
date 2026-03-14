import {
  AgentConfigurationManager,
  DEFAULT_AUTO_EXPLAIN_BLACKLIST,
} from "@/components/settings/agent/agent-manager";

export function shouldAutoExplain(clickHouseErrorCode?: string | number): boolean {
  const configuration = AgentConfigurationManager.getConfiguration();
  const blacklist = new Set(
    (configuration.autoExplainBlacklist ?? DEFAULT_AUTO_EXPLAIN_BLACKLIST).map((code) =>
      String(code).trim()
    )
  );
  return (
    Boolean(configuration.autoExplainClickHouseErrors) &&
    Boolean(clickHouseErrorCode) &&
    !blacklist.has(String(clickHouseErrorCode).trim())
  );
}
