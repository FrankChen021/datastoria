import { MODELS, type ModelProps } from "@/lib/ai/llm/llm-provider-factory";
import { PROVIDER_GITHUB_COPILOT } from "@/lib/ai/llm/provider-ids";
import { StorageManager } from "@/lib/storage/storage-provider-manager";

export interface ModelSetting {
  modelId: string;
  provider: string;
  disabled: boolean;
  free: boolean;
}

export interface ProviderSetting {
  provider: string;
  apiKey: string;
  refreshToken?: string;
  accessTokenExpiresAt?: number;
  refreshTokenExpiresAt?: number;
  authError?: string;
}

export const MODEL_CONFIG_UPDATED_EVENT = "MODEL_CONFIG_UPDATED";

class ModelManager {
  private static instance: ModelManager;

  private get modelSettingsStorage() {
    return StorageManager.getInstance()
      .getStorageProvider()
      .subStorage("settings:ai:model-settings");
  }

  private get providerSettingsStorage() {
    return StorageManager.getInstance()
      .getStorageProvider()
      .subStorage("settings:ai:provider-settings");
  }

  private get selectedModelStorage() {
    return StorageManager.getInstance()
      .getStorageProvider()
      .subStorage("settings:ai:selected-model-id");
  }

  /**
   * Dynamically registered models (e.g., from Copilot API)
   */
  private dynamicModels: ModelProps[] = [];

  public static getInstance(): ModelManager {
    if (!ModelManager.instance) {
      ModelManager.instance = new ModelManager();
    }
    return ModelManager.instance;
  }

  /**
   * Set dynamic models and notify listeners
   */
  public setDynamicModels(models: ModelProps[]): void {
    this.dynamicModels = models;
    this.notify();
  }

