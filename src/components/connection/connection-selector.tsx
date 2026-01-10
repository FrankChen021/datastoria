import { useConnection } from "@/components/connection/connection-context";
import { HighlightableCommandItem } from "@/components/shared/cmdk/cmdk-extension";
import { Button } from "@/components/ui/button";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { Separator } from "@/components/ui/separator";
import type { ConnectionConfig } from "@/lib/connection/connection-config";
import { ConnectionManager } from "@/lib/connection/connection-manager";
import { cn } from "@/lib/utils";
import { Check, Pencil, Plus } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { showConnectionEditDialog } from "./connection-edit-component";

interface ConnectionSelectorProps {
  /**
   * Whether the selector is currently open
   */
  isOpen: boolean;
  /**
   * Callback to close the selector
   */
  onClose: () => void;
  /**
   * Optional className for the Command component
   */
  className?: string;
}

/**
 * Shared connection selector component.
 * This component contains the cmdk implementation that's shared between
 * the popover and dialog variants. It manages its own state and handlers.
 */
export function ConnectionSelector({ isOpen, onClose, className }: ConnectionSelectorProps) {
  const { connection, switchConnection } = useConnection();
  const [connections, setConnections] = useState<ConnectionConfig[]>([]);
  const inputRef = useRef<HTMLInputElement>(null);

  // Load connections
  const reloadConnections = () => {
    const manager = ConnectionManager.getInstance();
    setConnections(manager.getConnections());
  };

  useEffect(() => {
    reloadConnections();
  }, []); // Load connections on mount

  // Reload connections when selector opens and focus input
  useEffect(() => {
    if (isOpen) {
      reloadConnections();
      // Focus the input after a short delay to ensure it's rendered
      setTimeout(() => {
        inputRef.current?.focus();
      }, 0);
    }
  }, [isOpen]);

  const handleOpenAddDialog = () => {
    showConnectionEditDialog({
      connection: null,
      onSave: (savedConnection) => {
        // Reload connections after save
        reloadConnections();
        // Ensure the newly saved connection is selected in the context
        switchConnection(savedConnection);
      },
    });
    onClose();
  };

  const handleConnectionSelect = (connConfig: ConnectionConfig) => {
    // switchConnection expects ConnectionConfig, which we have from the list
    switchConnection(connConfig);
    onClose();
  };

  const handleEditConnection = (connConfig: ConnectionConfig) => {
    showConnectionEditDialog({
      connection: connConfig,
      onSave: (savedConnection) => {
        // Reload connections after save
        reloadConnections();
        // Update the selected connection if it was the one being edited or if it was renamed
        // We check name against the currently active connection
        if (!connection || connection.name === connConfig.name) {
          switchConnection(savedConnection);
        }
      },
      onDelete: () => {
        // Reload connections after delete
        const updatedConnections = ConnectionManager.getInstance().getConnections();
        setConnections(updatedConnections);
        // Clear selected connection if it was the one deleted, or select the first available
        if (connection?.name === connConfig.name) {
          if (updatedConnections.length > 0) {
            switchConnection(updatedConnections[0]);
          } else {
            switchConnection(null);
          }
        }
      },
    });
    onClose();
  };

  // Get connection display text for command items
  const getConnectionItemText = (conn: ConnectionConfig) => {
    try {
      const hostname = new URL(conn.url).hostname;
      return `${conn.user}@${hostname}`;
    } catch {
      return conn.url;
    }
  };

  return (
    <>
      <Command
        className={cn(
          "[&_[cmdk-group-heading]]:px-2 [&_[cmdk-group-heading]]:font-medium [&_[cmdk-group-heading]]:text-muted-foreground [&_[cmdk-group]:not([hidden])_~[cmdk-group]]:pt-0 [&_[cmdk-group]]:px-1 [&_[cmdk-input-wrapper]_svg]:h-4 [&_[cmdk-input-wrapper]_svg]:w-4 [&_[cmdk-input]]:h-9 [&_[cmdk-item]]:px-2 [&_[cmdk-item]]:py-1.5 [&_[cmdk-item]]:!rounded-none [&_[cmdk-item]_svg]:h-4 [&_[cmdk-item]_svg]:w-4",
          className
        )}
        filter={(value: string, search: string) => {
          if (value.toLowerCase().includes(search.toLowerCase())) return 1;
          return 0;
        }}
      >
        <CommandInput ref={inputRef} placeholder="Search connections..." className="!h-9 text-sm" />
        <CommandList className="!rounded-none max-h-[300px]">
          <CommandEmpty className="p-2 text-center text-sm">No connections found</CommandEmpty>
          {connections.length > 0 && (
            <CommandGroup className="!py-1 !px-1 !rounded-none">
              {connections.map((conn) => {
                const isSelected = connection?.name === conn.name;
                return (
                  <CommandItem
                    key={conn.name}
                    value={conn.name}
                    onSelect={() => handleConnectionSelect(conn)}
                    className={cn(
                      "flex items-center justify-between !rounded-none cursor-pointer !py-1 !px-2 mb-0.5 transition-colors hover:bg-muted",
                      isSelected && "bg-muted/50"
                    )}
                    style={{ borderRadius: 0 }}
                  >
                    <div className="flex items-center gap-1.5 flex-1 min-w-0">
                      <div className="w-3 shrink-0 flex items-center justify-center">
                        {isSelected && <Check className="h-3 w-3 text-primary" />}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div
                          className={cn(
                            "text-xs font-medium truncate",
                            isSelected && "text-primary"
                          )}
                        >
                          <HighlightableCommandItem text={conn.name} />
                        </div>
                        <div
                          className={cn(
                            "text-[10px] truncate leading-tight",
                            isSelected ? "text-primary/80" : "text-muted-foreground"
                          )}
                        >
                          {getConnectionItemText(conn)}
                        </div>
                      </div>
                    </div>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-5 w-5 p-0 flex items-center justify-center bg-transparent hover:bg-muted hover:ring-1 hover:ring-foreground/20 shrink-0 [&_svg]:!size-3"
                      onClick={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        handleEditConnection(conn);
                      }}
                      title="Edit Connection"
                    >
                      <Pencil />
                    </Button>
                  </CommandItem>
                );
              })}
            </CommandGroup>
          )}
        </CommandList>
      </Command>

      <Separator />
      <div className="p-1">
        <Button
          variant="ghost"
          className="w-full justify-start rounded-none h-8 text-sm"
          onClick={handleOpenAddDialog}
        >
          <Plus className="h-3.5 w-3.5 mr-2" />
          Add Connection
        </Button>
      </div>
    </>
  );
}
