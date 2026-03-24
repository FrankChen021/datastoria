import type { ModelProps } from "@/lib/ai/llm/llm-provider-factory";
import { PROVIDER_GITHUB_COPILOT } from "@/lib/ai/llm/provider-ids";

export interface GitHubModel {
  id: string;
  name: string;
  model_picker_enabled: boolean;
  vendor?: string;
  preview?: boolean;
  supported_endpoints?: string[];
  policy?: {
    state: string;
    terms?: string;
  };
}

/**
 * https://docs.github.com/en/copilot/reference/ai-models/supported-models?trk=public_post_comment-text#model-multipliers
 */
const COPILOT_MODEL_MULTIPLIERS = new Map<string, number>([
  ["claude-haiku-4.5", 0.33],
  ["claude-opus-4.1", 10],
  ["claude-opus-4.5", 3],
  ["claude-opus-4.6", 3],
  ["claude-sonnet-4", 1],
  ["claude-sonnet-4.5", 1],
  ["gemini-2.5-pro", 1],
  ["gemini-3-flash", 0.33],
  ["gemini-3-pro", 1],
  ["gpt-4.1", 0],
  ["gpt-4o", 0],
  ["gpt-5", 1],
  ["gpt-5-mini", 0],
  ["gpt-5-codex", 1],
  ["gpt-5.1", 1],
  ["gpt-5.1-codex", 1],
  ["gpt-5.1-codex-mini", 0.33],
  ["gpt-5.1-codex-max", 1],
  ["gpt-5.2", 1],
  ["gpt-5.2-codex", 1],
  ["grok-code-fast-1", 0.25],
  ["raptor-mini", 0],
]);

const normalizeModelKey = (value: string) => value.trim().toLowerCase().replace(/\s+/g, "-");

function getCopilotMultiplier(model: GitHubModel) {
  const byId = COPILOT_MODEL_MULTIPLIERS.get(normalizeModelKey(model.id));
  if (byId !== undefined) return byId;
  if (model.name) return COPILOT_MODEL_MULTIPLIERS.get(normalizeModelKey(model.name));
  return undefined;
}

export function normalizeGitHubCopilotModels(payload: unknown): ModelProps[] {
  const models: GitHubModel[] = Array.isArray(payload)
    ? payload
    : Array.isArray((payload as { data?: unknown })?.data)
      ? ((payload as { data: GitHubModel[] }).data ?? [])
      : [];

  return models
    .filter((model) => model.model_picker_enabled)
    .map((model) => {
      const multiplier = getCopilotMultiplier(model);
      const descriptionParts = [];

      if (model.vendor) descriptionParts.push(`- **Vendor**: ${model.vendor}\n\n`);
      if (model.name) descriptionParts.push(`- **Model**: ${model.name}\n\n`);
      if (model.policy?.state) descriptionParts.push(`- **Policy**: ${model.policy.state}\n\n`);
      if (model.policy?.terms) descriptionParts.push(`- **Terms**: ${model.policy.terms}\n\n`);

      const multiplierLabel = multiplier !== undefined ? `${multiplier}` : "Unknown";
      descriptionParts.push(`- **Multiplier for paid plans**: ${multiplierLabel}\n\n`);

      return {
        provider: PROVIDER_GITHUB_COPILOT,
        modelId: model.id,
        description: descriptionParts.join("") || model.name || model.id,
        supportedEndpoints: model.supported_endpoints,
        free: multiplier === 0,
        source: "user" as const,
      };
    })
    .sort((a, b) => a.modelId.localeCompare(b.modelId));
}
