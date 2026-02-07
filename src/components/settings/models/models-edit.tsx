import { StatusPopover } from "@/components/connection/connection-edit-component";
import {
  ModelManager,
  type ModelSetting,
  type ProviderSetting,
} from "@/components/settings/models/model-manager";
import { Dialog as SharedDialog } from "@/components/shared/use-dialog";
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
import { useModelConfig } from "@/hooks/use-model-config";
import { type ModelProps } from "@/lib/ai/llm/llm-provider-factory";
import { PROVIDER_GITHUB_COPILOT } from "@/lib/ai/llm/provider-ids";
import { TextHighlighter } from "@/lib/text-highlighter";
import { AlertCircle, ChevronDown, ExternalLink, Eye, EyeOff, Search } from "lucide-react";
import React, { useCallback, useEffect, useState } from "react";
import { GitHubLoginComponent } from "./github-login-component";

const PROVIDER_LINKS: Record<string, string> = {
  OpenAI: "https://platform.openai.com/api-keys",
  Google: "https://aistudio.google.com/app/apikey",
  Anthropic: "https://console.anthropic.com/settings/keys",
  OpenRouter: "https://openrouter.ai/settings/keys",
  Groq: "https://console.groq.com/keys",
  Cerebras: "https://cloud.cerebras.ai/platform",
};

