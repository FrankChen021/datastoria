import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Loader2, RefreshCw } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { DataSampleView, type DataSampleViewRef } from "./data-sample-view";
import { PartitionSizeView, type PartitionSizeViewRef } from "./partition-view";
import { TableMetadataView, type TableMetadataViewRef } from "./table-metadata-view";
import { TableSizeView, type TableSizeViewRef } from "./table-size-view";

export interface TableTabProps {
  database: string;
  table: string;
  engine?: string;
  tabId?: string;
}

// Map of engine types to their available tabs
const ENGINE_TABS_MAP = new Map<string, Set<string>>([
  ["MaterializedView", new Set(["metadata", "table-size", "partitions"])],
  ["Kafka", new Set(["metadata"])],
  ["URL", new Set(["metadata"])],
  ["Distributed", new Set(["data-sample", "metadata", "query-log"])],
  // Default: all tabs available
]);

export function TableTab({ database, table, engine }: TableTabProps) {
  // Hide Table Size and Partitions tabs if engine starts with "System"
  const isSystemTable = (engine?.startsWith("System") || engine?.startsWith("MySQL")) ?? false;

  // Get available tabs for this engine, or default to all tabs
  const baseAvailableTabs = engine
    ? (ENGINE_TABS_MAP.get(engine) ??
      new Set(["data-sample", "metadata", "table-size", "partitions", "query-log", "part-log"]))
    : new Set(["data-sample", "metadata", "table-size", "partitions", "query-log", "part-log"]);

  // Remove table-size and partitions for System tables
  const availableTabs = isSystemTable
    ? new Set([...baseAvailableTabs].filter((tab) => tab !== "table-size" && tab !== "partitions"))
    : baseAvailableTabs;

  const initialTab = availableTabs.has("data-sample") ? "data-sample" : "metadata";
  const [currentTab, setCurrentTab] = useState<string>(initialTab);
  
  // Track which tabs have been loaded (to load data only once)
  const [loadedTabs, setLoadedTabs] = useState<Set<string>>(new Set([initialTab]));
  
  // Track refresh state for button animation
  const [isRefreshing, setIsRefreshing] = useState(false);

  // Refs for each tab view
  const dataSampleRef = useRef<DataSampleViewRef>(null);
  const metadataRef = useRef<TableMetadataViewRef>(null);
  const tableSizeRef = useRef<TableSizeViewRef>(null);
  const partitionRef = useRef<PartitionSizeViewRef>(null);

  // Mark tab as loaded when it becomes active for the first time
  useEffect(() => {
    setLoadedTabs((prev) => {
      if (!prev.has(currentTab)) {
        return new Set(prev).add(currentTab);
      }
      return prev;
    });
  }, [currentTab]);

  const handleRefresh = () => {
    setIsRefreshing(true);
    // Reset refreshing state after a short delay to allow child components to update their loading state
    // The FloatingProgressBar will show the actual loading state
    setTimeout(() => setIsRefreshing(false), 100);
    
    switch (currentTab) {
      case "data-sample":
        dataSampleRef.current?.refresh();
        break;
      case "metadata":
        metadataRef.current?.refresh();
        break;
      case "table-size":
        tableSizeRef.current?.refresh();
        break;
      case "partitions":
        partitionRef.current?.refresh();
        break;
      default:
        // Query Log and Part Log tabs don't have refresh functionality yet
        break;
    }
  };

  return (
    <div className="h-full w-full flex flex-col overflow-hidden">
      <Tabs value={currentTab} onValueChange={setCurrentTab} className="flex flex-col flex-1 overflow-hidden">
        <div className="flex justify-between items-center gap-2 mx-2 mt-2">
          <TabsList>
            {availableTabs.has("data-sample") && <TabsTrigger value="data-sample">Data Sample</TabsTrigger>}
            {availableTabs.has("metadata") && <TabsTrigger value="metadata">Metadata</TabsTrigger>}
            {availableTabs.has("table-size") && <TabsTrigger value="table-size">Table Size</TabsTrigger>}
            {availableTabs.has("partitions") && <TabsTrigger value="partitions">Partitions</TabsTrigger>}
            {availableTabs.has("query-log") && <TabsTrigger value="query-log">Query Log</TabsTrigger>}
            {availableTabs.has("part-log") && <TabsTrigger value="part-log">Part Log</TabsTrigger>}
          </TabsList>
          {(currentTab === "data-sample" ||
            currentTab === "metadata" ||
            currentTab === "table-size" ||
            currentTab === "partitions") && (
            <Button variant="ghost" size="icon" onClick={handleRefresh} className="h-8 w-8" disabled={isRefreshing}>
              {isRefreshing ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <RefreshCw className="h-4 w-4" />
              )}
            </Button>
          )}
        </div>
        <div className="flex-1 relative overflow-hidden">
          {/* All tabs are always mounted, visibility controlled by CSS */}
          {availableTabs.has("data-sample") && (
            <div
              className={`absolute inset-0 overflow-auto p-2 ${currentTab === "data-sample" ? "block" : "hidden"}`}
              role="tabpanel"
              aria-hidden={currentTab !== "data-sample"}
            >
              <DataSampleView 
                ref={dataSampleRef} 
                database={database} 
                table={table}
                autoLoad={loadedTabs.has("data-sample")}
              />
            </div>
          )}
          {availableTabs.has("metadata") && (
            <div
              className={`absolute inset-0 overflow-auto p-2 space-y-2 ${currentTab === "metadata" ? "block" : "hidden"}`}
              role="tabpanel"
              aria-hidden={currentTab !== "metadata"}
            >
              <TableMetadataView 
                ref={metadataRef} 
                database={database} 
                table={table}
                autoLoad={loadedTabs.has("metadata")}
              />
            </div>
          )}
          {availableTabs.has("table-size") && (
            <div
              className={`absolute inset-0 overflow-auto p-2 ${currentTab === "table-size" ? "block" : "hidden"}`}
              role="tabpanel"
              aria-hidden={currentTab !== "table-size"}
            >
              <TableSizeView 
                ref={tableSizeRef} 
                database={database} 
                table={table}
                autoLoad={loadedTabs.has("table-size")}
              />
            </div>
          )}
          {availableTabs.has("partitions") && (
            <div
              className={`absolute inset-0 overflow-auto p-2 ${currentTab === "partitions" ? "block" : "hidden"}`}
              role="tabpanel"
              aria-hidden={currentTab !== "partitions"}
            >
              <PartitionSizeView 
                ref={partitionRef} 
                database={database} 
                table={table}
                autoLoad={loadedTabs.has("partitions")}
              />
            </div>
          )}
          {availableTabs.has("query-log") && (
            <div
              className={`absolute inset-0 overflow-auto p-4 mt-2 ${currentTab === "query-log" ? "block" : "hidden"}`}
              role="tabpanel"
              aria-hidden={currentTab !== "query-log"}
            >
              <div className="h-full flex items-center justify-center text-muted-foreground">
                Query Log content coming soon
              </div>
            </div>
          )}
          {availableTabs.has("part-log") && (
            <div
              className={`absolute inset-0 overflow-auto p-4 mt-2 ${currentTab === "part-log" ? "block" : "hidden"}`}
              role="tabpanel"
              aria-hidden={currentTab !== "part-log"}
            >
              <div className="h-full flex items-center justify-center text-muted-foreground">
                Part Log content coming soon
              </div>
            </div>
          )}
        </div>
      </Tabs>
    </div>
  );
}