  /**
   * Get all registered models (static + dynamic)
   */
  public getAllModels(): ModelProps[] {
    const all = [...MODELS, ...this.dynamicModels];
    const seen = new Set<string>();
    const filtered = all.filter((model) => {
      const key = `${model.provider}:${model.modelId}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
    const indexed = filtered.map((model, index) => ({ model, index }));
    indexed.sort((a, b) => {
      const aIsCopilot = a.model.provider === PROVIDER_GITHUB_COPILOT;
      const bIsCopilot = b.model.provider === PROVIDER_GITHUB_COPILOT;
      if (aIsCopilot && bIsCopilot) {
        return a.model.modelId.localeCompare(b.model.modelId);
      }
      if (aIsCopilot !== bIsCopilot) {
        return aIsCopilot ? -1 : 1;
      }
      return a.index - b.index;
    });
    return indexed.map((entry) => entry.model);
  }

  /**
   * Notify listeners that the model configuration has changed
   */
  private notify() {
    if (typeof window !== "undefined") {
      window.dispatchEvent(new CustomEvent(MODEL_CONFIG_UPDATED_EVENT));
    }
  }

  /**
   * Get the currently selected model configuration from localStorage
   * @returns The selected model configuration or undefined
   */
  public getSelectedModel(): { provider: string; modelId: string } | undefined {
    const stored = this.selectedModelStorage.getString();
    if (!stored) return undefined;

    try {
      // Try to parse as JSON (new format)
      const parsed = JSON.parse(stored);
      if (
        typeof parsed === "object" &&
        parsed !== null &&
        "provider" in parsed &&
        "modelId" in parsed
      ) {
        return parsed as { provider: string; modelId: string };
      }
    } catch {
      // Ignore parsing error, treat as legacy string format
    }

    // Legacy format: stored value is just modelId string
    // Try to find the provider for this modelId
    const models = this.getAvailableModels();
    const found = models.find((m) => m.modelId === stored);
    if (found) {
      return { provider: found.provider, modelId: found.modelId };
    }

    return undefined;
  }

  /**
   * Save the selected model configuration to localStorage
   * @param model - The model configuration to select
   */
  public setSelectedModel(model: { provider: string; modelId: string }): void {
    this.selectedModelStorage.setString(JSON.stringify(model));
    this.notify();
  }

  /**
   * Get all model settings from localStorage
   * @returns Array of model settings
   */
  public getModelSettings(): ModelSetting[] {
    return this.modelSettingsStorage.getAsJSON<ModelSetting[]>(() => []);
  }

  /**
   * Save model settings to localStorage
   * @param settings - Array of model settings to save
   */
  public setModelSettings(settings: ModelSetting[]): void {
    this.modelSettingsStorage.setJSON(settings);
    this.notify();
  }

  /**
   * Get all provider settings from localStorage
   * @returns Array of provider settings
   */
  public getProviderSettings(): ProviderSetting[] {
    return this.providerSettingsStorage.getAsJSON<ProviderSetting[]>(() => []);
  }

  /**
   * Save provider settings to localStorage
   * @param settings - Array of provider settings to save
   */
  public setProviderSettings(settings: ProviderSetting[]): void {
    this.providerSettingsStorage.setJSON(settings);
    this.notify();
  }

  /**
   * Get a specific model setting by modelId
   * @param modelId - The model ID to look up
   * @returns The model setting or undefined if not found
   */
  public getModelSetting(modelId: string): ModelSetting | undefined {
    const settings = this.getModelSettings();
    return settings.find((s) => s.modelId === modelId);
  }

  /**
   * Update a specific model setting
   * @param provider - The provider name for the model
   * @param modelId - The model ID to update
   * @param updates - Partial updates to apply
   */
  public updateModelSetting(
    provider: string,
    modelId: string,
    updates: Partial<Omit<ModelSetting, "modelId" | "provider">>
  ): void {
    const settings = this.getModelSettings();
    const index = settings.findIndex((s) => s.modelId === modelId && s.provider === provider);

    if (index >= 0) {
      settings[index] = { ...settings[index], ...updates };
    } else {
      // If model doesn't exist, create a new one
      settings.push({
        modelId,
        provider,
        disabled: false,
        free: false,
        ...updates,
      });
    }

    this.setModelSettings(settings);
  }

  /**
   * Update a specific provider setting
   * @param provider - The provider name to update
   * @param updates - Partial updates to apply
   */
  public updateProviderSetting(
    provider: string,
    updates: Partial<Omit<ProviderSetting, "provider">>
  ): void {
    const settings = this.getProviderSettings();
    const index = settings.findIndex((s) => s.provider === provider);

    if (index >= 0) {
      settings[index] = { ...settings[index], ...updates };
    } else {
      // If provider doesn't exist, create a new one
      settings.push({
        provider,
        apiKey: "",
        ...updates,
      });
    }

    this.setProviderSettings(settings);
  }

  /**
   * Delete a provider setting
   * @param provider - The provider name to delete
   */
  public deleteProviderSetting(provider: string): void {
    const settings = this.getProviderSettings();
    const filtered = settings.filter((s) => s.provider !== provider);
    this.setProviderSettings(filtered);
  }

  /**
   * Get all available models that are enabled and have an API key configured.
   * Includes a special 'Auto' model representing the server-side default if available.
   * @param autoSelectAvailable - Whether server-side auto-select is available. If false or undefined, the "System (Auto)" model will not be included.
   * @returns Array of available models
   */
  public getAvailableModels(autoSelectAvailable?: boolean): ModelProps[] {
    const modelSettings = this.getModelSettings();
    const providerSettings = this.getProviderSettings();

    const userModels = this.getAllModels().filter((model) => {
      // Filter out models that are disabled in settings
      const setting = modelSettings.find(
        (s) => s.modelId === model.modelId && s.provider === model.provider
      );
      if (setting ? setting.disabled : model.disabled) return false;

      // Filter out models whose provider doesn't have an API key
      const providerSetting = providerSettings.find((p) => p.provider === model.provider);
      if (!providerSetting?.apiKey) return false;

      return true;
    });

    // Add the special 'Auto' model at the beginning only if auto-select is available
    if (autoSelectAvailable) {
      const autoModel: ModelProps = {
        provider: "System",
        modelId: "Auto",
        description: `Use the server-side default model configuration. 
Rate limit on request/token will apply.
If you have your API keys, you can configure your models in the settings.`,
      };

      return [autoModel, ...userModels];
    }

    return userModels;
  }
}

export { ModelManager };
