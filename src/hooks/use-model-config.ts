import { ModelManager, MODEL_CONFIG_UPDATED_EVENT } from "@/lib/models/model-manager";
import { useCallback, useEffect, useState } from "react";

export function useModelConfig() {
  const manager = ModelManager.getInstance();

  const [config, setConfig] = useState(() => ({
    availableModels: manager.getAvailableModels(),
    selectedModel: manager.getSelectedModel(),
  }));

  const refresh = useCallback(() => {
    setConfig({
      availableModels: manager.getAvailableModels(),
      selectedModel: manager.getSelectedModel(),
    });
  }, [manager]);

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

    return () => {
      window.removeEventListener(MODEL_CONFIG_UPDATED_EVENT, refresh);
      window.removeEventListener("storage", handleStorage);
    };
  }, [refresh]);

  const setSelectedModel = useCallback(
    (model: { provider: string; modelId: string }) => {
      manager.setSelectedModel(model);
    },
    [manager]
  );

  return {
    ...config,
    setSelectedModel,
    refresh,
  };
}
