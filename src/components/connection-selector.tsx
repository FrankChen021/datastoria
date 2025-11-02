import { Button } from "@/components/ui/button";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
} from "@/components/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import type { Connection } from "@/lib/connection/Connection";
import { useConnection } from "@/lib/connection/ConnectionContext";
import { ConnectionManager } from "@/lib/connection/ConnectionManager";
import { cn } from "@/lib/utils";
import { ChevronDown, Edit, Plus } from "lucide-react";
import { useEffect, useState } from "react";
import { ConnectionEditDialog } from "./connection-edit-dialog";

export function ConnectionSelector() {
  const { selectedConnection, setSelectedConnection } = useConnection();
  const [editingConnection, setEditingConnection] = useState<Connection | null>(null);
  const [isShowEditConnectionDlg, setShowEditConnectionDlg] = useState(false);
  const [isCommandOpen, setIsCommandOpen] = useState(false);
  const [connections, setConnections] = useState<Connection[]>([]);

  // Load connections
  useEffect(() => {
    const manager = ConnectionManager.getInstance();
    setConnections(manager.getConnections());
  }, [isShowEditConnectionDlg]); // Reload when dialog closes

  const handleOpenAddDialog = () => {
    setEditingConnection(null);
    setShowEditConnectionDlg(true);
    setIsCommandOpen(false);
  };

  const handleOpenEditDialog = () => {
    setEditingConnection(selectedConnection);
    setShowEditConnectionDlg(true);
  };

  const handleDialogClose = () => {
    setShowEditConnectionDlg(false);
    // Reload connections after dialog closes
    const manager = ConnectionManager.getInstance();
    setConnections(manager.getConnections());
  };

  const handleConnectionSelect = (connection: Connection) => {
    setSelectedConnection(connection);
    setIsCommandOpen(false);
  };

  // Get connection display text
  const getConnectionText = () => {
    if (selectedConnection) {
      try {
        const hostname = new URL(selectedConnection.url).hostname;
        return `${selectedConnection.name} (${selectedConnection.user}@${hostname})`;
      } catch {
        return selectedConnection.name;
      }
    }
    return "Connection";
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

  return (
    <>
      <div className="flex items-center gap-1">
        <Popover open={isCommandOpen} onOpenChange={setIsCommandOpen}>
          <PopoverTrigger asChild>
            <Button variant="outline" size="sm" className="max-w-[300px]">
              <span className="truncate">{getConnectionText()}</span>
              <ChevronDown className="h-4 w-4 ml-2 shrink-0" />
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-[300px] p-0" align="start">
            <Command
              className="[&_[cmdk-group-heading]]:px-2 [&_[cmdk-group-heading]]:font-medium [&_[cmdk-group-heading]]:text-muted-foreground [&_[cmdk-group]:not([hidden])_~[cmdk-group]]:pt-0 [&_[cmdk-group]]:px-2 [&_[cmdk-input-wrapper]_svg]:h-5 [&_[cmdk-input-wrapper]_svg]:w-5 [&_[cmdk-input]]:h-12 [&_[cmdk-item]]:px-2 [&_[cmdk-item]]:py-3 [&_[cmdk-item]_svg]:h-5 [&_[cmdk-item]_svg]:w-5"
              filter={(value, search) => {
                // Always include "Add Connection" regardless of search
                if (value.includes("add-connection-marker")) {
                  return 1;
                }
                // Default filtering for other items
                if (!search) return 1;
                const lowerSearch = search.toLowerCase();
                const lowerValue = value.toLowerCase();
                return lowerValue.includes(lowerSearch) ? 1 : 0;
              }}
            >
              <CommandInput placeholder="Search connections..." />
              <CommandList>
                <CommandEmpty>No connections found.</CommandEmpty>
                {connections.length > 0 && (
                  <>
                    <CommandGroup heading="Connections">
                      {connections.map((conn) => {
                        const isSelected = selectedConnection?.name === conn.name;
                        return (
                          <CommandItem
                            key={conn.name}
                            value={`${conn.name} ${conn.url} ${conn.user}`}
                            onSelect={() => handleConnectionSelect(conn)}
                            className={cn("flex items-center justify-between", isSelected && "bg-accent")}
                          >
                            <div className="flex-1 min-w-0">
                              <div className="font-medium truncate">{conn.name}</div>
                              <div className="text-xs text-muted-foreground truncate">
                                {getConnectionItemText(conn)}
                              </div>
                            </div>
                            {isSelected && <span className="ml-2 text-xs text-primary">✓</span>}
                          </CommandItem>
                        );
                      })}
                    </CommandGroup>
                  </>
                )}
                <CommandGroup>
                  <CommandSeparator />
                  <CommandItem value="add-connection-marker Add Connection" onSelect={handleOpenAddDialog}>
                    <Plus className="h-4 w-4 mr-2" />
                    Add Connection
                  </CommandItem>
                </CommandGroup>
              </CommandList>
            </Command>
          </PopoverContent>
        </Popover>
        {selectedConnection && (
          <Button
            variant="ghost"
            size="icon"
            className="h-9 w-9"
            onClick={handleOpenEditDialog}
            title="Edit Connection"
          >
            <Edit className="h-4 w-4" />
          </Button>
        )}
      </div>

      {isShowEditConnectionDlg && <ConnectionEditDialog connection={editingConnection} onClose={handleDialogClose} />}
    </>
  );
}
