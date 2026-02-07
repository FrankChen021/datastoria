import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Switch } from "@/components/ui/switch";
import { useModelConfig } from "@/hooks/use-model-config";
import type { ModelProps } from "@/lib/ai/llm/llm-provider-factory";
import { PROVIDER_GITHUB_COPILOT } from "@/lib/ai/llm/provider-ids";
import { cn } from "@/lib/utils";
import { Check, ChevronsUpDown, Layers, Settings2 } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { showSettingsDialog } from "../../settings/settings-dialog";
import { HighlightableCommandItem } from "../../shared/cmdk/cmdk-extension";

interface ModelCommandItemProps {
  model: ModelProps;
  isSelected: boolean;
  onSelect: (model: { provider: string; modelId: string }) => void;
  showProvider?: boolean;
}

function FreeBadge() {
  return (
    <Badge className="ml-auto rounded-sm bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400 border-none hover:bg-green-100 dark:hover:bg-green-900/30 text-[9px]">
      Free
    </Badge>
  );
}

function ModelCommandItem({
  model,
  isSelected,
  onSelect,
  showProvider = true,
}: ModelCommandItemProps) {
  return (
    <CommandItem
      value={`${model.provider} ${model.modelId}`}
      onSelect={() => onSelect({ provider: model.provider, modelId: model.modelId })}
      className="m-1 text-xs cursor-pointer py-1"
    >
      {showProvider ? (
        <div className="grid grid-cols-[16px_70px_1fr_auto] items-center gap-1 w-full text-[10px]">
          <Check className={cn("h-3 w-3 shrink-0", isSelected ? "opacity-100" : "opacity-0")} />
          <span className="text-muted-foreground truncate">
            <HighlightableCommandItem text={model.provider} />
          </span>
          <span className="truncate">
            <HighlightableCommandItem text={model.modelId} />
          </span>
          {model.free ? <FreeBadge /> : null}
        </div>
      ) : (
        <div className="flex items-center gap-2 w-full text-[10px]">
          <Check className={cn("h-3 w-3 shrink-0", isSelected ? "opacity-100" : "opacity-0")} />
          <span className="truncate">
            <HighlightableCommandItem text={model.modelId} />
          </span>
          {model.free ? <FreeBadge /> : null}
        </div>
      )}
    </CommandItem>
  );
}

interface ModelSelectorImplProps {
  className?: string;
  autoSelectAvailable?: boolean;
}

