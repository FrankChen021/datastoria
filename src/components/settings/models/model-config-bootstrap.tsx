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

let bootstrapCatalog:
  | {
      key: string;
      promise: Promise<void>;
    }
  | undefined;

async function bootstrapModelCatalog(copilotToken: string | undefined): Promise<boolean> {
  const manager = ModelManager.getInstance();

  try {
    const { systemModels, githubModels } = await fetchAvailableModels({
      githubToken: copilotToken,
    });

    manager.setSystemModels(systemModels, false);
    manager.setDynamicModelsForProvider(PROVIDER_GITHUB_COPILOT, githubModels, true);
    if (copilotToken && githubModels.length > 0) {
      manager.updateProviderSetting(PROVIDER_GITHUB_COPILOT, { authError: undefined });
    }
    return true;
  } catch (error) {
    console.error("Failed to bootstrap model catalog:", error);
    return false;
  }
}

function getBootstrapCatalogPromise(storageUserId: string | undefined): Promise<void> {
  const providerSettings = ModelManager.getInstance().getProviderSettings();
  const copilotSetting = providerSettings.find(
    (provider) => provider.provider === PROVIDER_GITHUB_COPILOT
  );
  const key = JSON.stringify({
    storageUserId,
    copilotToken: copilotSetting?.apiKey ?? "",
  });

  if (!bootstrapCatalog || bootstrapCatalog.key !== key) {
    const promise = bootstrapModelCatalog(copilotSetting?.apiKey).then((success) => {
      if (!success && bootstrapCatalog?.key === key) {
        bootstrapCatalog = undefined;
      }
    });

    bootstrapCatalog = {
      key,
      promise,
    };
  }

  return bootstrapCatalog.promise;
}

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
      await getBootstrapCatalogPromise(storageUserId);
      if (!cancelled) {
        setIsReady(true);
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
