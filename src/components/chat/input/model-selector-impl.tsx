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
import { resolveModelSupportsImageInput, type ModelProps } from "@/lib/ai/llm/llm-provider-factory";
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

export interface ModelSelection {
  provider: string;
  modelId: string;
}

type ModelDetailField = {
  label: string;
  value: string;
};

function parseModelDetailFields(model: ModelProps): ModelDetailField[] {
  const fields: ModelDetailField[] = [];
  const rawDescription = model.description?.trim();

  if (rawDescription) {
    const metadataMatches = Array.from(
      rawDescription.matchAll(/^- \*\*(.+?)\*\*: ([\s\S]*?)(?=\n- \*\*|$)/gm)
    );

    if (metadataMatches.length > 0) {
      for (const match of metadataMatches) {
        const [, label, value] = match;
        fields.push({
          label: label.trim(),
          value: value.trim(),
        });
      }
    } else {
      fields.push({
        label: "Description",
        value: rawDescription,
      });
    }
  }

  fields.push({
    label: "Support Image Input",
    value: resolveModelSupportsImageInput(model) ? "Yes" : "No",
  });

  return fields;
}

function FreeBadge() {
  return (
    <Badge className="ml-auto rounded-sm bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400 border-none hover:bg-green-100 dark:hover:bg-green-900/30 text-[9px]">
      Free
    </Badge>
  );
}

function SystemBadge() {
  return (
    <Badge className="rounded-sm bg-info/10 text-info border-none hover:bg-info/10 text-[9px]">
      System
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
      className="m-1 text-xs cursor-pointer py-0.5"
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
          <div className="ml-auto flex items-center gap-1">
            {model.source === "system" ? <SystemBadge /> : null}
            {model.free ? <FreeBadge /> : null}
          </div>
        </div>
      ) : (
        <div className="flex items-center gap-2 w-full text-[11px]">
          <Check className={cn("h-3 w-3 shrink-0", isSelected ? "opacity-100" : "opacity-0")} />
          <span className="truncate">
            <HighlightableCommandItem text={model.modelId} />
          </span>
          <div className="ml-auto flex items-center gap-1">
            {model.source === "system" ? <SystemBadge /> : null}
            {model.free ? <FreeBadge /> : null}
          </div>
        </div>
      )}
    </CommandItem>
  );
}

export interface ModelSelectorImplProps {
  className?: string;
  autoSelectAvailable?: boolean;
  value?: ModelSelection | null;
  onChange?: (model: ModelSelection) => void;
  disabled?: boolean;
  showLabel?: boolean;
  ariaLabel?: string;
  popoverAlign?: "start" | "center" | "end";
  popoverSide?: "top" | "right" | "bottom" | "left";
  popoverSideOffset?: number;
  popoverContentClassName?: string;
  showConfigureAction?: boolean;
}