export function ModelSelectorImpl({
  className,
  autoSelectAvailable = false,
}: ModelSelectorImplProps = {}) {
  const [open, setOpen] = useState(false);
  const {
    availableModels,
    selectedModel,
    setSelectedModel,
    isLoading,
    providerSettings,
    copilotModelsLoaded,
  } = useModelConfig();
  const [highlightedValue, setHighlightedValue] = useState<string | undefined>(
    selectedModel ? `${selectedModel.provider} ${selectedModel.modelId}` : undefined
  );
  const [groupByProvider, setGroupByProvider] = useState(false);

  // Filter out "System (Auto)" if auto-select is not available
  const filteredModels = useMemo(() => {
    if (autoSelectAvailable) {
      return availableModels;
    }
    return availableModels.filter((m) => !(m.provider === "System" && m.modelId === "Auto"));
  }, [availableModels, autoSelectAvailable]);

  const sortedModels = useMemo(() => {
    const items = [...filteredModels];
    items.sort((a, b) => {
      const providerCompare = a.provider.localeCompare(b.provider);
      if (providerCompare !== 0) return providerCompare;
      return a.modelId.localeCompare(b.modelId);
    });
    return items;
  }, [filteredModels]);

  // Group models by provider for grouped view
  const modelsByProvider = useMemo(() => {
    const groups: Record<string, ModelProps[]> = {};
    for (const model of sortedModels) {
      if (!groups[model.provider]) {
        groups[model.provider] = [];
      }
      groups[model.provider].push(model);
    }
    return groups;
  }, [sortedModels]);

  const providerEntries = useMemo(() => {
    return Object.entries(modelsByProvider).sort(([a], [b]) => a.localeCompare(b));
  }, [modelsByProvider]);

  useEffect(() => {
    // If no model is selected, or the selected model is no longer available, select default
    const isSelectedModelAvailable =
      selectedModel &&
      filteredModels.some(
        (m) => m.provider === selectedModel.provider && m.modelId === selectedModel.modelId
      );

    const copilotSetting = providerSettings.find((p) => p.provider === PROVIDER_GITHUB_COPILOT);
    const isSelectedCopilot = selectedModel?.provider === PROVIDER_GITHUB_COPILOT;
    // Avoid resetting Copilot selection while models load dynamically.
    // This keeps the user's choice stable until Copilot models are available.
    if (
      isSelectedCopilot &&
      copilotSetting?.apiKey &&
      !isSelectedModelAvailable &&
      !copilotModelsLoaded
    ) {
      return;
    }

    if (!selectedModel || !isSelectedModelAvailable) {
      // If auto-select is available, default to "System (Auto)"
      // Otherwise, select the first available user-configured model
      if (autoSelectAvailable) {
        setSelectedModel({ provider: "System", modelId: "Auto" });
      } else if (filteredModels.length > 0) {
        const firstModel = filteredModels[0];
        setSelectedModel({ provider: firstModel.provider, modelId: firstModel.modelId });
      }
    }
  }, [
    filteredModels,
    selectedModel,
    setSelectedModel,
    autoSelectAvailable,
    isLoading,
    copilotModelsLoaded,
    providerSettings,
  ]);

  useEffect(() => {
    if (open && selectedModel) {
      setHighlightedValue(`${selectedModel.provider} ${selectedModel.modelId}`);
    }
  }, [open, selectedModel]);

  const handleSelect = useCallback(
    (model: { provider: string; modelId: string }) => {
      setSelectedModel(model);
      setOpen(false);
      // Trigger a custom event so other components know the model changed
      window.dispatchEvent(new CustomEvent("MODEL_CHANGED", { detail: model }));
    },
    [setSelectedModel]
  );

  const currentModel = filteredModels.find(
    (m) =>
      selectedModel && m.provider === selectedModel.provider && m.modelId === selectedModel.modelId
  );
  const displayModel = currentModel ?? selectedModel;

  const highlightedModel = useMemo(() => {
    // When searching, highlightedValue matches the composite value (provider + modelId)
    // We need to find the model that matches this composite value
    if (!highlightedValue) return undefined;

    // Try to find by composite value
    return filteredModels.find((m) => `${m.provider} ${m.modelId}` === highlightedValue);
  }, [filteredModels, highlightedValue]);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="ghost"
          size="sm"
          role="combobox"
          aria-expanded={open}
          className={cn(
            "h-6 gap-1 px-2 text-xs font-normal text-muted-foreground hover:text-foreground",
            className
          )}
        >
          <span className="truncate max-w-[350px]">
            {displayModel
              ? `${displayModel.provider} | ${displayModel.modelId}`
              : "Select model..."}
          </span>
          <ChevronsUpDown className="ml-0.5 h-3 w-3 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent
        className="p-0 w-auto flex items-stretch bg-transparent border-0 shadow-none pointer-events-auto"
        align="start"
        side="top"
        sideOffset={4}
      >
        <Command
          value={highlightedValue}
          onValueChange={setHighlightedValue}
          className="flex flex-row items-stretch max-h-[300px] overflow-visible bg-transparent shadow-none border-0"
          filter={(value: string, search: string) => {
            return value.toLowerCase().includes(search.toLowerCase());
          }}
        >
          <div
            data-panel="left"
            className={cn(
              "w-[300px] border bg-popover rounded-sm overflow-hidden shadow-md flex flex-col",
              highlightedModel?.description ? "rounded-r-none" : ""
            )}
          >
            <CommandInput
              placeholder="Search models..."
              className="h-[32px] text-[10px] shrink-0"
              wrapperClassName="px-2"
              iconClassName="h-3 w-3"
            />
            <div className="flex items-center justify-between px-2 py-1.5 shrink-0">
              <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground">
                <Layers className="h-3 w-3 opacity-50" />
                <span>Group by provider</span>
              </div>
              <Switch
                checked={groupByProvider}
                onCheckedChange={setGroupByProvider}
                className="h-4 w-7 data-[state=checked]:bg-primary data-[state=unchecked]:bg-input [&>span]:h-3 [&>span]:w-3 [&>span]:data-[state=checked]:translate-x-3"
              />
            </div>
            <CommandList
              id="model-list"
              className="flex-1 overflow-y-auto [&_[cmdk-list-sizer]]:max-h-none"
            >
              <CommandEmpty className="h-[32px] py-2 text-center text-[10px]">
                No model found.
              </CommandEmpty>
              {groupByProvider
                ? // Grouped view
                  providerEntries.map(([provider, models]) => (
                    <CommandGroup
                      key={provider}
                      heading={provider}
                      className="[&_[cmdk-group-heading]]:text-[10px] [&_[cmdk-group-heading]]:py-0 py-0"
                    >
                      {models.map((model) => (
                        <ModelCommandItem
                          key={`${model.provider}-${model.modelId}`}
                          model={model}
                          isSelected={
                            selectedModel?.modelId === model.modelId &&
                            selectedModel?.provider === model.provider
                          }
                          onSelect={handleSelect}
                          showProvider={false}
                        />
                      ))}
                    </CommandGroup>
                  ))
                : // Flat view
                  sortedModels.map((model) => (
                    <ModelCommandItem
                      key={`${model.provider}-${model.modelId}`}
                      model={model}
                      isSelected={
                        selectedModel?.modelId === model.modelId &&
                        selectedModel?.provider === model.provider
                      }
                      onSelect={handleSelect}
                      showProvider={true}
                    />
                  ))}
            </CommandList>
            <div className="h-px bg-border shrink-0" />
            <div className="h-[32px] items-center flex mx-1 shrink-0">
              <Button
                variant="ghost"
                size="sm"
                className="w-full h-[24px] justify-start px-2 text-[10px] font-normal gap-2 rounded-sm"
                onClick={() => {
                  setOpen(false);
                  showSettingsDialog({ initialSection: "models" });
                }}
              >
                <Settings2 className="h-3 w-3" />
                Configure more AI Models...
              </Button>
            </div>
          </div>

          {highlightedModel?.description && (
            <div
              data-panel="right"
              className="w-[250px] overflow-y-auto p-2 bg-popover rounded-sm rounded-l-none border border-l-0 text-[10px] text-popover-foreground shadow-md"
            >
              <ReactMarkdown remarkPlugins={[remarkGfm]}>
                {highlightedModel.description}
              </ReactMarkdown>
            </div>
          )}
        </Command>
      </PopoverContent>
    </Popover>
  );
}
