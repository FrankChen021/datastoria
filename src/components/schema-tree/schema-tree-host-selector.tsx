import { HighlightableCommandItem } from "@/components/shared/cmdk/cmdk-extension";
import { Command, CommandEmpty, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";

import { useConnection } from "@/lib/connection/connection-context";
import { hostNameManager } from "@/lib/host-name-manager";
import { cn } from "@/lib/utils";
import { useCommandState } from "cmdk";
import { Check, Loader2 } from "lucide-react";
import { useEffect, useState } from "react";

// Shared badge component for schema tree nodes
export function SchemaTreeBadge({ children }: { children: React.ReactNode }) {
  return <span className="ml-2 text-[10px] text-muted-foreground">{children}</span>;
}

interface HostInfo {
  name: string;
  address: string;
  shard: number;
  replica: number;
  shortName: string;
}

interface SchemaTreeHostSelectorProps {
  clusterName: string;
  nodeName: string;
  onHostChange: (hostName: string) => void;
}

export const CommandItemTableHeader: React.FC<React.PropsWithChildren> = ({ children }) => {
  const filterCount = useCommandState((state: any) => state.filtered.count);

  return (
    <div className="grid grid-cols-[32px_28px_minmax(auto,200px)_100px_40px_40px] gap-1 px-2 py-2 text-[10px] font-medium text-muted-foreground bg-muted/30 border-b sticky top-0 z-10">
      <div className="flex items-center justify-center"></div>
      <div className="text-center">#</div>
      <div>{filterCount} Host(s)</div>
      <div>IP Address</div>
      <div className="text-center">Shard</div>
      <div className="text-center">Replica</div>
    </div>
  );
};

export function SchemaTreeHostSelector({ clusterName, nodeName, onHostChange }: SchemaTreeHostSelectorProps) {
  const { connection } = useConnection();
  const [isOpen, setIsOpen] = useState(false);
  const [data, setData] = useState<HostInfo[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [initialSelectedValue, setInitialSelectedValue] = useState<string | null>(null);

  // Strip the Kubernetes cluster suffix if present for shorter name
  const [initialSelectedHost, setInitialSelectedHost] = useState<string>(nodeName.replace(/\.svc\.cluster\.local$/, ""));

  useEffect(() => {
    setData([]);
    setLoading(false);
    setError(null);
  }, [connection, clusterName]);

  useEffect(() => {
    if (isOpen && data.length === 0 && !loading && connection && clusterName.length > 0) {
      setLoading(true);
      connection
        .query(
          `
SELECT 
  host_name AS name, 
  host_address AS address, 
  shard_num AS shard, 
  replica_num AS replica 
FROM system.clusters 
WHERE cluster ='${clusterName}'
ORDER BY shard, replica`,
          { default_format: "JSON" }
        )
        .response.then((response) => {
          try {
            const rawHosts = (response.data.data || []) as any[];
            const hosts: HostInfo[] = rawHosts.map((h) => ({
              ...h,
              shortName: hostNameManager.getShortHostname(h.name)
            }));

            setData(hosts);

            const initShortName = hostNameManager.getShortHostname(nodeName);
            const initSelectedHost = hosts.find((host) => host.shortName === initShortName);
            if (initSelectedHost) {
              // Value is name and address combined together so filter can be performed on both
              setInitialSelectedValue(initSelectedHost.shortName + " " + initSelectedHost.address);
              setInitialSelectedHost(initShortName!);
            }
            setError(null);
          } catch {
            setError("Failed to parse response");
          }
        })
        .catch((err) => {
          setError(err.message || "Failed to load cluster info");
        })
        .finally(() => {
          setLoading(false);
        });
    }
  }, [isOpen, connection, clusterName, data.length, loading, nodeName]);

  // If no cluster name (empty string), just render the display name without popover
  if (clusterName.length === 0) {
    return <span>{initialSelectedHost}</span>;
  }

  return (
    <Popover open={isOpen} onOpenChange={setIsOpen}>
      <PopoverTrigger>
        <span
          className="cursor-pointer hover:underline"
          onClick={() => {
            setIsOpen(true);
          }}
        >
          {initialSelectedHost}
        </span>
      </PopoverTrigger>
      <PopoverContent className="w-[450px] p-0" align="start">
        {loading ? (
          <div className="p-4 text-sm items-center flex gap-2 justify-center text-center text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />Loading...</div>
        ) : (
          <Command
            defaultValue={initialSelectedValue}
            filter={(value: string, search: string) => {
              if (value.toLowerCase().includes(search.toLowerCase())) return 1;
              return 0;
            }}
            className="[&_[cmdk-input]]:h-10"
          >
            <CommandInput placeholder="Search hosts..." className="!h-10" />

            <CommandItemTableHeader />
            <CommandList className="max-h-[400px] overflow-y-auto overflow-x-hidden">
              {error && <CommandEmpty className="p-3 text-center">{error}</CommandEmpty>}
              {data.length > 0 && (
                <>
                  <CommandEmpty className="p-2 text-xs text-center">No hosts found.</CommandEmpty>
                  {data.map((node, idx) => {
                    const isSelected = node.shortName === initialSelectedHost || node.address === nodeName;

                    return (
                      <CommandItem
                        key={idx}
                        value={`${node.shortName} ${node.address}`}
                        className={cn(
                          "grid grid-cols-[32px_28px_minmax(auto,200px)_100px_40px_40px] gap-1 px-2 !py-1.5 cursor-pointer transition-colors border-l-2 !rounded-none",
                          isSelected
                            ? "border-l-primary bg-primary/10"
                            : idx % 2 === 0
                              ? "border-l-transparent bg-muted/20"
                              : "border-l-transparent bg-transparent",
                          "hover:bg-muted/40"
                        )}
                        onSelect={() => {
                          // Only fire onHostChange if the selected host is different from current
                          if (node.name !== nodeName) {
                            setInitialSelectedHost(node.shortName);
                            // Notify parent component of host change
                            onHostChange(node.name);
                          }
                          setIsOpen(false);
                        }}
                      >
                        {/* Check icon column */}
                        <div className="flex items-center justify-center">
                          {isSelected && <Check className="h-3 w-3 text-primary" />}
                        </div>

                        {/* Index column */}
                        <div className="flex items-center justify-center text-[10px] text-muted-foreground">
                          {idx + 1}
                        </div>

                        {/* Hostname column */}
                        <div className="flex items-center min-w-0">
                          <span className={cn("text-xs truncate", isSelected && "text-primary font-medium")}>
                            <HighlightableCommandItem text={node.shortName} />
                          </span>
                        </div>

                        {/* IP Address column */}
                        <div className="flex items-center min-w-0">
                          <span className="text-[11px] text-muted-foreground truncate font-mono">
                            <HighlightableCommandItem text={node.address} />
                          </span>
                        </div>

                        {/* Shard column */}
                        <div className="flex items-center justify-center">
                          <span className="text-[11px] font-medium">
                            {String(node.shard).padStart(2, "0")}
                          </span>
                        </div>

                        {/* Replica column */}
                        <div className="flex items-center justify-center">
                          <span className="text-[11px] font-medium">
                            {String(node.replica).padStart(2, "0")}
                          </span>
                        </div>
                      </CommandItem>
                    );
                  })}
                </>
              )}
            </CommandList>
          </Command>
        )}
      </PopoverContent>
    </Popover>
  );
}
