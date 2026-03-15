import {
  AgentConfigurationManager,
  DEFAULT_AUTO_EXPLAIN_BLACKLIST,
} from "@/components/settings/agent/agent-manager";
import { ModelManager } from "@/components/settings/models/model-manager";

export const AutoExplainState = {
  ENABLED: "ENABLED",
  DISABLED: "DISABLED",
  UNAVAILABLE: "UNAVAILABLE",
} as const;

export type AutoExplainState = (typeof AutoExplainState)[keyof typeof AutoExplainState];

export function getAutoExplainState(clickHouseErrorCode?: string | number): AutoExplainState {
  if (ModelManager.getInstance().getAvailableModels().length === 0) {
    return AutoExplainState.UNAVAILABLE;
  }

  const configuration = AgentConfigurationManager.getConfiguration();
  const blacklist = new Set(
    (configuration.autoExplainBlacklist ?? DEFAULT_AUTO_EXPLAIN_BLACKLIST).map((code) =>
      String(code).trim()
    )
  );
  const wouldAutoExplain =
    Boolean(configuration.autoExplainClickHouseErrors) &&
    Boolean(clickHouseErrorCode) &&
    !blacklist.has(String(clickHouseErrorCode).trim());
  return wouldAutoExplain ? AutoExplainState.ENABLED : AutoExplainState.DISABLED;
}