export function ModelSelectorImpl({
  className,
  autoSelectAvailable,
  value,
  onChange,
  disabled = false,
  showLabel = true,
  ariaLabel = "Select model",
  popoverAlign = "start",
  popoverSide = "top",
  popoverSideOffset = 4,
  popoverContentClassName,
  showConfigureAction = true,
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
  const effectiveAutoSelectAvailable =
    autoSelectAvailable ??
    availableModels.some((model) => model.provider === "System" && model.modelId === "Auto");
  const activeModel = value ?? selectedModel;
  const [highlightedValue, setHighlightedValue] = useState<string | undefined>(
    activeModel ? `${activeModel.provider} ${activeModel.modelId}` : undefined
  );
  const [groupByProvider, setGroupByProvider] = useState(false);

  // Filter out "System (Auto)" if auto-select is not available
  const filteredModels = useMemo(() => {
    if (effectiveAutoSelectAvailable) {
      return availableModels;
    }
    return availableModels.filter((m) => !(m.provider === "System" && m.modelId === "Auto"));
  }, [availableModels, effectiveAutoSelectAvailable]);

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
    if (onChange) {
      return;
    }

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
      if (effectiveAutoSelectAvailable) {
        setSelectedModel({ provider: "System", modelId: "Auto" });
      } else if (filteredModels.length > 0) {
        const firstModel = filteredModels[0];
        setSelectedModel({ provider: firstModel.provider, modelId: firstModel.modelId });
      }
    }
  }, [
    filteredModels,
    onChange,
    selectedModel,
    setSelectedModel,
    effectiveAutoSelectAvailable,
    isLoading,
    copilotModelsLoaded,
    providerSettings,
  ]);

  useEffect(() => {
    if (open && activeModel) {
      setHighlightedValue(`${activeModel.provider} ${activeModel.modelId}`);
    }
  }, [activeModel, open]);

  const handleSelect = useCallback(
    (model: ModelSelection) => {
      if (onChange) {
        onChange(model);
      } else {
        setSelectedModel(model);
      }
      setOpen(false);
      if (!onChange) {
        window.dispatchEvent(new CustomEvent("MODEL_CHANGED", { detail: model }));
      }
    },
    [onChange, setSelectedModel]
  );

  const currentModel = filteredModels.find(
    (m) => activeModel && m.provider === activeModel.provider && m.modelId === activeModel.modelId
  );
  const displayModel = currentModel ?? activeModel;

  const highlightedModel = useMemo(() => {
    // When searching, highlightedValue matches the composite value (provider + modelId)
    // We need to find the model that matches this composite value
    if (!highlightedValue) return undefined;

    // Try to find by composite value
    return filteredModels.find((m) => `${m.provider} ${m.modelId}` === highlightedValue);
  }, [filteredModels, highlightedValue]);

  const highlightedModelFields = useMemo(
    () => (highlightedModel ? parseModelDetailFields(highlightedModel) : []),
    [highlightedModel]
  );

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="ghost"
          size="sm"
          role="combobox"
          aria-expanded={open}
          aria-label={ariaLabel}
          disabled={disabled}
          className={cn(
            "h-6 gap-1 px-2 text-xs font-normal text-muted-foreground hover:text-foreground",
            className
          )}
        >
          {showLabel ? (
            <span className="truncate max-w-[350px]">
              {displayModel
                ? `${displayModel.provider} | ${displayModel.modelId}`
                : "Select model..."}
            </span>
          ) : null}
          <ChevronsUpDown className="ml-0.5 h-3 w-3 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent
        className={cn(
          "p-0 w-auto flex items-stretch bg-transparent border-0 shadow-none pointer-events-auto",
          popoverContentClassName
        )}
        align={popoverAlign}
        side={popoverSide}
        sideOffset={popoverSideOffset}
      >
        <Command
          value={highlightedValue}
          onValueChange={setHighlightedValue}
          className="flex flex-row items-stretch overflow-visible bg-transparent shadow-none border-0"
          filter={(value: string, search: string) => {
            return value.toLowerCase().includes(search.toLowerCase());
          }}
        >
          <div
            data-panel="left"
            className={cn(
              "flex h-[250px] min-h-[250px] max-h-[250px] w-[300px] flex-col overflow-hidden rounded-sm border bg-popover shadow-md",
              highlightedModelFields.length > 0 ? "rounded-r-none" : ""
            )}
          >
            <CommandInput
              placeholder="Search models..."
              className="h-[32px] text-[10px] shrink-0"
              wrapperClassName="px-2"
              iconClassName="h-3 w-3"
            />
            {(providerEntries.length > 0 || sortedModels.length > 0) && (
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
            )}
            <CommandList
              id="model-list"
              className="min-h-0 flex-1 overflow-y-auto [&_[cmdk-list-sizer]]:max-h-none"
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
                            activeModel?.modelId === model.modelId &&
                            activeModel?.provider === model.provider
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
                        activeModel?.modelId === model.modelId &&
                        activeModel?.provider === model.provider
                      }
                      onSelect={handleSelect}
                      showProvider={true}
                    />
                  ))}
            </CommandList>
            {showConfigureAction ? (
              <>
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
              </>
            ) : null}
          </div>

          {highlightedModelFields.length > 0 && (
            <div
              data-panel="right"
              className="h-[250px] min-h-[250px] max-h-[250px] w-[250px] overflow-y-auto rounded-sm rounded-l-none border border-l-0 bg-popover p-2 text-[10px] text-popover-foreground shadow-md"
            >
              <div className="flex flex-col gap-3">
                {highlightedModelFields.map((field) => (
                  <div key={field.label} className="flex flex-col gap-1">
                    <div className="text-[9px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">
                      {field.label}
                    </div>
                    <div className="text-[10px] leading-relaxed text-popover-foreground">
                      <ReactMarkdown remarkPlugins={[remarkGfm]}>{field.value}</ReactMarkdown>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </Command>
      </PopoverContent>
    </Popover>
  );
}
