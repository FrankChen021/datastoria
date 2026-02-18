import {
  AgentConfigurationManager,
  type AgentConfiguration,
  type AgentMode,
} from "@/components/settings/agent/agent-manager";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { Switch } from "@/components/ui/switch";
import { ChevronDown } from "lucide-react";
import { useEffect, useState } from "react";

export function AgentEdit() {
  const [configuration, setConfiguration] = useState<AgentConfiguration>(
    AgentConfigurationManager.getConfiguration()
  );

  useEffect(() => {
    const currentMode = AgentConfigurationManager.getConfiguration();
    setConfiguration(currentMode);
  }, []);

  const handleModeChange = (value: string) => {
    const newConfig = { ...configuration, mode: value as AgentMode };
    setConfiguration(newConfig);
    AgentConfigurationManager.setConfiguration(newConfig);
  };

  const handlePruningChange = (checked: boolean) => {
    const newConfig = { ...configuration, pruneValidateSql: checked };
    setConfiguration(newConfig);
    AgentConfigurationManager.setConfiguration(newConfig);
  };

  return (
    <div className="h-full flex flex-col">
      <div className="px-4 py-2 grid gap-2">
        <div className="grid grid-cols-[200px_300px_1fr] gap-8 items-start">
          <div className="space-y-1 pt-2">
            <Label>Agent Mode</Label>
          </div>
          <div className="flex items-center">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" className="w-full justify-between">
                  {configuration.mode === "v2" ? "V2 (Skill-based)" : "V1 (Legacy)"}
                  <ChevronDown className="ml-2 h-4 w-4 opacity-50" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent className="w-[300px] z-[10000]">
                <DropdownMenuRadioGroup value={configuration.mode} onValueChange={handleModeChange}>
                  <DropdownMenuRadioItem value="v2">V2 (Skill-based)</DropdownMenuRadioItem>
                  <DropdownMenuRadioItem value="legacy">
                    V1 (Should not be used)
                  </DropdownMenuRadioItem>
                </DropdownMenuRadioGroup>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
          <div className="text-sm text-muted-foreground pt-2">
            Select which agent architecture to use for chat interactions.
          </div>
        </div>

        <Separator />
        <div className="grid grid-cols-[200px_300px_1fr] gap-8 items-start">
          <div className="space-y-1 pt-2">
            <Label>Context Pruning</Label>
          </div>
          <div className="flex items-center h-10">
            <Switch
              checked={configuration.pruneValidateSql ?? true}
              onCheckedChange={handlePruningChange}
            />
          </div>
          <div className="text-sm text-muted-foreground pt-2">
            Enable surgical pruning of SQL validations from history to save tokens.
          </div>
        </div>
      </div>
    </div>
  );
}
