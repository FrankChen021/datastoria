import { Button } from "@/components/ui/button";
import { Command, CommandEmpty, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { useModelConfig } from "@/hooks/use-model-config";
import type { ModelProps } from "@/lib/ai/llm-provider-factory";
import { cn } from "@/lib/utils";
import { Check, ChevronsUpDown, Settings2 } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { showSettingsDialog } from "../../settings/settings-dialog";
import { HighlightableCommandItem } from "../../shared/cmdk/cmdk-extension";

interface ModelCommandItemProps {
  model: ModelProps;
  isSelected: boolean;
  onSelect: (model: { provider: string; modelId: string }) => void;
}

function ModelCommandItem({ model, isSelected, onSelect }: ModelCommandItemProps) {
  return (
    <CommandItem
      value={`${model.provider} ${model.modelId}`}
      onSelect={() => onSelect({ provider: model.provider, modelId: model.modelId })}
      className="m-1 text-xs cursor-pointer py-1"
    >
      <div className="grid grid-cols-[16px_70px_1fr] items-center gap-2 w-full text-[10px]">
        <Check className={cn("h-3 w-3 shrink-0", isSelected ? "opacity-100" : "opacity-0")} />
        <span className="text-muted-foreground truncate">
          <HighlightableCommandItem text={model.provider} />
        </span>
        <span className="truncate">
          <HighlightableCommandItem text={model.modelId} />
        </span>
      </div>
    </CommandItem>
  );
}

export function ModelSelector() {
  const [open, setOpen] = useState(false);
  const { availableModels, selectedModel, setSelectedModel } = useModelConfig();
  const [highlightedValue, setHighlightedValue] = useState<string | undefined>(
    selectedModel ? `${selectedModel.provider} ${selectedModel.modelId}` : undefined
  );

  useEffect(() => {
    // If no model is selected, or the selected model is no longer available, select 'auto' as default
    const isSelectedModelAvailable =
      selectedModel &&
      availableModels.some((m) => m.provider === selectedModel.provider && m.modelId === selectedModel.modelId);

    if (!selectedModel || !isSelectedModelAvailable) {
      setSelectedModel({ provider: "System", modelId: "Auto" });
    }
  }, [availableModels, selectedModel, setSelectedModel]);

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

  const currentModel = availableModels.find(
    (m) => selectedModel && m.provider === selectedModel.provider && m.modelId === selectedModel.modelId
  );

  const highlightedModel = useMemo(() => {
    // When searching, highlightedValue matches the composite value (provider + modelId)
    // We need to find the model that matches this composite value
    if (!highlightedValue) return undefined;

    // Try to find by composite value
    return availableModels.find((m) => `${m.provider} ${m.modelId}` === highlightedValue);
  }, [availableModels, highlightedValue]);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="ghost"
          size="sm"
          role="combobox"
          aria-expanded={open}
          className="h-6 gap-1 px-2 text-xs font-normal text-muted-foreground hover:text-foreground"
        >
          <span className="truncate max-w-[350px]">
            {currentModel ? `${currentModel.provider} | ${currentModel.modelId}` : "Select model..."}
          </span>
          <ChevronsUpDown className="ml-0.5 h-3 w-3 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent
        className="p-0 w-auto flex items-start z-[10000] bg-transparent border-0 shadow-none"
        align="start"
        side="top"
      >
        <Command
          value={highlightedValue}
          onValueChange={setHighlightedValue}
          className="flex-row items-start overflow-visible bg-transparent"
          filter={(value: string, search: string) => {
            return value.toLowerCase().includes(search.toLowerCase());
          }}
        >
          <div
            className={cn(
              "w-[300px] border bg-popover rounded-md overflow-hidden shadow-md flex flex-col",
              highlightedModel?.description ? "rounded-r-none" : ""
            )}
          >
            <CommandInput placeholder="Search models..." className="h-[32px] text-[10px] shrink-0" />
            <CommandList id="model-list" className="max-h-[300px]">
              <CommandEmpty className="h-[32px] py-2 text-center text-[10px]">No model found.</CommandEmpty>
              {availableModels.map((model) => (
                <ModelCommandItem
                  key={`${model.provider}-${model.modelId}`}
                  model={model}
                  isSelected={selectedModel?.modelId === model.modelId && selectedModel?.provider === model.provider}
                  onSelect={handleSelect}
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
                Configure AI Models...
              </Button>
            </div>
          </div>

          {highlightedModel?.description && (
            <div className="w-[250px] max-h-[365px] overflow-y-auto p-2 bg-popover rounded-r-md border border-l-0 text-[10px] text-popover-foreground shadow-md self-start">
              {highlightedModel.description}
            </div>
          )}
        </Command>
      </PopoverContent>
    </Popover>
  );
}
