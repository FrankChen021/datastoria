import TimeSpanSelector, {
  type DisplayTimeSpan,
  type TimeSpan,
  BUILT_IN_TIME_SPAN_LIST,
} from "@/components/shared/dashboard/timespan-selector";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Loader2, RefreshCw } from "lucide-react";
import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { DataSampleView } from "./data-sample-view";
import { PartHistoryView } from "./part-history-view";
import { PartitionSizeView } from "./partition-view";
import { QueryHistoryView } from "./query-history-view";
import { getSystemTableTabs } from "./system-table/system-table-registry";
import { TableMetadataView } from "./table-metadata-view";
import { TableOverviewView } from "./table-overview-view";

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
  ["MaterializedView", new Set(["metadata", "overview", "partitions"])],
  ["Kafka", new Set(["metadata"])],
  ["URL", new Set(["metadata"])],
  ["Distributed", new Set(["data-sample", "metadata", "query-history"])],
  // Default: all tabs available
]);

const TableTabComponent = ({ database, table, engine }: TableTabProps) => {
  // Check if this is a system table and if it has custom rendering
  const isSystemDatabase = useMemo(() => database.toLowerCase() === "system", [database]);
  const customSystemTabs = useMemo(() => {
    if (isSystemDatabase) {
      return getSystemTableTabs(table);
    }
    return undefined;
  }, [isSystemDatabase, table]);

  // Hide Overview and Partitions tabs if engine starts with "System"
  const isSystemTable = useMemo(() => (engine?.startsWith("System") || engine?.startsWith("MySQL")) ?? false, [engine]);

  // Get available tabs for this engine, or default to all tabs
  const baseAvailableTabs = useMemo(() => {
    return engine
      ? (ENGINE_TABS_MAP.get(engine) ??
        new Set(["data-sample", "metadata", "overview", "partitions", "query-history", "part-history"]))
      : new Set(["data-sample", "metadata", "overview", "partitions", "query-history", "part-history"]);

  }, [engine]);

  // Remove overview and partitions for System tables
  const availableTabs = useMemo(() => {
    return isSystemTable ? new Set(["data-sample", "metadata"]) : baseAvailableTabs;
  }, [isSystemTable, baseAvailableTabs]);

  const initialTab = useMemo(() => {
    // If custom system tabs exist, use the first one
    if (customSystemTabs && customSystemTabs.length > 0) {
      return `custom-${0}`;
    }
    return availableTabs.has("overview") ? "overview" : "metadata";
  }, [availableTabs, customSystemTabs]);
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
  const tableOverviewRef = useRef<RefreshableTabViewRef>(null);
  const partitionRef = useRef<RefreshableTabViewRef>(null);
  const queryHistoryRef = useRef<RefreshableTabViewRef>(null);
  const partHistoryRef = useRef<RefreshableTabViewRef>(null);

  // Helper function to get the current ref based on active tab
  // Directly access refs to avoid unnecessary callback recreation
  const getCurrentRef = useCallback((): RefreshableTabViewRef | null => {
    switch (currentTab) {
      case "data-sample":
        return dataSampleRef.current;
      case "metadata":
        return metadataRef.current;
      case "overview":
        return tableOverviewRef.current;
      case "partitions":
        return partitionRef.current;
      case "query-history":
        return queryHistoryRef.current;
      case "part-history":
        return partHistoryRef.current;
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
    // Use requestAnimationFrame to check after render, more efficient than setTimeout
    const rafId = requestAnimationFrame(() => {
      const ref = getCurrentRef();
      const hasRefreshCap = hasRefreshCapability(ref);
      setHasRefresh(hasRefreshCap);
      setSupportsTimeSpan(ref?.supportsTimeSpanSelector === true);
    });

    return () => cancelAnimationFrame(rafId);
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

  const handleRefresh = useCallback(
    (overrideTimeSpan?: TimeSpan) => {
      setIsRefreshing(true);
      // Reset refreshing state after a short delay to allow child components to update their loading state
      // The FloatingProgressBar will show the actual loading state
      setTimeout(() => setIsRefreshing(false), 100);

      const currentRef = getCurrentRef();
      if (hasRefreshCapability(currentRef)) {
        const timeSpan =
          overrideTimeSpan ?? (supportsTimeSpan ? selectedTimeSpan.calculateAbsoluteTimeSpan() : undefined);
        currentRef.refresh(timeSpan);
      }
    },
    [getCurrentRef, supportsTimeSpan, selectedTimeSpan]
  );

  const handleTimeSpanChanged = useCallback(
    (span: DisplayTimeSpan) => {
      setSelectedTimeSpan(span);
      // Trigger refresh when time span changes, passing the new timespan directly
      const timeSpan = span.calculateAbsoluteTimeSpan();
      handleRefresh(timeSpan);
    },
    [handleRefresh]
  );

  // If custom system tabs exist, render them
  if (customSystemTabs && customSystemTabs.length > 0) {
    const hasMultipleTabs = customSystemTabs.length > 1;

    return (
      <div className="h-full w-full flex flex-col overflow-hidden">
        <Tabs value={currentTab} onValueChange={setCurrentTab} className="flex flex-col flex-1 overflow-hidden">
          {hasMultipleTabs && (
            <div className="flex justify-between items-center gap-2 m-2">
              <TabsList>
                {customSystemTabs.map(([displayText], index) => (
                  <TabsTrigger key={`custom-${index}`} value={`custom-${index}`}>
                    {displayText}
                  </TabsTrigger>
                ))}
              </TabsList>
            </div>
          )}
          <div className="flex-1 relative overflow-hidden">
            {customSystemTabs.map(([, Component], index) => {
              const tabValue = `custom-${index}`;
              return (
                <div
                  key={tabValue}
                  className={`absolute inset-0 overflow-auto ${currentTab === tabValue ? "block" : "hidden"}`}
                  role="tabpanel"
                  aria-hidden={currentTab !== tabValue}
                >
                  <Component database={database} table={table} />
                </div>
              );
            })}
          </div>
        </Tabs>
      </div>
    );
  }

  // Default rendering for non-custom system tables
  const hasMultipleTabs = availableTabs.size > 1;

  return (
    <div className="h-full w-full flex flex-col overflow-hidden">
      <Tabs value={currentTab} onValueChange={setCurrentTab} className="flex flex-col flex-1 overflow-hidden">
        {hasMultipleTabs && (
          <div className="flex justify-between items-center gap-2 m-2">
            <TabsList>
              {availableTabs.has("overview") && <TabsTrigger value="overview">Overview</TabsTrigger>}
              {availableTabs.has("metadata") && <TabsTrigger value="metadata">Metadata</TabsTrigger>}
              {availableTabs.has("data-sample") && <TabsTrigger value="data-sample">Data Sample</TabsTrigger>}
              {availableTabs.has("partitions") && <TabsTrigger value="partitions">Partitions</TabsTrigger>}
              {availableTabs.has("query-history") && <TabsTrigger value="query-history">Query History</TabsTrigger>}
              {availableTabs.has("part-history") && <TabsTrigger value="part-history">Part History</TabsTrigger>}
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
        )}
        {!hasMultipleTabs && hasRefresh && (
          <div className="flex justify-end items-center gap-2 m-2">
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
        )}
        <div className="flex-1 relative overflow-hidden">
          {/* All tabs are always mounted, visibility controlled by CSS */}
          {availableTabs.has("overview") && (
            <div
              className={`absolute inset-0 overflow-auto px-2 ${currentTab === "overview" ? "block" : "hidden"}`}
              role="tabpanel"
              aria-hidden={currentTab !== "overview"}
            >
              <TableOverviewView
                ref={tableOverviewRef}
                database={database}
                table={table}
                autoLoad={loadedTabs.has("overview")}
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
          {availableTabs.has("query-history") && (
            <div
              className={`absolute inset-0 overflow-auto px-2 ${currentTab === "query-history" ? "block" : "hidden"}`}
              role="tabpanel"
              aria-hidden={currentTab !== "query-history"}
            >
              <QueryHistoryView
                ref={queryHistoryRef}
                database={database}
                table={table}
                autoLoad={loadedTabs.has("query-history")}
              />
            </div>
          )}
          {availableTabs.has("part-history") && (
            <div
              className={`absolute inset-0 overflow-auto px-2 ${currentTab === "part-history" ? "block" : "hidden"}`}
              role="tabpanel"
              aria-hidden={currentTab !== "part-history"}
            >
              <PartHistoryView
                ref={partHistoryRef}
                database={database}
                table={table}
                autoLoad={loadedTabs.has("part-history")}
              />
            </div>
          )}
        </div>
      </Tabs>
    </div>
  );
};

export const TableTab = memo(TableTabComponent);