export function ModelsEdit() {
  const { allModels, modelSettings, providerSettings, fetchDynamicModels } = useModelConfig();
  const modelManager = ModelManager.getInstance();

  const [searchQuery, setSearchQuery] = useState("");

  // Start with all providers collapsed (empty set) to show only provider headers by default
  const [expandedProviders, setExpandedProviders] = useState<Set<string>>(new Set());

  // Track which providers have visible API keys
  const [visibleApiKeys, setVisibleApiKeys] = useState<Set<string>>(new Set());
  const [clearConfirmProvider, setClearConfirmProvider] = useState<string | null>(null);

  const handleModelDisabled = useCallback(
    (provider: string, modelId: string, disabled: boolean) => {
      modelManager.updateModelSetting(provider, modelId, { disabled });
    },
    [modelManager]
  );

  const handleProviderApiKeyChange = useCallback(
    (provider: string, apiKey: string) => {
      modelManager.updateProviderSetting(provider, { apiKey });
    },
    [modelManager]
  );

  const [providers, setProviders] = useState<Array<[string, ModelSetting[]]>>([]);

  useEffect(() => {
    const queryLower = searchQuery.toLowerCase().trim();
    const currentModelSettings = allModels.map((model: ModelProps) => {
      const stored = modelSettings.find(
        (m: ModelSetting) => m.modelId === model.modelId && m.provider === model.provider
      );
      return (
        stored || {
          modelId: model.modelId,
          provider: model.provider,
          disabled: !!model.disabled,
          free: !!model.free,
        }
      );
    });

    const filtered = queryLower
      ? currentModelSettings.filter((model) => model.modelId.toLowerCase().includes(queryLower))
      : currentModelSettings;

    const grouped = filtered.reduce(
      (acc: Record<string, ModelSetting[]>, model: ModelSetting) => {
        const provider = model.provider;
        if (!acc[provider]) {
          acc[provider] = [];
        }
        acc[provider].push(model);
        return acc;
      },
      {} as Record<string, ModelSetting[]>
    );

    const entries = Object.entries(grouped);
    const hasCopilot = entries.some(([provider]) => provider === PROVIDER_GITHUB_COPILOT);
    if (!hasCopilot) {
      const copilotLabel = PROVIDER_GITHUB_COPILOT.toLowerCase();
      if (!queryLower.trim() || copilotLabel.includes(queryLower)) {
        entries.push([PROVIDER_GITHUB_COPILOT, [] as ModelSetting[]]);
      }
    }

    entries.sort(([a], [b]) => a.localeCompare(b));
    setProviders(entries);
  }, [allModels, modelSettings, searchQuery]);

  const handleCopilotLogin = async () => {
    SharedDialog.showDialog({
      title: "Login with GitHub Copilot",
      description: "Authorize this application to access your GitHub Copilot models.",
      className: "w-full max-w-[600px] sm:max-w-[600px]",
      mainContent: (
        <GitHubLoginComponent
          onSuccess={(tokens) => {
            modelManager.updateProviderSetting(PROVIDER_GITHUB_COPILOT, {
              apiKey: tokens.accessToken,
              refreshToken: tokens.refreshToken,
              accessTokenExpiresAt: tokens.accessTokenExpiresAt,
              refreshTokenExpiresAt: tokens.refreshTokenExpiresAt,
              authError: undefined,
            });
            fetchDynamicModels(tokens.accessToken);
            SharedDialog.close();
          }}
          onCancel={() => {
            SharedDialog.close();
          }}
        />
      ),
      disableBackdrop: true,
    });
  };

  // Expand all providers when searching
  useEffect(() => {
    if (searchQuery.trim()) {
      const allProviders = providers.map(([provider]) => provider);
      if (allProviders.length > 0) {
        setExpandedProviders((prev) => {
          const next = new Set(prev);
          allProviders.forEach((p) => next.add(p));
          return next;
        });
      }
    }
  }, [providers, searchQuery]);

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

  const handleClearProviderKey = useCallback(
    (provider: string) => {
      modelManager.deleteProviderSetting(provider);
      setClearConfirmProvider(null);
    },
    [modelManager]
  );

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
                {providers.map(([provider, providerModels]: [string, ModelSetting[]]) => {
                  const isExpanded = expandedProviders.has(provider);
                  const providerSetting = providerSettings.find(
                    (p: ProviderSetting) => p.provider === provider
                  );

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
                              className={`h-4 w-4 transition-transform duration-200 ${
                                isExpanded ? "rotate-0" : "-rotate-90"
                              }`}
                            />
                            <span className="font-semibold text-sm">{provider}</span>
                            <span className="text-xs text-muted-foreground">
                              {provider === PROVIDER_GITHUB_COPILOT && !providerSetting?.apiKey
                                ? "(Login to view available models)"
                                : `(${providerModels.length} ${
                                    providerModels.length === 1 ? "model" : "models"
                                  })`}
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
                            {provider === PROVIDER_GITHUB_COPILOT && (
                              <div className="flex flex-col gap-2">
                                {!providerSetting?.apiKey ? (
                                  <Button
                                    variant="outline"
                                    size="sm"
                                    onClick={handleCopilotLogin}
                                    className="h-7 text-xs"
                                  >
                                    Login with Copilot
                                  </Button>
                                ) : (
                                  <StatusPopover
                                    open={clearConfirmProvider === provider}
                                    onOpenChange={(open) =>
                                      setClearConfirmProvider(open ? provider : null)
                                    }
                                    trigger={
                                      <Button variant="outline" size="sm" className="h-7 text-xs">
                                        Logout
                                      </Button>
                                    }
                                    side="top"
                                    align="center"
                                    sideOffset={4}
                                    icon={
                                      <AlertCircle className="h-4 w-4 mt-0.5 shrink-0 text-red-600 dark:text-red-400" />
                                    }
                                    title="Confirm logout"
                                  >
                                    <div className="text-xs mb-3">
                                      This will clear your local Copilot tokens. You'll need to log
                                      in again to use Copilot models.
                                    </div>
                                    <div className="flex justify-end gap-2">
                                      <Button
                                        type="button"
                                        variant="outline"
                                        size="sm"
                                        className="h-8 rounded-sm text-sm"
                                        onClick={() => setClearConfirmProvider(null)}
                                      >
                                        Cancel
                                      </Button>
                                      <Button
                                        type="button"
                                        variant="destructive"
                                        size="sm"
                                        className="h-8 rounded-sm text-sm"
                                        onClick={() => handleClearProviderKey(provider)}
                                      >
                                        Logout
                                      </Button>
                                    </div>
                                  </StatusPopover>
                                )}
                                {providerSetting?.authError && (
                                  <div className="text-xs text-destructive">
                                    {providerSetting.authError === "refresh_failed"
                                      ? "Session refresh failed. Please login again."
                                      : "Session expired. Please login again."}
                                  </div>
                                )}
                              </div>
                            )}
                            {provider !== PROVIDER_GITHUB_COPILOT && (
                              <div className="flex items-center gap-1 flex-1 ">
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
                                  <div className="right-0 flex items-center gap-1">
                                    <button
                                      type="button"
                                      onClick={() => toggleApiKeyVisibility(provider)}
                                      className="text-muted-foreground hover:text-foreground transition-colors p-1"
                                      title={
                                        visibleApiKeys.has(provider)
                                          ? "Hide API key"
                                          : "Show API key"
                                      }
                                    >
                                      {visibleApiKeys.has(provider) ? (
                                        <EyeOff className="h-4 w-4" />
                                      ) : (
                                        <Eye className="h-4 w-4" />
                                      )}
                                    </button>
                                    <StatusPopover
                                      open={clearConfirmProvider === provider}
                                      onOpenChange={(open) =>
                                        setClearConfirmProvider(open ? provider : null)
                                      }
                                      trigger={
                                        <Button
                                          type="button"
                                          variant="outline"
                                          size="sm"
                                          className="h-6 px-2 text-xs"
                                        >
                                          Clear
                                        </Button>
                                      }
                                      side="left"
                                      align="end"
                                      sideOffset={4}
                                      icon={
                                        <AlertCircle className="h-4 w-4 mt-0.5 shrink-0 text-red-600 dark:text-red-400" />
                                      }
                                      title="Clear API key"
                                    >
                                      <div className="text-xs mb-3">
                                        Remove the saved API key for {provider}?
                                      </div>
                                      <div className="flex justify-end gap-2">
                                        <Button
                                          type="button"
                                          variant="outline"
                                          size="sm"
                                          className="h-8 rounded-sm text-sm"
                                          onClick={() => setClearConfirmProvider(null)}
                                        >
                                          Cancel
                                        </Button>
                                        <Button
                                          type="button"
                                          variant="destructive"
                                          size="sm"
                                          className="h-8 rounded-sm text-sm"
                                          onClick={() => handleClearProviderKey(provider)}
                                        >
                                          Clear
                                        </Button>
                                      </div>
                                    </StatusPopover>
                                  </div>
                                )}
                              </div>
                            )}
                          </div>
                        </TableCell>
                      </TableRow>
                      {/* Provider Models */}
                      {isExpanded &&
                        providerModels.map((model) => (
                          <TableRow key={`${model.provider}-${model.modelId}`} className="h-10">
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
                                  title="This is a hint, whehter it's a free model, you should always follow the provider's documentation to know more about the pricing."
                                >
                                  Free *
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
                                    handleModelDisabled(model.provider, model.modelId, !checked)
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
                {providers.length === 0 && (
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
