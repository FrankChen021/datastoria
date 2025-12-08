import { Badge } from "@/components/ui/badge";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Api } from "@/lib/api";
import { useConnection } from "@/lib/connection/ConnectionContext";
import { cn } from "@/lib/utils";
import { Check } from "lucide-react";
import { useEffect, useState } from "react";
import { CommandItemCount, HighlightableCommandItem } from "../cmdk-extension/cmdk-extension";

// Shared badge component for schema tree nodes
export function SchemaTreeBadge({ children }: { children: React.ReactNode }) {
  return <span className="ml-2 text-[10px] text-muted-foreground">{children}</span>;
}

interface HostInfo {
  name: string;
  address: string;
  shard: number;
  replica: number;
}

export function HostSelector({ clusterName, displayName }: { clusterName: string; displayName: string }) {
  const { selectedConnection } = useConnection();
  const [isOpen, setIsOpen] = useState(false);
  const [data, setData] = useState<HostInfo[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen && data.length === 0 && !loading && selectedConnection) {
      setLoading(true);
      const api = Api.create(selectedConnection);
      api.executeSQL(
        {
          sql: `
SELECT 
  host_name AS name, 
  host_address AS address, 
  shard_num AS shard, 
  replica_num AS replica 
FROM system.clusters 
WHERE cluster ='${clusterName}'
ORDER BY shard, replica`,
          params: { default_format: "JSON" },
        },
        (response) => {
          try {
            setData((response.data.data || []) as HostInfo[]);
            setError(null);
          } catch {
            setError("Failed to parse response");
          }
        },
        (err) => {
          setError(err.errorMessage || "Failed to load cluster info");
        },
        () => {
          setLoading(false);
        }
      );
    }
  }, [isOpen, selectedConnection, clusterName, data.length, loading]);

  return (
    <Popover open={isOpen} onOpenChange={setIsOpen}>
      <PopoverTrigger>
        <span
          className="cursor-pointer hover:underline"
          onClick={() => {
            setIsOpen(true);
          }}
        >
          {displayName}
        </span>
      </PopoverTrigger>
      <PopoverContent className="w-[500px] p-0" align="start">
        <Command className="[&_[cmdk-group-heading]]:px-2 [&_[cmdk-group-heading]]:font-medium [&_[cmdk-group-heading]]:text-muted-foreground [&_[cmdk-group]:not([hidden])_~[cmdk-group]]:pt-0 [&_[cmdk-group]]:px-2 [&_[cmdk-input-wrapper]_svg]:h-5 [&_[cmdk-input-wrapper]_svg]:w-5 [&_[cmdk-input]]:h-12 [&_[cmdk-item]]:px-2 [&_[cmdk-item]]:py-3 [&_[cmdk-item]]:!rounded-none [&_[cmdk-item]_svg]:h-5 [&_[cmdk-item]_svg]:w-5">
          <CommandInput placeholder="Search hosts..." className="!h-10" />
          <CommandItemCount />
          <CommandList className="!rounded-none max-h-[400px] overflow-y-auto overflow-x-hidden">
            <CommandEmpty className="p-3 text-center">{error || "No hosts found."}</CommandEmpty>
            {loading ? (
              <div className="p-4 text-sm text-center text-muted-foreground">Loading...</div>
            ) : (
              data.length > 0 && (
                <CommandGroup className="!py-1 !px-1 !rounded-none">
                  {data.map((node, idx) => {
                    const isSelected = node.name === displayName || node.address === displayName;
                    return (
                      <CommandItem
                        key={idx}
                        value={`${node.name}`}
                        className={cn(
                          "flex items-center !rounded-none cursor-pointer !py-1 mb-1 transition-colors",
                          isSelected && "bg-muted/50"
                        )}
                        onSelect={() => {
                          // TODO: Set the host as selected and reload tree from this host
                          setIsOpen(false);
                        }}
                      >
                        <div className="flex items-center gap-2 w-full min-w-0">
                          <div className="w-4 shrink-0 flex items-center justify-center">
                            {isSelected && <Check className="h-3 w-3 text-primary" />}
                          </div>
                          <div className="flex flex-col min-w-0 flex-1 overflow-hidden">
                            <span className={cn("text-sm truncate block", isSelected && "text-primary font-medium")}>
                              <HighlightableCommandItem text={node.name} />
                            </span>
                            <span className="text-xs text-muted-foreground truncate block">{node.address}</span>
                          </div>
                          <div className="flex items-center gap-1 shrink-0">
                            <Badge variant="secondary" className="rounded-none px-1 whitespace-nowrap">
                              Shard {String(node.shard).padStart(2, "0")}
                            </Badge>
                            <Badge variant="secondary" className="rounded-none px-1 whitespace-nowrap">
                              Replica {String(node.replica).padStart(2, "0")}
                            </Badge>
                          </div>
                        </div>
                      </CommandItem>
                    );
                  })}
                </CommandGroup>
              )
            )}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
