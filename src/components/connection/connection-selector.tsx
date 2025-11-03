import { Button } from "@/components/ui/button";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import type { Connection } from "@/lib/connection/Connection";
import { useConnection } from "@/lib/connection/ConnectionContext";
import { ConnectionManager } from "@/lib/connection/ConnectionManager";
import { TextHighlighter } from "@/lib/text-highlighter";
import { cn } from "@/lib/utils";
import { useCommandState } from "cmdk";
import { Pencil, Plus } from "lucide-react";
import { useEffect, useState } from "react";
import { Input } from "../ui/input";
import { Separator } from "../ui/separator";
import { showConnectionEditDialog } from "./connection-edit-dialog";

interface HighlightItemProps {
  text: string;
}

export const HighlightableCommandItem: React.FC<HighlightItemProps> = ({ text }) => {
  const search = useCommandState((state) => state.search);
  return TextHighlighter.highlight(text, search, "text-yellow-500");
};

export function ConnectionSelector() {
  const { selectedConnection, setSelectedConnection } = useConnection();
  const [isCommandOpen, setIsCommandOpen] = useState(false);
  const [connections, setConnections] = useState<Connection[]>([]);

  // Load connections
  useEffect(() => {
    const manager = ConnectionManager.getInstance();
    setConnections(manager.getConnections());
  }, []); // Load connections on mount

  const handleOpenAddDialog = () => {
    showConnectionEditDialog({
      connection: null,
      onSave: (savedConnection) => {
        // Reload connections after save
        const manager = ConnectionManager.getInstance();
        setConnections(manager.getConnections());
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
            {/* <Button variant="outline" size="sm" className="w-[200px] justify-between">
              <span className="truncate text-left">{selectedConnection?.name}</span>
              <ChevronDown className="h-4 w-4 shrink-0" />
            </Button> */}
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
                  showConnectionEditDialog({ connection: selectedConnection, onSave: () => {} });
                }}
                title="Edit Connection"
              >
                <Pencil className="h-4 w-4" />
              </Button>
            </div>
          </PopoverTrigger>
          <PopoverContent className="w-[300px] p-0" align="start" sideOffset={0}>
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
                <CommandEmpty>No connections found.</CommandEmpty>
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
                            "flex items-center justify-between !rounded-none cursor-pointer !py-1 mb-1",
                            isSelected && "bg-primary/10"
                          )}
                          style={{ borderRadius: 0 }}
                        >
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
                          {isSelected && <span className="ml-2 text-xs text-primary">✓</span>}
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
