import {
  MODEL_CONFIG_UPDATED_EVENT,
  ModelManager,
} from "@/components/settings/models/model-manager";
import { fetchCopilotModels } from "@/lib/ai/llm/llm-provider-factory";
import { useCallback, useEffect, useState } from "react";

export function useModelConfig() {
  const manager = ModelManager.getInstance();

  const [config, setConfig] = useState(() => ({
    allModels: manager.getAllModels(),
    availableModels: manager.getAvailableModels(),
    selectedModel: manager.getSelectedModel(),
    modelSettings: manager.getModelSettings(),
    providerSettings: manager.getProviderSettings(),
  }));

  const [isLoading, setIsLoading] = useState(false);

  const refresh = useCallback(() => {
    setConfig({
      allModels: manager.getAllModels(),
      availableModels: manager.getAvailableModels(),
      selectedModel: manager.getSelectedModel(),
      modelSettings: manager.getModelSettings(),
      providerSettings: manager.getProviderSettings(),
    });
  }, [manager]);

  const fetchDynamicModels = useCallback(
    async (token: string) => {
      setIsLoading(true);
      try {
        const fetchedModels = await fetchCopilotModels(token);
        if (fetchedModels.length > 0) {
          manager.setDynamicModels(fetchedModels);
        }
      } catch (error) {
        console.error("Failed to fetch dynamic models:", error);
      } finally {
        setIsLoading(false);
      }
    },
    [manager]
  );

  useEffect(() => {
    // Listen for manual updates via ModelManager methods in the current tab
    window.addEventListener(MODEL_CONFIG_UPDATED_EVENT, refresh);

    // Listen for changes from other tabs/windows via localStorage
    const handleStorage = (e: StorageEvent) => {
      if (e.key && e.key.includes("settings/ai/")) {
        refresh();
      }
    };
    window.addEventListener("storage", handleStorage);

    // Initial fetch for dynamic models if token exists
    const providerSettings = manager.getProviderSettings();
    const copilotSetting = providerSettings.find((p) => p.provider === "GitHub Copilot");
    if (copilotSetting?.apiKey) {
      fetchDynamicModels(copilotSetting.apiKey);
    }

    return () => {
      window.removeEventListener(MODEL_CONFIG_UPDATED_EVENT, refresh);
      window.removeEventListener("storage", handleStorage);
    };
  }, [refresh, fetchDynamicModels, manager]);

  const setSelectedModel = useCallback(
    (model: { provider: string; modelId: string }) => {
      manager.setSelectedModel(model);
    },
    [manager]
  );

  return {
    ...config,
    isLoading,
    setSelectedModel,
    fetchDynamicModels,
    refresh,
  };
}
