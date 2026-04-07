"use client";

import { useAppStorage } from "@/components/app-storage-provider";
import { ModelManager } from "@/components/settings/models/model-manager";
import { fetchAvailableModels } from "@/lib/ai/llm/available-models-client";
import { PROVIDER_GITHUB_COPILOT } from "@/lib/ai/llm/provider-ids";
import { createContext, useContext, useEffect, useState, type ReactNode } from "react";

interface ModelConfigBootstrapContextValue {
  /** True once the initial model catalog fetch has completed (or failed). */
  isReady: boolean;
}

const ModelConfigBootstrapContext = createContext<ModelConfigBootstrapContextValue>({
  isReady: false,
});

/** Returns whether the initial model catalog has been bootstrapped. */
export function useModelConfigBootstrap(): ModelConfigBootstrapContextValue {
  return useContext(ModelConfigBootstrapContext);
}

export function ModelConfigBootstrap({ children }: { children: ReactNode }) {
  const { isStorageReady, storageUserId } = useAppStorage();
  const [isReady, setIsReady] = useState(false);

  useEffect(() => {
    if (!isStorageReady) {
      return;
    }

    let cancelled = false;
    setIsReady(false);

    void (async () => {
      const manager = ModelManager.getInstance();
      const copilotSetting = manager
        .getProviderSettings()
        .find((provider) => provider.provider === PROVIDER_GITHUB_COPILOT);

      try {
        const { systemModels, githubModels } = await fetchAvailableModels(copilotSetting?.apiKey);
        if (cancelled) {
          return;
        }
        manager.setSystemModels(systemModels, false);
        manager.setDynamicModels(githubModels);
        if (copilotSetting?.apiKey && githubModels.length > 0) {
          manager.updateProviderSetting(PROVIDER_GITHUB_COPILOT, { authError: undefined });
        }
      } catch (error) {
        console.error("Failed to bootstrap model catalog:", error);
      } finally {
        if (!cancelled) {
          setIsReady(true);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [isStorageReady, storageUserId]);

  return (
    <ModelConfigBootstrapContext.Provider value={{ isReady }}>
      {children}
    </ModelConfigBootstrapContext.Provider>
  );
}
