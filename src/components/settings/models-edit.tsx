import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { MODELS } from "@/lib/ai/llm-provider-factory";
import { ModelManager, type ModelSetting } from "@/lib/models/model-manager";
import { TextHighlighter } from "@/lib/text-highlighter";
import { ChevronDown, Search } from "lucide-react";
import React, { useCallback, useEffect, useMemo, useState } from "react";

export function ModelsEdit() {
  const [models, setModels] = useState<ModelSetting[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [expandedProviders, setExpandedProviders] = useState<Set<string>>(new Set());
  const modelManager = ModelManager.getInstance();

  // Load models from localStorage on mount
  useEffect(() => {
    const storedModels = modelManager.getModelSettings();

    // Get all available models from the flattened MODELS array
    const availableModels: ModelSetting[] = [];
    for (const model of MODELS) {
      const stored = storedModels.find((m) => m.modelId === model.modelId && m.provider === model.provider);
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
              apiKey: "",
            }
      );
    }

    setModels(availableModels);
  }, [modelManager]);

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

  const handleApiKeyChange = useCallback(
    (modelId: string, apiKey: string) => {
      setModels((prev) => {
        const updated = prev.map((m) => (m.modelId === modelId ? { ...m, apiKey } : m));
        modelManager.setModelSettings(updated);
        return updated;
      });
    },
    [modelManager]
  );

  // Filter models based on search query
  const filteredModels = useMemo(() => {
    if (!searchQuery.trim()) {
      return models;
    }
    const queryLower = searchQuery.toLowerCase();
    return models.filter((model) => model.modelId.toLowerCase().includes(queryLower));
  }, [models, searchQuery]);

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

  // Expand all providers by default, and auto-expand providers that have matching models when searching
  useEffect(() => {
    const allProviders = Object.keys(groupedModels);
    if (allProviders.length > 0) {
      setExpandedProviders(new Set(allProviders));
    }
  }, [groupedModels]);

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

  return (
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
                return (
                  <React.Fragment key={provider}>
                    {/* Provider Group Header */}
                    <TableRow className="h-10 bg-muted/50 hover:bg-muted/70">
                      <TableCell colSpan={4} className="px-1 py-2">
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
                            ({providerModels.length} {providerModels.length === 1 ? "model" : "models"})
                          </span>
                        </button>
                      </TableCell>
                    </TableRow>
                    {/* Provider Models */}
                    {isExpanded &&
                      providerModels.map((model) => (
                        <TableRow key={model.modelId} className="h-10">
                          <TableCell className="py-1.5 pl-8">
                            <div className="text-sm font-medium">
                              {searchQuery.trim()
                                ? TextHighlighter.highlight(
                                    model.modelId,
                                    searchQuery,
                                    "bg-yellow-200 dark:bg-yellow-900"
                                  )
                                : model.modelId}
                            </div>
                          </TableCell>
                          <TableCell className="py-1.5">
                            <div className="text-sm text-muted-foreground">{model.free ? "Yes" : "No"}</div>
                          </TableCell>
                          <TableCell className="py-1.5">
                            <Switch
                              checked={!model.disabled}
                              onCheckedChange={(checked) => handleDisabledChange(model.modelId, !checked)}
                            />
                          </TableCell>
                          <TableCell className="py-1.5 min-w-[200px]">
                            <Input
                              type="password"
                              value={model.apiKey}
                              onChange={(e) => handleApiKeyChange(model.modelId, e.target.value)}
                              placeholder="Enter API key"
                              className="w-full h-8 border-none pl-0"
                            />
                          </TableCell>
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
  );
}
