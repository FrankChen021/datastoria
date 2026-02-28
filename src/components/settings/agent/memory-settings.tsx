"use client";

import { MemoryPanel } from "@/components/chat/memory/memory-panel";
import {
  AgentConfigurationManager,
  type AgentConfiguration,
  type MemoryStorageMode,
} from "@/components/settings/agent/agent-manager";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { Switch } from "@/components/ui/switch";
import { useEffect, useState } from "react";

export function MemorySettingsEdit() {
  const [configuration, setConfiguration] = useState<AgentConfiguration>(
    AgentConfigurationManager.getConfiguration()
  );
  const [panelOpen, setPanelOpen] = useState(false);

  useEffect(() => {
    setConfiguration(AgentConfigurationManager.getConfiguration());
  }, []);

  const updateConfiguration = (next: Partial<AgentConfiguration>) => {
    const merged = { ...configuration, ...next };
    setConfiguration(merged);
    AgentConfigurationManager.setConfiguration(merged);
  };

  return (
    <>
      <div className="h-full flex flex-col">
        <div className="px-4 py-2 grid gap-2">
          <div className="grid grid-cols-[200px_300px_1fr] gap-8 items-start">
            <div className="space-y-1 pt-2">
              <Label>Enable Memory</Label>
            </div>
            <div className="flex items-center h-10">
              <Switch
                checked={configuration.memoryEnabled ?? true}
                onCheckedChange={(checked) => updateConfiguration({ memoryEnabled: checked })}
              />
            </div>
            <div className="text-sm text-muted-foreground pt-2">
              Allow the agent to store and reuse durable preferences across chats.
            </div>
          </div>

          <Separator />

          <div className="grid grid-cols-[200px_300px_1fr] gap-8 items-start">
            <div className="space-y-1 pt-2">
              <Label htmlFor="memory-storage-mode">Storage Mode</Label>
            </div>
            <div className="flex items-center h-10">
              <select
                id="memory-storage-mode"
                className="h-10 w-full rounded-md border bg-background px-3 text-sm"
                value={configuration.memoryStorageMode ?? "local"}
                onChange={(event) =>
                  updateConfiguration({
                    memoryStorageMode: event.target.value as MemoryStorageMode,
                  })
                }
              >
                <option value="local">Local (IndexedDB)</option>
                <option value="remote" disabled>
                  Remote (Phase 2)
                </option>
              </select>
            </div>
            <div className="text-sm text-muted-foreground pt-2">
              Phase 0-1 implement local durable memory. Remote sync remains Phase 2.
            </div>
          </div>

          <Separator />

          <div className="grid grid-cols-[200px_300px_1fr] gap-8 items-start">
            <div className="space-y-1 pt-2">
              <Label>Auto-save Preferences</Label>
            </div>
            <div className="flex items-center h-10">
              <Switch
                checked={configuration.autoSavePreferences ?? false}
                onCheckedChange={(checked) => updateConfiguration({ autoSavePreferences: checked })}
              />
            </div>
            <div className="text-sm text-muted-foreground pt-2">
              When disabled, strong preference candidates appear as confirmation banners first.
            </div>
          </div>

          <Separator />

          <div className="grid grid-cols-[200px_300px_1fr] gap-8 items-start">
            <div className="space-y-1 pt-2">
              <Label>Auto-save Findings</Label>
            </div>
            <div className="flex items-center h-10">
              <Switch
                checked={configuration.autoSaveFindings ?? false}
                onCheckedChange={(checked) => updateConfiguration({ autoSaveFindings: checked })}
                disabled
              />
            </div>
            <div className="text-sm text-muted-foreground pt-2">
              Findings and remote storage are Phase 2+ work and stay disabled for now.
            </div>
          </div>

          <Separator />

          <div className="grid grid-cols-[200px_300px_1fr] gap-8 items-start">
            <div className="space-y-1 pt-2">
              <Label>Manage Memories</Label>
            </div>
            <div className="flex items-center h-10">
              <Button variant="outline" onClick={() => setPanelOpen(true)}>
                Open Memory Manager
              </Button>
            </div>
            <div className="text-sm text-muted-foreground pt-2">
              View, edit, pin, archive, and delete the durable memories currently stored for this
              browser profile.
            </div>
          </div>
        </div>
      </div>

      <MemoryPanel open={panelOpen} onOpenChange={setPanelOpen} />
    </>
  );
}
