import {
  ModelManager,
  type ModelSetting,
  type ProviderSetting,
} from "@/components/settings/models/model-manager";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Dialog as SharedDialog } from "@/components/shared/use-dialog";
import { GitHubLoginComponent } from "./github-login-component";
import { fetchCopilotModels, MODELS } from "@/lib/ai/llm/llm-provider-factory";
import { TextHighlighter } from "@/lib/text-highlighter";
import { ChevronDown, ExternalLink, Eye, EyeOff, Search } from "lucide-react";
import React, { useCallback, useEffect, useMemo, useState } from "react";

const PROVIDER_LINKS: Record<string, string> = {
  OpenAI: "https://platform.openai.com/api-keys",
  Google: "https://aistudio.google.com/app/apikey",
  Anthropic: "https://console.anthropic.com/settings/keys",
  OpenRouter: "https://openrouter.ai/settings/keys",
  Groq: "https://console.groq.com/keys",
  Cerebras: "https://cloud.cerebras.ai/platform",
};

export function ModelsEdit() {
  const modelManager = ModelManager.getInstance();

  // Load models and provider settings from localStorage on mount
  const initialState = useMemo(() => {
    const storedModels = modelManager.getModelSettings();
    const storedProviderSettings = modelManager.getProviderSettings();

    // Get all available models from the flattened MODELS array
    const availableModels: ModelSetting[] = [];
    for (const model of MODELS) {
      const stored = storedModels.find(
        (m) => m.modelId === model.modelId && m.provider === model.provider
      );
      availableModels.push(
        stored
          ? {
            ...stored,
            provider: stored.provider || model.provider, // Use stored provider if exists, otherwise use from model
            free: stored.free ?? model.free ?? false, // Use stored free if exists, otherwise use from model
          }
          : {
            modelId: model.modelId,
            provider: model.provider,
            disabled: false,
            free: model.free ?? false,
          }
      );
    }
    return { models: availableModels, providerSettings: storedProviderSettings };
  }, [modelManager]);

  const [models, setModels] = useState<ModelSetting[]>(initialState.models);
  const [providerSettings, setProviderSettings] = useState<ProviderSetting[]>(
    initialState.providerSettings
  );
  const [searchQuery, setSearchQuery] = useState("");

  // Start with all providers collapsed (empty set) to show only provider headers by default
  const [expandedProviders, setExpandedProviders] = useState<Set<string>>(new Set());

  // Track which providers have visible API keys
  const [visibleApiKeys, setVisibleApiKeys] = useState<Set<string>>(new Set());

  const handleDisabledChange = useCallback(
    (modelId: string, disabled: boolean) => {
      setModels((prev) => {
        const updated = prev.map((m) => (m.modelId === modelId ? { ...m, disabled } : m));
        modelManager.setModelSettings(updated);
        return updated;
      });
    },
    [modelManager]
  );

  const handleProviderApiKeyChange = useCallback(
    (provider: string, apiKey: string) => {
      setProviderSettings((prev) => {
        const index = prev.findIndex((p) => p.provider === provider);
        let updated: ProviderSetting[];
        if (index >= 0) {
          updated = prev.map((p) => (p.provider === provider ? { ...p, apiKey } : p));
        } else {
          updated = [...prev, { provider, apiKey }];
        }
        modelManager.setProviderSettings(updated);
        return updated;
      });
    },
    [modelManager]
  );

  // Filter models based on search query
  const filteredModels = useMemo(() => {
    const allModels = modelManager.getAllModels();
    const queryLower = searchQuery.toLowerCase();

    // Convert allModels to ModelSetting state format
    const currentModelSettings = allModels.map(model => {
      const stored = models.find(m => m.modelId === model.modelId && m.provider === model.provider);
      return stored || {
        modelId: model.modelId,
        provider: model.provider,
        disabled: false,
        free: model.free ?? false,
      };
    });

    if (!queryLower.trim()) {
      return currentModelSettings;
    }
    return currentModelSettings.filter((model) => model.modelId.toLowerCase().includes(queryLower));
  }, [models, searchQuery, modelManager]);

  // Group models by provider
  const groupedModels = useMemo(() => {
    return filteredModels.reduce(
      (acc, model) => {
        const provider = model.provider;
        if (!acc[provider]) {
          acc[provider] = [];
        }
        acc[provider].push(model);
        return acc;
      },
      {} as Record<string, ModelSetting[]>
    );
  }, [filteredModels]);

  const fetchModels = useCallback(async (token: string) => {
    const fetchedModels = await fetchCopilotModels(token);
    if (fetchedModels.length > 0) {
      modelManager.setDynamicModels(fetchedModels);
      // Update local state to include new models
      setModels((prev) => {
        const newModels = fetchedModels.map(m => ({
          modelId: m.modelId,
          provider: m.provider,
          disabled: false,
          free: m.free ?? false
        }));
        // Filter out existing ones to avoid duplicates
        const filteredNew = newModels.filter(nm => !prev.some(p => p.modelId === nm.modelId && p.provider === nm.provider));
        return [...prev, ...filteredNew];
      });
    }
  }, [modelManager]);

  const handleCopilotLogin = async () => {
    SharedDialog.showDialog({
      title: "Login with GitHub Copilot",
      description: "Authorize this application to access your GitHub Copilot models.",
      mainContent: (
        <GitHubLoginComponent
          onSuccess={(token: string) => {
            handleProviderApiKeyChange("GitHub Copilot", token);
            fetchModels(token);
            SharedDialog.close();
          }}
          onCancel={() => {
            SharedDialog.close();
          }}
        />
      ),
      disableBackdrop: true,
      className: "sm:max-w-md",
    });
  };

  // Initial fetch for dynamic models if token exists
  useEffect(() => {
    const copilotSetting = providerSettings.find((p) => p.provider === "GitHub Copilot");
    if (copilotSetting?.apiKey) {
      fetchModels(copilotSetting.apiKey);
    }
  }, [providerSettings, fetchModels]);

  // Expand all providers when searching
  useEffect(() => {
    if (searchQuery.trim()) {
      const allProviders = Object.keys(groupedModels);
      if (allProviders.length > 0) {
        setExpandedProviders((prev) => {
          const next = new Set(prev);
          allProviders.forEach((p) => next.add(p));
          return next;
        });
      }
    }
  }, [groupedModels, searchQuery]);

  const toggleProvider = useCallback((provider: string) => {
    setExpandedProviders((prev) => {
      const next = new Set(prev);
      if (next.has(provider)) {
        next.delete(provider);
      } else {
        next.add(provider);
      }
      return next;
    });
  }, []);

  const toggleApiKeyVisibility = useCallback((provider: string) => {
    setVisibleApiKeys((prev) => {
      const next = new Set(prev);
      if (next.has(provider)) {
        next.delete(provider);
      } else {
        next.add(provider);
      }
      return next;
    });
  }, []);

  // Mask API key to show only first 8 characters by default
  const getMaskedApiKey = useCallback((apiKey: string, isVisible: boolean) => {
    if (!apiKey || isVisible) {
      return apiKey;
    }
    if (apiKey.length <= 8) {
      return "•".repeat(apiKey.length);
    }
    return `${apiKey.slice(0, 8)}${"•".repeat(Math.min(apiKey.length - 8, 12))}`;
  }, []);

  // Auto-reveal API key when user focuses on the input
  const handleApiKeyFocus = useCallback(
    (provider: string) => {
      if (!visibleApiKeys.has(provider)) {
        setVisibleApiKeys((prev) => new Set(prev).add(provider));
      }
    },
    [visibleApiKeys]
  );

  return (
    <>
      <div className="h-full flex flex-col">
        {/* Search Input */}
        <div className="flex-shrink-0 relative">
          <Search className="h-4 w-4 text-muted-foreground absolute left-2 top-1/2 transform -translate-y-1/2" />
          <Input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search models by ID..."
            className="w-full border-none pl-8"
          />
        </div>

        <div className="overflow-hidden flex-1 flex flex-col min-h-0">
          <div className="flex-1 overflow-y-auto">
            <Table className="border-t">
              <TableHeader>
                <TableRow className="h-9">
                  <TableHead className="w-[300px] py-2 pl-8 font-bold">Model ID</TableHead>
                  <TableHead className="w-[100px] py-2 font-bold">Free</TableHead>
                  <TableHead className="w-[100px] py-2 font-bold">Disabled</TableHead>
                  <TableHead className="min-w-[200px] py-2 font-bold">API Key</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {Object.entries(groupedModels).map(([provider, providerModels]) => {
                  const isExpanded = expandedProviders.has(provider);
                  const providerSetting = providerSettings.find((p) => p.provider === provider);

                  return (
                    <React.Fragment key={provider}>
                      {/* Provider Group Header */}
                      <TableRow className="h-10 bg-muted/50 hover:bg-muted/70">
                        <TableCell colSpan={3} className="px-1 py-2">
                          <button
                            type="button"
                            onClick={() => toggleProvider(provider)}
                            className="flex items-center gap-2 w-full text-left hover:opacity-80 transition-opacity"
                          >
                            <ChevronDown
                              className={`h-4 w-4 transition-transform duration-200 ${isExpanded ? "rotate-0" : "-rotate-90"
                                }`}
                            />
                            <span className="font-semibold text-sm">{provider}</span>
                            <span className="text-xs text-muted-foreground">
                              ({providerModels.length}{" "}
                              {providerModels.length === 1 ? "model" : "models"})
                            </span>
                          </button>
                        </TableCell>
                        <TableCell className="py-1.5 pr-4">
                          <div className="flex items-center gap-2">
                            {PROVIDER_LINKS[provider] && (
                              <a
                                href={PROVIDER_LINKS[provider]}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="text-muted-foreground hover:text-foreground transition-colors"
                                title={`Get ${provider} API key`}
                              >
                                <ExternalLink className="h-4 w-4" />
                              </a>
                            )}
                            {provider === "GitHub Copilot" && (
                              <div className="flex flex-col gap-2">
                                {!providerSetting?.apiKey && (
                                  <Button
                                    variant="outline"
                                    size="sm"
                                    onClick={handleCopilotLogin}
                                    className="h-7 text-xs"
                                  >
                                    Login with Copilot
                                  </Button>
                                )}
                              </div>
                            )}
                            <div className="flex items-center gap-1 flex-1 relative">
                              <Input
                                type="text"
                                value={
                                  providerSetting?.apiKey
                                    ? visibleApiKeys.has(provider)
                                      ? providerSetting.apiKey
                                      : getMaskedApiKey(providerSetting.apiKey, false)
                                    : ""
                                }
                                onChange={(e) => {
                                  handleProviderApiKeyChange(provider, e.target.value);
                                  // Auto-reveal when user starts typing
                                  if (e.target.value && !visibleApiKeys.has(provider)) {
                                    setVisibleApiKeys((prev) => new Set(prev).add(provider));
                                  }
                                }}
                                onFocus={() => handleApiKeyFocus(provider)}
                                placeholder={`Enter ${provider} API key`}
                                className="w-full h-8 border-0 border-b border-muted-foreground/20 rounded-none pl-0 bg-transparent focus-visible:ring-0 pr-8"
                              />
                              {providerSetting?.apiKey && (
                                <button
                                  type="button"
                                  onClick={() => toggleApiKeyVisibility(provider)}
                                  className="absolute right-0 text-muted-foreground hover:text-foreground transition-colors p-1"
                                  title={
                                    visibleApiKeys.has(provider) ? "Hide API key" : "Show API key"
                                  }
                                >
                                  {visibleApiKeys.has(provider) ? (
                                    <EyeOff className="h-4 w-4" />
                                  ) : (
                                    <Eye className="h-4 w-4" />
                                  )}
                                </button>
                              )}
                            </div>
                          </div>
                        </TableCell>
                      </TableRow>
                      {/* Provider Models */}
                      {isExpanded &&
                        providerModels.map((model) => (
                          <TableRow key={model.modelId} className="h-10">
                            <TableCell className="py-1.5 pl-8">
                              <div className="text-sm font-medium">
                                {searchQuery.trim()
                                  ? TextHighlighter.highlight(model.modelId, searchQuery)
                                  : model.modelId}
                              </div>
                            </TableCell>
                            <TableCell className="py-1.5">
                              {model.free ? (
                                <Badge
                                  variant="secondary"
                                  className="bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400 border-none hover:bg-green-100 dark:hover:bg-green-900/30"
                                >
                                  Yes
                                </Badge>
                              ) : (
                                <div className="text-sm text-muted-foreground">No</div>
                              )}
                            </TableCell>
                            <TableCell className="py-1.5">
                              <div className="flex items-center h-full">
                                <Switch
                                  checked={!model.disabled}
                                  onCheckedChange={(checked) =>
                                    handleDisabledChange(model.modelId, !checked)
                                  }
                                  className="h-4 w-8 data-[state=checked]:bg-primary data-[state=unchecked]:bg-input [&>span]:h-3 [&>span]:w-3 [&>span]:data-[state=checked]:translate-x-4"
                                />
                              </div>
                            </TableCell>
                            <TableCell className="py-1.5" />
                          </TableRow>
                        ))}
                    </React.Fragment>
                  );
                })}
                {Object.keys(groupedModels).length === 0 && (
                  <TableRow>
                    <TableCell colSpan={4} className="text-center text-muted-foreground py-4">
                      {searchQuery.trim() ? "No models found" : "No models available"}
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>
        </div>
      </div>
    </>
  );
}
