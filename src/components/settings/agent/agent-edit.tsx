import { AgentConfigurationManager, type AgentConfiguration, type AgentMode } from "@/components/settings/agent/agent-manager";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Label } from "@/components/ui/label";
import { ChevronDown } from "lucide-react";
import { useEffect, useState } from "react";

export function AgentEdit() {
  const [configuration, setConfiguration] = useState<AgentConfiguration>(AgentConfigurationManager.getConfiguration());

  useEffect(() => {
    const currentMode = AgentConfigurationManager.getConfiguration();
    setConfiguration(currentMode);
  }, []);

  const handleModeChange = (value: string) => {
    const newConfig = { ...configuration, mode: value as AgentMode };
    setConfiguration(newConfig);
    AgentConfigurationManager.setConfiguration(newConfig);
  };

  return (
    <div className="h-full flex flex-col">
      <div className="flex-1 p-6">
        <div className="grid gap-6">
          <div className="grid grid-cols-[200px_300px_1fr] gap-8 items-start">
            <div className="space-y-1 pt-2">
              <Label>
                Agent Mode
              </Label>
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
                  <DropdownMenuRadioGroup
                    value={configuration.mode}
                    onValueChange={handleModeChange}
                  >
                    <DropdownMenuRadioItem value="v2">V2 (Skill-based)</DropdownMenuRadioItem>
                    <DropdownMenuRadioItem value="legacy">V1 (Legacy)</DropdownMenuRadioItem>
                  </DropdownMenuRadioGroup>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
            <div className="text-sm text-muted-foreground pt-2">
              Select which agent architecture to use for chat interactions.
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
