import { Button } from "@/components/ui/button";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import type { Connection } from "@/lib/connection/Connection";
import { useConnection } from "@/lib/connection/ConnectionContext";
import { ConnectionManager } from "@/lib/connection/ConnectionManager";
import { cn } from "@/lib/utils";
import { Check, Pencil, Plus } from "lucide-react";
import type { ReactNode } from "react";
import { useEffect, useState } from "react";
import { Input } from "../ui/input";
import { Separator } from "../ui/separator";
import { showConnectionEditDialog } from "./connection-edit-dialog";
import { HighlightableCommandItem } from "../cmdk-extension/cmdk-extension";

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
}

export function ConnectionSelector(
  {
    trigger,
    popoverClassName = "w-[400px] p-0",
    sideOffset,
    side,
  }: ConnectionSelectorProps = {} as ConnectionSelectorProps
) {
  const { selectedConnection, setSelectedConnection } = useConnection();
  const [isCommandOpen, setIsCommandOpen] = useState(false);
  const [connections, setConnections] = useState<Connection[]>([]);

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
          setSelectedConnection(savedConnection);
        },
    });
    setIsCommandOpen(false);
  };

  const handleConnectionSelect = (connection: Connection) => {
    setSelectedConnection(connection);
    setIsCommandOpen(false);
  };

  const handleEditConnection = (connection?: Connection) => {
    const connectionToEdit = connection || selectedConnection;
    if (connectionToEdit) {
      showConnectionEditDialog({
        connection: connectionToEdit,
        onSave: (savedConnection) => {
          // Reload connections after save
          reloadConnections();
          // Update the selected connection if it was the one being edited or if it was renamed
          if (!selectedConnection || selectedConnection.name === connectionToEdit.name) {
            setSelectedConnection(savedConnection);
          }
        },
        onDelete: () => {
          // Reload connections after delete
          const updatedConnections = ConnectionManager.getInstance().getConnections();
          setConnections(updatedConnections);
          // Clear selected connection if it was the one deleted, or select the first available
          if (selectedConnection?.name === connectionToEdit.name) {
            if (updatedConnections.length > 0) {
              setSelectedConnection(updatedConnections[0]);
            } else {
              setSelectedConnection(null);
            }
          }
        },
      });
      setIsCommandOpen(false);
    }
  };

  // Get connection display text for command items
  const getConnectionItemText = (conn: Connection) => {
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
          value={`${selectedConnection?.name}@${selectedConnection!.url}`}
          readOnly
        />
        <Button
          variant="ghost"
          size="icon"
          className="absolute right-0 top-0 h-9 w-9 rounded-l-none"
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            if (selectedConnection) {
              showConnectionEditDialog({
                connection: selectedConnection,
                onSave: () => {
                  reloadConnections();
                },
                onDelete: () => {
                  const updatedConnections = ConnectionManager.getInstance().getConnections();
                  setConnections(updatedConnections);
                  // Select the first available connection or clear selection
                  if (updatedConnections.length > 0) {
                    setSelectedConnection(updatedConnections[0]);
                  } else {
                    setSelectedConnection(null);
                  }
                },
              });
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
        <Popover open={isCommandOpen} onOpenChange={setIsCommandOpen}>
          <PopoverTrigger asChild>{renderTrigger()}</PopoverTrigger>
          <PopoverContent
            className={popoverClassName}
            align="start"
            sideOffset={sideOffset ?? defaultSideOffset}
            side={side}
          >
            <Command
              className="[&_[cmdk-group-heading]]:px-2 [&_[cmdk-group-heading]]:font-medium [&_[cmdk-group-heading]]:text-muted-foreground [&_[cmdk-group]:not([hidden])_~[cmdk-group]]:pt-0 [&_[cmdk-group]]:px-2 [&_[cmdk-input-wrapper]_svg]:h-5 [&_[cmdk-input-wrapper]_svg]:w-5 [&_[cmdk-input]]:h-12 [&_[cmdk-item]]:px-2 [&_[cmdk-item]]:py-3 [&_[cmdk-item]]:!rounded-none [&_[cmdk-item]_svg]:h-5 [&_[cmdk-item]_svg]:w-5"
              filter={(value, search) => {
                // Default filtering for items
                if (!search) return 1;
                const lowerSearch = search.toLowerCase();
                const lowerValue = value.toLowerCase();
                return lowerValue.includes(lowerSearch) ? 1 : 0;
              }}
            >
              <CommandInput placeholder="Search connections..." className="!h-10" />
              <CommandList className="!rounded-none">
                <CommandEmpty className="p-3 text-center">No connections found</CommandEmpty>
                {connections.length > 0 && (
                  <CommandGroup className="!py-1 !px-1 !rounded-none">
                    {connections.map((conn) => {
                      const isSelected = selectedConnection?.name === conn.name;
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
