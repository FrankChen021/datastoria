import { AgentEdit } from "@/components/settings/agent/agent-edit";
import { ModelsEdit } from "@/components/settings/models/models-edit";
import { QueryContextEdit } from "@/components/settings/query-context/query-context-edit";

export type SettingsSection = "query-context" | "models" | "agent";

export interface SettingsPageConfig {
  title: string;
  description: string;
  component: React.ComponentType;
}

export const SETTINGS_REGISTRY: Record<SettingsSection, SettingsPageConfig> = {
  "query-context": {
    title: "Query Context",
    description: "Configure query execution settings and parameters",
    component: QueryContextEdit,
  },
  models: {
    title: "Models",
    description: "Configure AI models. API keys are only stored at your client side.",
    component: ModelsEdit,
  },
  agent: {
    title: "Agent",
    description: "Configure agent behavior",
    component: AgentEdit,
  },
};
