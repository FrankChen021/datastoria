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
  const { connection, pendingConfig, isConnectionAvailable, switchConnection } = useConnection();
  const [connections, setConnections] = useState<ConnectionConfig[]>([]);
  const inputRef = useRef<HTMLInputElement>(null);

  // Determine which connection to highlight:
  // - If there's a pending config and connection is not available, highlight the pending (failed) connection
  // - Otherwise, highlight the active connection
  const highlightedConnectionName =
    pendingConfig && !isConnectionAvailable ? pendingConfig.name : connection?.name;

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
      // Focus the input after render using requestAnimationFrame
      if (inputRef.current) {
        requestAnimationFrame(() => {
          inputRef.current?.focus();
        });
      }
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

  const handleConnectionSelect = (newConnection: ConnectionConfig) => {
    // Switch if it's different from current connection OR different from pending config
    // This allows switching even when initialization failed (pendingConfig exists but connection is old)
    const isDifferentFromCurrent = newConnection.name !== connection?.name;
    const isDifferentFromPending = newConnection.name !== pendingConfig?.name;

    if (isDifferentFromCurrent || isDifferentFromPending) {
      switchConnection(newConnection);
    }
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
        value={highlightedConnectionName}
      >
        <CommandInput ref={inputRef} placeholder="Search connections..." className="!h-9 text-sm" />
        <CommandList className="!rounded-none max-h-[300px]">
          <CommandEmpty className="p-2 text-center text-sm">No connections found</CommandEmpty>
          {connections.length > 0 && (
            <CommandGroup className="!py-1 !px-1 !rounded-none">
              {connections.map((conn) => {
                const isSelected = highlightedConnectionName === conn.name;
                return (
                  <CommandItem
                    key={conn.name}
                    value={conn.name}
                    onSelect={() => handleConnectionSelect(conn)}
                    className={cn(
                      "flex items-center justify-between !rounded-none cursor-pointer !py-1 !px-2 mb-0.5 transition-colors hover:bg-muted group",
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
                            "text-sm font-medium truncate",
                            isSelected && "text-primary"
                          )}
                        >
                          <HighlightableCommandItem text={conn.name} />
                        </div>
                        <div
                          className={cn(
                            "text-xs truncate leading-tight",
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
                      className={cn(
                        "h-5 w-5 text-muted-foreground",
                        "opacity-0 group-hover:opacity-100"
                      )}
                      onClick={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        handleEditConnection(conn);
                      }}
                      title="Edit Connection"
                    >
                      <Pencil className="!h-2.5 !w-2.5" />
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
