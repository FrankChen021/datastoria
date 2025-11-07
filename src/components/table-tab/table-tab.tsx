import TimeSpanSelector, {
  type DisplayTimeSpan,
  type TimeSpan,
  BUILT_IN_TIME_SPAN_LIST,
} from "@/components/dashboard/timespan-selector";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Loader2, RefreshCw } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { DataSampleView } from "./data-sample-view";
import { PartLogView } from "./part-log-view";
import { PartitionSizeView } from "./partition-view";
import { QueryLogView } from "./query-log-view";
import { TableMetadataView } from "./table-metadata-view";
import { TableSizeView } from "./table-size-view";

export interface TableTabProps {
  database: string;
  table: string;
  engine?: string;
  tabId?: string;
}

// Common interface for all tab views that support refresh
export interface RefreshableTabViewRef {
  refresh: (timeSpan?: TimeSpan) => void;
  supportsTimeSpanSelector?: boolean;
}

// Type guard to check if a ref has refresh capability
function hasRefreshCapability(ref: unknown): ref is RefreshableTabViewRef {
  return (
    ref !== null &&
    typeof ref === "object" &&
    "refresh" in ref &&
    typeof (ref as RefreshableTabViewRef).refresh === "function"
  );
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
  const availableTabs = isSystemTable ? new Set(["data-sample", "metadata"]) : baseAvailableTabs;

  const initialTab = availableTabs.has("table-size") ? "table-size" : "metadata";
  const [currentTab, setCurrentTab] = useState<string>(initialTab);

  // Track which tabs have been loaded (to load data only once)
  const [loadedTabs, setLoadedTabs] = useState<Set<string>>(new Set([initialTab]));

  // Track refresh state for button animation
  const [isRefreshing, setIsRefreshing] = useState(false);

  // Time span selector state
  const [selectedTimeSpan, setSelectedTimeSpan] = useState<DisplayTimeSpan>(
    BUILT_IN_TIME_SPAN_LIST[3] // Default to "Last 15 Mins"
  );

  // Refs for each tab view
  const dataSampleRef = useRef<RefreshableTabViewRef>(null);
  const metadataRef = useRef<RefreshableTabViewRef>(null);
  const tableSizeRef = useRef<RefreshableTabViewRef>(null);
  const partitionRef = useRef<RefreshableTabViewRef>(null);
  const queryLogRef = useRef<RefreshableTabViewRef>(null);
  const partLogRef = useRef<RefreshableTabViewRef>(null);

  // Helper function to get the current ref based on active tab
  const getCurrentRef = useCallback((): RefreshableTabViewRef | null => {
    switch (currentTab) {
      case "data-sample":
        return dataSampleRef.current;
      case "metadata":
        return metadataRef.current;
      case "table-size":
        return tableSizeRef.current;
      case "partitions":
        return partitionRef.current;
      case "query-log":
        return queryLogRef.current;
      case "part-log":
        return partLogRef.current;
      default:
        return null;
    }
  }, [currentTab]);

  // Check if current tab has refresh capability
  // Use state to track ref availability, which gets updated after child components mount
  const [hasRefresh, setHasRefresh] = useState(false);
  const [supportsTimeSpan, setSupportsTimeSpan] = useState(false);

  // Re-check ref availability after mount and when currentTab changes
  // This ensures we detect when the ref becomes available after child component mounts
  useEffect(() => {
    // Use a small timeout to allow child components to mount and set their refs
    const timeoutId = setTimeout(() => {
      const ref = getCurrentRef();
      const hasRefreshCap = hasRefreshCapability(ref);
      setHasRefresh(hasRefreshCap);
      setSupportsTimeSpan(ref?.supportsTimeSpanSelector === true);
    }, 0);

    return () => clearTimeout(timeoutId);
  }, [currentTab, getCurrentRef]);

  // Mark tab as loaded when it becomes active for the first time
  useEffect(() => {
    setLoadedTabs((prev) => {
      if (!prev.has(currentTab)) {
        return new Set(prev).add(currentTab);
      }
      return prev;
    });
  }, [currentTab]);

  const handleRefresh = (overrideTimeSpan?: TimeSpan) => {
    setIsRefreshing(true);
    // Reset refreshing state after a short delay to allow child components to update their loading state
    // The FloatingProgressBar will show the actual loading state
    setTimeout(() => setIsRefreshing(false), 100);

    const currentRef = getCurrentRef();
    if (hasRefreshCapability(currentRef)) {
      const timeSpan = overrideTimeSpan ?? (supportsTimeSpan ? selectedTimeSpan.getTimeSpan() : undefined);
      currentRef.refresh(timeSpan);
    }
  };

  const handleTimeSpanChanged = (span: DisplayTimeSpan) => {
    setSelectedTimeSpan(span);
    // Trigger refresh when time span changes, passing the new timespan directly
    const timeSpan = span.getTimeSpan();
    handleRefresh(timeSpan);
  };

  return (
    <div className="h-full w-full flex flex-col overflow-hidden">
      <Tabs value={currentTab} onValueChange={setCurrentTab} className="flex flex-col flex-1 overflow-hidden">
        <div className="flex justify-between items-center gap-2 m-2">
          <TabsList>
            {availableTabs.has("table-size") && <TabsTrigger value="table-size">Table Size</TabsTrigger>}
            {availableTabs.has("data-sample") && <TabsTrigger value="data-sample">Data Sample</TabsTrigger>}
            {availableTabs.has("metadata") && <TabsTrigger value="metadata">Metadata</TabsTrigger>}
            {availableTabs.has("partitions") && <TabsTrigger value="partitions">Partitions</TabsTrigger>}
            {availableTabs.has("query-log") && <TabsTrigger value="query-log">Query Log</TabsTrigger>}
            {availableTabs.has("part-log") && <TabsTrigger value="part-log">Part Log</TabsTrigger>}
          </TabsList>
          {hasRefresh ? (
            <div className="flex items-center gap-2">
              {supportsTimeSpan && (
                <TimeSpanSelector
                  defaultTimeSpan={selectedTimeSpan}
                  showTimeSpanSelector={true}
                  showRefresh={false}
                  showAutoRefresh={false}
                  size="sm"
                  onSelectedSpanChanged={handleTimeSpanChanged}
                />
              )}
              <Button
                variant="outline"
                size="icon"
                onClick={() => handleRefresh()}
                className="h-9 w-9"
                disabled={isRefreshing}
              >
                {isRefreshing ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
              </Button>
            </div>
          ) : null}
        </div>
        <div className="flex-1 relative overflow-hidden">
          {/* All tabs are always mounted, visibility controlled by CSS */}
          {availableTabs.has("table-size") && (
            <div
              className={`absolute inset-0 overflow-auto px-2 ${currentTab === "table-size" ? "block" : "hidden"}`}
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
          {availableTabs.has("data-sample") && (
            <div
              className={`absolute inset-0 overflow-auto px-2 ${currentTab === "data-sample" ? "block" : "hidden"}`}
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
              className={`absolute inset-0 overflow-auto px-2 space-y-2 ${currentTab === "metadata" ? "block" : "hidden"}`}
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

          {availableTabs.has("partitions") && (
            <div
              className={`absolute inset-0 overflow-auto px-2 ${currentTab === "partitions" ? "block" : "hidden"}`}
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
              className={`absolute inset-0 overflow-auto px-2 ${currentTab === "query-log" ? "block" : "hidden"}`}
              role="tabpanel"
              aria-hidden={currentTab !== "query-log"}
            >
              <QueryLogView
                ref={queryLogRef}
                database={database}
                table={table}
                autoLoad={loadedTabs.has("query-log")}
              />
            </div>
          )}
          {availableTabs.has("part-log") && (
            <div
              className={`absolute inset-0 overflow-auto px-2 ${currentTab === "part-log" ? "block" : "hidden"}`}
              role="tabpanel"
              aria-hidden={currentTab !== "part-log"}
            >
              <PartLogView ref={partLogRef} database={database} table={table} autoLoad={loadedTabs.has("part-log")} />
            </div>
          )}
        </div>
      </Tabs>
    </div>
  );
}
