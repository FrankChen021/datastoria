import { AgentEdit } from "@/components/settings/agent/agent-edit";
import { MemorySettingsEdit } from "@/components/settings/agent/memory-settings";
import { ModelsEdit } from "@/components/settings/models/models-edit";
import { QueryContextEdit } from "@/components/settings/query-context/query-context-edit";
import { SkillsEdit } from "@/components/settings/skills/skills-edit";
import { UiEdit } from "@/components/settings/ui/ui-edit";

export type SettingsSection = "query-context" | "ui" | "models" | "agent" | "skills";
export type SettingsSection =
  | "query-context"
  | "ui"
  | "models"
  | "agent"
  | "skills"
  | "memory";

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
  ui: {
    title: "UI",
    description: "Configure application appearance and interface preferences",
    component: UiEdit,
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
  skills: {
    title: "Skills",
    description: "Bundled AI skills available to the V2 agent",
    component: SkillsEdit,
  },
  memory: {
    title: "Memory",
    description: "Manage durable AI memories and preference storage",
    component: MemorySettingsEdit,
  },
};
