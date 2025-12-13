import { HighlightableCommandItem } from "@/components/shared/cmdk/cmdk-extension";
import { Button } from "@/components/ui/button";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import type { ConnectionConfig } from "@/lib/connection/connection-config";
import { useConnection } from "@/lib/connection/connection-context";
import { ConnectionManager } from "@/lib/connection/connection-manager";
import { cn } from "@/lib/utils";
import { Check, Pencil, Plus } from "lucide-react";
import type { ReactNode } from "react";
import { useEffect, useState } from "react";
import { Input } from "../ui/input";
import { Separator } from "../ui/separator";
import { showConnectionEditDialog } from "./connection-edit-dialog";

interface ConnectionSelectorProps {
  /**
   * Custom trigger element. If provided, this will be used instead of the default Input field.
   * This is useful for sidebar contexts where you want to use a SidebarMenuButton.
   */
  trigger?: ReactNode;
  /**
   * Custom className for the popover content.
   */
  popoverClassName?: string;
  /**
   * Side offset for the popover. Defaults to 0 for nav-bar, 5 for sidebar.
   */
  sideOffset?: number;
  /**
   * Side of the popover. Defaults to "bottom" for nav-bar, "right" for sidebar.
   */
  side?: "top" | "right" | "bottom" | "left";
  /**
   * Callback that receives the popover open state. Useful for disabling tooltips when popover is open.
   */
  onOpenChange?: (open: boolean) => void;
}

export function ConnectionSelector(
  {
    trigger,
    popoverClassName = "w-[400px] p-0",
    sideOffset,
    side,
    onOpenChange,
  }: ConnectionSelectorProps = {} as ConnectionSelectorProps
) {
  const { connection, switchConnection } = useConnection();
  const [isCommandOpen, setIsCommandOpen] = useState(false);

  // Handle open state changes
  const handleOpenChange = (open: boolean) => {
    setIsCommandOpen(open);
    onOpenChange?.(open);
  };
  const [connections, setConnections] = useState<ConnectionConfig[]>([]);

  // Load connections
  const reloadConnections = () => {
    const manager = ConnectionManager.getInstance();
    setConnections(manager.getConnections());
  };

  useEffect(() => {
    reloadConnections();
  }, []); // Load connections on mount

  // Reload connections when popover opens
  useEffect(() => {
    if (isCommandOpen) {
      reloadConnections();
    }
  }, [isCommandOpen]);

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
    setIsCommandOpen(false);
  };

  const handleConnectionSelect = (connConfig: ConnectionConfig) => {
    // switchConnection expects ConnectionConfig, which we have from the list
    switchConnection(connConfig);
    setIsCommandOpen(false);
  };

  const handleEditConnection = (connConfig?: ConnectionConfig) => {
    let connectionToEdit: ConnectionConfig | undefined = connConfig;

    // If no connection passed, try to edit the currently selected one
    if (!connectionToEdit && connection) {
      // Find the actual Connection object from the manager/list to ensure we have all properties (like editable)
      const manager = ConnectionManager.getInstance();
      // We can use the connections list if loaded, or fetch from manager
      // connection.name is available on Connection class
      connectionToEdit = manager.getConnections().find(c => c.name === connection.name);
    }

    if (connectionToEdit) {
      showConnectionEditDialog({
        connection: connectionToEdit,
        onSave: (savedConnection) => {
          // Reload connections after save
          reloadConnections();
          // Update the selected connection if it was the one being edited or if it was renamed
          // We check name against the currently active connection
          if (!connection || connection.name === connectionToEdit!.name) {
            switchConnection(savedConnection);
          }
        },
        onDelete: () => {
          // Reload connections after delete
          const updatedConnections = ConnectionManager.getInstance().getConnections();
          setConnections(updatedConnections);
          // Clear selected connection if it was the one deleted, or select the first available
          if (connection?.name === connectionToEdit!.name) {
            if (updatedConnections.length > 0) {
              switchConnection(updatedConnections[0]);
            } else {
              switchConnection(null);
            }
          }
        },
      });
      setIsCommandOpen(false);
    }
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

  // Default side offset
  const defaultSideOffset = trigger !== undefined ? 5 : 0;

  // Render trigger - either custom trigger or default Input field
  const renderTrigger = () => {
    if (trigger) {
      return trigger;
    }

    return (
      <div className="relative">
        <Input
          className="w-[350px] h-9 pr-9 cursor-pointer"
          title="Edit Connection"
          value={connection ? `${connection.name}@${connection.url}` : ''}
          readOnly
        />
        <Button
          variant="ghost"
          size="icon"
          className="absolute right-0 top-0 h-9 w-9 rounded-l-none"
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            if (connection) {
              // Trigger edit logic which will resolve the connection object
              handleEditConnection();
            }
          }}
          title="Edit Connection"
        >
          <Pencil className="h-4 w-4" />
        </Button>
      </div>
    );
  };

  return (
    <>
      <div className="flex items-center gap-1">
        <Popover open={isCommandOpen} onOpenChange={handleOpenChange}>
          <PopoverTrigger asChild>{renderTrigger()}</PopoverTrigger>
          <PopoverContent
            className={popoverClassName}
            align="start"
            sideOffset={sideOffset ?? defaultSideOffset}
            side={side}
          >
            <Command
              className="[&_[cmdk-group-heading]]:px-2 [&_[cmdk-group-heading]]:font-medium [&_[cmdk-group-heading]]:text-muted-foreground [&_[cmdk-group]:not([hidden])_~[cmdk-group]]:pt-0 [&_[cmdk-group]]:px-2 [&_[cmdk-input-wrapper]_svg]:h-5 [&_[cmdk-input-wrapper]_svg]:w-5 [&_[cmdk-input]]:h-12 [&_[cmdk-item]]:px-2 [&_[cmdk-item]]:py-3 [&_[cmdk-item]]:!rounded-none [&_[cmdk-item]_svg]:h-5 [&_[cmdk-item]_svg]:w-5"
              filter={(value: string, search: string) => {
                if (value.toLowerCase().includes(search.toLowerCase())) return 1;
                return 0;
              }}
            >
              <CommandInput placeholder="Search connections..." className="!h-10" />
              <CommandList className="!rounded-none">
                <CommandEmpty className="p-3 text-center">No connections found</CommandEmpty>
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
                            "flex items-center justify-between !rounded-none cursor-pointer !py-1 mb-1 transition-colors hover:bg-muted",
                            isSelected && "bg-muted/50"
                          )}
                          style={{ borderRadius: 0 }}
                        >
                          <div className="flex items-center gap-2 flex-1 min-w-0">
                            <div className="w-4 shrink-0 flex items-center justify-center">
                              {isSelected && <Check className="h-3 w-3 text-primary" />}
                            </div>
                            <div className="flex-1 min-w-0">
                              <div className={cn("font-medium truncate", isSelected && "text-primary")}>
                                <HighlightableCommandItem text={conn.name} />
                              </div>
                              <div
                                className={cn(
                                  "text-xs truncate",
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
                            className="h-6 w-6 p-0 flex items-center justify-center bg-transparent hover:bg-muted hover:ring-2 hover:ring-foreground/20 shrink-0 [&_svg]:!size-3"
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
              <Button variant="ghost" className="w-full justify-start rounded-none h-10" onClick={handleOpenAddDialog}>
                <Plus className="h-4 w-4 mr-2" />
                Add Connection
              </Button>
            </div>
          </PopoverContent>
        </Popover>
      </div>
    </>
  );
}

