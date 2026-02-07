import {
  MODEL_CONFIG_UPDATED_EVENT,
  ModelManager,
} from "@/components/settings/models/model-manager";
import type { ModelProps } from "@/lib/ai/llm/llm-provider-factory";
import { PROVIDER_GITHUB_COPILOT } from "@/lib/ai/llm/provider-ids";
import { DateTimeExtension } from "@/lib/datetime-utils";
import { useCallback, useEffect, useRef, useState } from "react";

interface GitHubModel {
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

const getCopilotMultiplier = (model: GitHubModel) => {
  const byId = COPILOT_MODEL_MULTIPLIERS.get(normalizeModelKey(model.id));
  if (byId !== undefined) return byId;
  if (model.name) return COPILOT_MODEL_MULTIPLIERS.get(normalizeModelKey(model.name));
  return undefined;
};

async function fetchCopilotModels(token: string): Promise<ModelProps[]> {
  try {
    const response = await fetch("/api/github/models", {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });

    if (!response.ok) {
      console.error("Failed to fetch Copilot models:", await response.text());
      return [];
    }

    const data = await response.json();
    const models: GitHubModel[] = Array.isArray(data) ? data : data.data || [];

    return models
      .filter((m) => m.model_picker_enabled)
      .map((m) => {
        const multiplier = getCopilotMultiplier(m);

        const descriptionParts = [];
        if (m.vendor) descriptionParts.push(`- **Vendor**: ${m.vendor}\n\n`);
        if (m.name) descriptionParts.push(`- **Model**: ${m.name}\n\n`);
        if (m.policy?.state) descriptionParts.push(`- **Policy**: ${m.policy.state}\n\n`);
        if (m.policy?.terms) descriptionParts.push(`- **Terms**: ${m.policy.terms}\n\n`);

        const multiplierLabel = multiplier !== undefined ? `${multiplier}` : "Unknown";
        descriptionParts.push(`- **Multiplier for paid plans**: ${multiplierLabel}\n\n`);

        return {
          provider: PROVIDER_GITHUB_COPILOT,
          modelId: m.id,
          description: descriptionParts.join("") || m.name || m.id,
          supportedEndpoints: m.supported_endpoints,
          free: multiplier === 0,
        };
      })
      .sort((a, b) => a.modelId.localeCompare(b.modelId));
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
  const [copilotModelsLoaded, setCopilotModelsLoaded] = useState(false);
  const refreshTimerRef = useRef<number | undefined>(undefined);

  const clearRefreshTimer = useCallback(() => {
    if (!refreshTimerRef.current) return;
    window.clearTimeout(refreshTimerRef.current);
    refreshTimerRef.current = undefined;
  }, []);

  const fetchDynamicModels = useCallback(
    async (token: string) => {
      setCopilotModelsLoaded(false);
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
        setCopilotModelsLoaded(true);
      }
    },
    [manager]
  );

  type CopilotRefreshResponse = {
    access_token: string;
    refresh_token?: string;
    expires_in?: number;
    refresh_token_expires_in?: number;
  };

  /**
   * Return type of CopilotRefreshResponse
   */
  const refreshCopilotToken = useCallback(async (refreshToken: string) => {
    const response = await fetch("/api/auth/github/refresh", {
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
    const copilotSetting = providerSettings.find((p) => p.provider === PROVIDER_GITHUB_COPILOT);
    if (copilotSetting?.apiKey) {
      fetchDynamicModels(copilotSetting.apiKey);
    } else {
      setCopilotModelsLoaded(true);
    }

    return () => {
      clearRefreshTimer();
      window.removeEventListener(MODEL_CONFIG_UPDATED_EVENT, refresh);
      window.removeEventListener("storage", handleStorage);
    };
  }, [refresh, fetchDynamicModels, manager, clearRefreshTimer]);

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
