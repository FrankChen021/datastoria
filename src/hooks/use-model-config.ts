import {
  MODEL_CONFIG_UPDATED_EVENT,
  ModelManager,
} from "@/components/settings/models/model-manager";
import { fetchAvailableModels } from "@/lib/ai/llm/available-models-client";
import type { ModelProps } from "@/lib/ai/llm/llm-provider-factory";
import { PROVIDER_GITHUB_COPILOT } from "@/lib/ai/llm/provider-ids";
import { BasePath } from "@/lib/base-path";
import { DateTimeExtension } from "@/lib/datetime-utils";
import { useCallback, useEffect, useRef, useState } from "react";

async function fetchCopilotModels(token: string): Promise<ModelProps[]> {
  try {
    const { githubModels } = await fetchAvailableModels(token);
    return githubModels;
  } catch (error) {
    console.error("Error fetching Copilot models:", error);
    return [];
  }
}

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
  const [copilotModelsLoaded, setCopilotModelsLoaded] = useState(true);
  const refreshTimerRef = useRef<number | undefined>(undefined);

  const clearRefreshTimer = useCallback(() => {
    if (!refreshTimerRef.current) return;
    window.clearTimeout(refreshTimerRef.current);
    refreshTimerRef.current = undefined;
  }, []);

  const clearCopilotAuthErrorIfRecovered = useCallback(
    (accessToken: string | undefined, models: ModelProps[]) => {
      if (!accessToken || models.length === 0) {
        return;
      }

      manager.updateProviderSetting(PROVIDER_GITHUB_COPILOT, { authError: undefined });
    },
    [manager]
  );

  const fetchDynamicModels = useCallback(
    async (token: string) => {
      setCopilotModelsLoaded(false);
      setIsLoading(true);
      try {
        const fetchedModels = await fetchCopilotModels(token);
        manager.setDynamicModels(fetchedModels);
        clearCopilotAuthErrorIfRecovered(token, fetchedModels);
      } catch (error) {
        console.error("Failed to fetch dynamic models:", error);
      } finally {
        setIsLoading(false);
        setCopilotModelsLoaded(true);
      }
    },
    [clearCopilotAuthErrorIfRecovered, manager]
  );

  type CopilotRefreshResponse = {
    access_token: string;
    refresh_token?: string;
    expires_in?: number;
    refresh_token_expires_in?: number;
  };

  const refreshCopilotToken = useCallback(async (refreshToken: string) => {
    const response = await fetch(BasePath.getURL("/api/ai/github/auth/refresh"), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ refresh_token: refreshToken }),
    }).catch((error) => {
      console.error("Failed to refresh Copilot token:", error);
      return undefined;
    });

    if (!response) return undefined;
    if (!response.ok) {
      console.error("Failed to refresh Copilot token:", await response.text());
      return undefined;
    }

    const data = (await response.json()) as CopilotRefreshResponse;
    if (!data?.access_token) {
      console.error("Copilot refresh response missing access_token");
      return undefined;
    }

    return data;
  }, []);

  const applyCopilotTokens = useCallback(
    (
      data: {
        access_token: string;
        refresh_token?: string;
        expires_in?: number;
        refresh_token_expires_in?: number;
      },
      current?: {
        refreshToken?: string;
        refreshTokenExpiresAt?: number;
      }
    ) => {
      const accessTokenExpiresAt = data.expires_in
        ? Date.now() + data.expires_in * 1000
        : undefined;
      const refreshTokenExpiresAt = data.refresh_token_expires_in
        ? Date.now() + data.refresh_token_expires_in * 1000
        : current?.refreshTokenExpiresAt;

      manager.updateProviderSetting(PROVIDER_GITHUB_COPILOT, {
        apiKey: data.access_token,
        refreshToken: data.refresh_token ?? current?.refreshToken,
        accessTokenExpiresAt,
        refreshTokenExpiresAt,
        authError: undefined,
      });

      fetchDynamicModels(data.access_token);
    },
    [fetchDynamicModels, manager]
  );

  const scheduleCopilotRefresh = useCallback(
    (accessTokenExpiresAt?: number, refreshToken?: string, refreshTokenExpiresAt?: number) => {
      console.log(
        "scheduleCopilotRefresh",
        DateTimeExtension.formatISO8601(new Date(accessTokenExpiresAt ?? 0)),
        DateTimeExtension.formatISO8601(new Date(accessTokenExpiresAt ?? 0)),
        DateTimeExtension.formatISO8601(new Date(refreshTokenExpiresAt ?? 0))
      );

      clearRefreshTimer();
      if (!accessTokenExpiresAt) return;
      if (!refreshToken) return;
      if (refreshTokenExpiresAt && Date.now() >= refreshTokenExpiresAt) {
        console.error("Copilot refresh token expired before scheduling refresh");
        manager.updateProviderSetting(PROVIDER_GITHUB_COPILOT, { authError: "expired" });
        return;
      }

      const bufferMs = 60_000;
      const refreshAt = accessTokenExpiresAt - bufferMs;
      const delayMs = Math.max(refreshAt - Date.now(), 0);

      console.log(
        "scheduled GitHub Copilot token refresh at ",
        DateTimeExtension.formatISO8601(new Date(refreshAt))
      );
      refreshTimerRef.current = window.setTimeout(async () => {
        const refreshed = await refreshCopilotToken(refreshToken);
        if (!refreshed) {
          manager.updateProviderSetting(PROVIDER_GITHUB_COPILOT, { authError: "refresh_failed" });
          return;
        }
        applyCopilotTokens(refreshed, { refreshToken, refreshTokenExpiresAt });
      }, delayMs);
    },
    [applyCopilotTokens, clearRefreshTimer, refreshCopilotToken, manager]
  );

  const refresh = useCallback(() => {
    setConfig({
      allModels: manager.getAllModels(),
      availableModels: manager.getAvailableModels(),
      selectedModel: manager.getSelectedModel(),
      modelSettings: manager.getModelSettings(),
      providerSettings: manager.getProviderSettings(),
    });
  }, [manager]);

  useEffect(() => {
    window.addEventListener(MODEL_CONFIG_UPDATED_EVENT, refresh);

    const handleStorage = (e: StorageEvent) => {
      if (e.key && e.key.includes("settings/ai/")) {
        refresh();
      }
    };
    window.addEventListener("storage", handleStorage);

    if (!manager.hasSystemModelsHydrated()) {
      const providerSettings = manager.getProviderSettings();
      const copilotSetting = providerSettings.find((p) => p.provider === PROVIDER_GITHUB_COPILOT);

      setIsLoading(true);
      setCopilotModelsLoaded(false);
      void fetchAvailableModels(copilotSetting?.apiKey)
        .then(({ systemModels, githubModels }) => {
          manager.setSystemModels(systemModels, false);
          manager.setDynamicModels(githubModels);
          clearCopilotAuthErrorIfRecovered(copilotSetting?.apiKey, githubModels);
        })
        .catch((error) => {
          console.error("Failed to recover model catalog:", error);
        })
        .finally(() => {
          setIsLoading(false);
          setCopilotModelsLoaded(true);
        });
    }

    return () => {
      clearRefreshTimer();
      window.removeEventListener(MODEL_CONFIG_UPDATED_EVENT, refresh);
      window.removeEventListener("storage", handleStorage);
    };
  }, [refresh, manager, clearRefreshTimer, clearCopilotAuthErrorIfRecovered]);

  useEffect(() => {
    const copilotSetting = config.providerSettings.find(
      (p) => p.provider === PROVIDER_GITHUB_COPILOT
    );
    if (!copilotSetting) {
      clearRefreshTimer();
      return;
    }

    const now = Date.now();
    const accessTokenExpiresAt = copilotSetting.accessTokenExpiresAt;
    const refreshTokenExpiresAt = copilotSetting.refreshTokenExpiresAt;
    if (!accessTokenExpiresAt) {
      clearRefreshTimer();
      return;
    }

    if (refreshTokenExpiresAt && now >= refreshTokenExpiresAt) {
      manager.updateProviderSetting(PROVIDER_GITHUB_COPILOT, {
        apiKey: "",
        refreshToken: "",
        accessTokenExpiresAt: undefined,
        refreshTokenExpiresAt: undefined,
        authError: "expired",
      });
      clearRefreshTimer();
      return;
    }

    if (!copilotSetting.refreshToken) {
      if (now >= accessTokenExpiresAt) {
        manager.updateProviderSetting(PROVIDER_GITHUB_COPILOT, {
          apiKey: "",
          refreshToken: "",
          accessTokenExpiresAt: undefined,
          refreshTokenExpiresAt: undefined,
          authError: "expired",
        });
      }
      clearRefreshTimer();
      return;
    }

    if (now >= accessTokenExpiresAt) {
      if (copilotSetting.authError === "refresh_failed") {
        clearRefreshTimer();
        return;
      }
      refreshCopilotToken(copilotSetting.refreshToken).then((data) => {
        if (!data) {
          manager.updateProviderSetting(PROVIDER_GITHUB_COPILOT, { authError: "refresh_failed" });
          return;
        }
        applyCopilotTokens(data, {
          refreshToken: copilotSetting.refreshToken,
          refreshTokenExpiresAt: copilotSetting.refreshTokenExpiresAt,
        });
      });
      clearRefreshTimer();
      return;
    }

    scheduleCopilotRefresh(
      accessTokenExpiresAt,
      copilotSetting.refreshToken,
      refreshTokenExpiresAt
    );
  }, [
    config.providerSettings,
    applyCopilotTokens,
    clearRefreshTimer,
    manager,
    refreshCopilotToken,
    scheduleCopilotRefresh,
  ]);

  const setSelectedModel = useCallback(
    (model: { provider: string; modelId: string }) => {
      manager.setSelectedModel(model);
    },
    [manager]
  );

  return {
    ...config,
    isLoading,
    copilotModelsLoaded,
    setSelectedModel,
    fetchDynamicModels,
    refresh,
  };
}
