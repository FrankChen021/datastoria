import type { ModelProps } from "@/lib/ai/llm/llm-provider-factory";

export function groupModelsByProvider(
  models: readonly ModelProps[]
): Array<[string, ModelProps[]]> {
  const groups = new Map<string, ModelProps[]>();

  for (const model of models) {
    const providerModels = groups.get(model.provider);
    if (providerModels) {
      providerModels.push(model);
    } else {
      groups.set(model.provider, [model]);
    }
  }

  return [...groups.entries()].sort(([a], [b]) => a.localeCompare(b));
}
