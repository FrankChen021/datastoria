import type { DashboardPanelContainerRef } from "@/components/shared/dashboard/dashboard-panel-container";
import TimeSpanSelector, {
  BUILT_IN_TIME_SPAN_LIST,
  type DisplayTimeSpan,
  type TimeSpan,
} from "@/components/shared/dashboard/timespan-selector";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { RefreshCw } from "lucide-react";
import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { DependencyView } from "../dependency-view/dependency-view";
import type { RefreshableTabViewRef } from "../table-tab/table-tab";
import { DatabaseOverview } from "./database-overview";

export interface DatabaseTabProps {
  database: string;
  tabId?: string;
}

interface TabMetadata {
  loaded: boolean;
  supportRefresh: boolean;
  supportsTimeSpan: boolean;
}

const DatabaseTabComponent = ({ database }: DatabaseTabProps) => {
  const [activeTab, setActiveTab] = useState<string>("overview");
  const [tabsMetadata, setTabsMetadata] = useState<Map<string, TabMetadata>>(
    new Map([["overview", { loaded: true, supportRefresh: true, supportsTimeSpan: false }]])
  );
  const [selectedTimeSpan, setSelectedTimeSpan] = useState<DisplayTimeSpan>(
    BUILT_IN_TIME_SPAN_LIST[3] // Default to "Last 15 Mins"
  );

  // Refs for each tab view
  const overviewRef = useRef<DashboardPanelContainerRef>(null);
  const dependencyRef = useRef<RefreshableTabViewRef>(null);

  // Helper function to get the current ref based on active tab
  const getCurrentRef = useCallback(():
    | DashboardPanelContainerRef
    | RefreshableTabViewRef
    | null => {
    switch (activeTab) {
      case "overview":
        return overviewRef.current;
      case "dependency":
        return dependencyRef.current;
      default:
        return null;
    }
  }, [activeTab]);

  // Update tab metadata when tab changes
  useEffect(() => {
    const rafId = requestAnimationFrame(() => {
      const ref = getCurrentRef();
      const hasRefreshCap = ref !== null && "refresh" in ref && typeof ref.refresh === "function";

      setTabsMetadata((prev) => {
        const next = new Map(prev);
        const existing = next.get(activeTab);

        // Initialize or update tab metadata
        // Keep existing supportsTimeSpan value if already set
        next.set(activeTab, {
          loaded: true, // Mark as loaded when accessed
          supportRefresh: hasRefreshCap,
          supportsTimeSpan: existing?.supportsTimeSpan ?? false,
        });

        return next;
      });
    });

    return () => cancelAnimationFrame(rafId);
  }, [activeTab, getCurrentRef]);

  const handleRefresh = useCallback(
    (overrideTimeSpan?: TimeSpan) => {
      const currentRef = getCurrentRef();
      if (currentRef && "refresh" in currentRef && typeof currentRef.refresh === "function") {
        const metadata = tabsMetadata.get(activeTab);
        const timeSpan =
          overrideTimeSpan ??
          (metadata?.supportsTimeSpan ? selectedTimeSpan.getTimeSpan() : undefined);
        currentRef.refresh(timeSpan);
      }
    },
    [getCurrentRef, tabsMetadata, activeTab, selectedTimeSpan]
  );

  const handleTimeSpanChanged = useCallback(
    (span: DisplayTimeSpan) => {
      setSelectedTimeSpan(span);
      const timeSpan = span.calculateAbsoluteTimeSpan();
      handleRefresh(timeSpan);
    },
    [handleRefresh]
  );

  // Memoize the calculated timeSpan to prevent unnecessary refreshes
  const calculatedTimeSpan = useMemo(
    () => selectedTimeSpan.calculateAbsoluteTimeSpan(),
    [selectedTimeSpan]
  );

  const currentMetadata = tabsMetadata.get(activeTab);

  return (
    <div className="h-full w-full flex flex-col overflow-hidden">
      <Tabs
        value={activeTab}
        onValueChange={setActiveTab}
        className="flex flex-col flex-1 overflow-hidden"
      >
        <div className="flex justify-between items-center gap-2 m-2">
          <TabsList>
            <TabsTrigger
              value="overview"
              className="border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:rounded-b-none data-[state=active]:bg-transparent"
            >
              Database Overview
            </TabsTrigger>
            <TabsTrigger
              value="dependency"
              className="border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:rounded-b-none data-[state=active]:bg-transparent"
            >
              Database Dependency
            </TabsTrigger>
          </TabsList>
          {currentMetadata?.supportRefresh && (
            <div className="flex items-center gap-2">
              {currentMetadata?.supportsTimeSpan && (
                <TimeSpanSelector
                  defaultTimeSpan={selectedTimeSpan}
                  showTimeSpanSelector={true}
                  showRefresh={false}
                  showAutoRefresh={false}
                  size="sm"
                  buttonClassName="h-6 w-6"
                  onSelectedSpanChanged={handleTimeSpanChanged}
                />
              )}
              <Button
                variant="outline"
                size="icon"
                onClick={() => handleRefresh()}
                className="h-8 w-8"
              >
                <RefreshCw className="h-4 w-4" />
              </Button>
            </div>
          )}
        </div>
        <div className="flex-1 relative overflow-hidden">
          {/* Overview tab */}
          <div
            className={`absolute inset-0 overflow-auto px-2 ${activeTab === "overview" ? "block" : "hidden"}`}
            role="tabpanel"
            aria-hidden={activeTab !== "overview"}
          >
            {tabsMetadata.get("overview")?.loaded && (
              <DatabaseOverview
                ref={overviewRef}
                database={database}
                selectedTimeSpan={calculatedTimeSpan}
              />
            )}
          </div>
          {/* Database Dependency tab */}
          <div
            className={`absolute inset-0 overflow-auto px-0 ${activeTab === "dependency" ? "block" : "hidden"}`}
            role="tabpanel"
            aria-hidden={activeTab !== "dependency"}
          >
            {tabsMetadata.get("dependency")?.loaded && <DependencyView database={database} />}
          </div>
        </div>
      </Tabs>
    </div>
  );
};

DatabaseTabComponent.displayName = "DatabaseTab";

export const DatabaseTab = memo(DatabaseTabComponent);
