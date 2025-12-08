import { ConnectionWizard } from "@/components/connection/connection-wizard";
import { DatabaseTab } from "@/components/database-tab/database-tab";
import { DependencyView } from "@/components/dependency-view/dependency-view";
import { MainPageEmptyState } from "@/components/main-page-empty-state";
import type { AppInitStatus } from "@/components/main-page-empty-state";
import { QueryLogTab } from "@/components/query-log-tab/query-log-tab";
import { QueryTab } from "@/components/query-tab/query-tab";
import { SchemaTreeView } from "@/components/schema/schema-tree-view";
import { ServerTab } from "@/components/server-tab/server-tab";
import { TabManager, type TabInfo } from "@/components/tab-manager";
import { TableTab } from "@/components/table-tab/table-tab";
import { Tabs } from "@/components/ui/tabs";
import { useConnection } from "@/lib/connection/ConnectionContext";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Panel, PanelGroup, PanelResizeHandle } from "react-resizable-panels";
import { MainPageTabList } from "./main-page-tab-list";

export function MainPage() {
  const { selectedConnection, hasAnyConnections } = useConnection();
  const [activeTab, setActiveTab] = useState<string>("");
  const [tabs, setTabs] = useState<TabInfo[]>([]);
  const [pendingTabId, setPendingTabId] = useState<string | null>(null);
  const previousConnectionRef = useRef<string | null>(null);
  const previousConnectionKeyRef = useRef<string | null>(null);
  
  // State for global initialization status (driven by SchemaTreeView)
  const [initStatus, setInitStatus] = useState<AppInitStatus>("initializing");
  const [initError, setInitError] = useState<string | null>(null);

  // Memoize the status change callback to prevent unnecessary re-renders
  const handleStatusChange = useCallback((status: AppInitStatus, error?: string) => {
    setInitStatus(status);
    setInitError(error || null);
  }, []);

  // Reset when connection is removed
  useEffect(() => {
    if (!selectedConnection) {
      setInitStatus("ready");
      setTabs([]);
      setActiveTab("");
    }
  }, [selectedConnection]);

  // Handle open tab events (unified handler)
  useEffect(() => {
    const handler = (event: CustomEvent<import("@/components/tab-manager").OpenTabEventDetail>) => {
      const { type, database, table, engine, host } = event.detail;
      let tabId: string;
      let newTab: TabInfo | null = null;

      switch (type) {
        case "query":
          tabId = "query";
          newTab = { id: "query", type: "query" };
          break;
        case "table":
          if (!database || !table) return;
          tabId = `table:${database}.${table}`;
          newTab = { id: tabId, type: "table", database, table, engine };
          break;
        case "dependency":
          if (!database) return;
          tabId = `dependency:${database}`;
          newTab = { id: tabId, type: "dependency", database };
          break;
        case "database":
          if (!database) return;
          tabId = `database:${database}`;
          newTab = { id: tabId, type: "database", database };
          break;
        case "server":
          if (!host) return;
          tabId = `dashboard:${host}`;
          newTab = { id: tabId, type: "dashboard", host };
          break;
        case "query-log":
          tabId = event.detail.queryId ? `Query Log: ${event.detail.queryId}` : "query-log";
          newTab = { id: tabId, type: "query-log", queryId: event.detail.queryId, eventDate: event.detail.eventDate };
          break;
        default:
          return;
      }

      if (!newTab) return;

      // Update tabs and active tab in a single batch
      setTabs((prevTabs) => {
        const exists = prevTabs.some((t) => t.id === tabId);

        if (!exists) {
          // Set pending tab ID to activate after state update
          setPendingTabId(tabId);
          return [...prevTabs, newTab!];
        }
        // Tab already exists, activate it immediately
        setActiveTab(tabId);
        return prevTabs;
      });
    };

    const unsubscribe = TabManager.onOpenTab(handler);
    return unsubscribe;
  }, []);

  // Activate pending tab after it's added to the list
  useEffect(() => {
    if (pendingTabId && tabs.some((t) => t.id === pendingTabId)) {
      setActiveTab(pendingTabId);
      setPendingTabId(null);
    }
  }, [pendingTabId, tabs]);

  // Emit active tab change events
  useEffect(() => {
    if (activeTab) {
      const tabInfo = tabs.find((t) => t.id === activeTab) || null;
      TabManager.sendActiveTabChange(activeTab, tabInfo);
    }
  }, [activeTab, tabs]);

  // Helper function to get the next tab ID, or previous if no next exists
  const getNextOrPreviousTabId = useCallback((tabId: string, tabsList: TabInfo[]) => {
    // Tabs are in insertion order, so we just use them as-is
    const allTabIds = tabsList.map((t) => t.id);

    const currentIndex = allTabIds.findIndex((id) => id === tabId);
    if (currentIndex === -1) {
      // If tab not found, return first tab if available, or empty string
      return allTabIds.length > 0 ? allTabIds[0] : "";
    }

    // Try to get the next tab
    if (currentIndex < allTabIds.length - 1) {
      return allTabIds[currentIndex + 1];
    }

    // If no next tab, get the previous tab
    if (currentIndex > 0) {
      return allTabIds[currentIndex - 1];
    }

    // No other tabs available
    return "";
  }, []);

  // Helper function to get the previous tab ID (kept for backward compatibility with other handlers)
  const getPreviousTabId = useCallback((tabId: string, tabsList: TabInfo[]) => {
    // Tabs are in insertion order, so we just use them as-is
    const currentIndex = tabsList.findIndex((t) => t.id === tabId);
    if (currentIndex === -1) {
      return "";
    }

    if (currentIndex === 0) {
      return "";
    }

    return tabsList[currentIndex - 1].id;
  }, []);

  // Unified handler for closing any tab
  const handleCloseTab = useCallback(
    (tabId: string, event?: React.MouseEvent) => {
      event?.stopPropagation();
      // If the closed tab was active, find the next tab (or previous if no next)
      if (activeTab === tabId) {
        setTabs((prevTabs) => {
          // Find the next/previous tab before removing the closed tab
          const nextTabId = getNextOrPreviousTabId(tabId, prevTabs);
          // Emit event for tab closure (tabInfo: null) - SchemaTreeView will ignore this
          TabManager.sendActiveTabChange(tabId, null);
          if (nextTabId) {
            setActiveTab(nextTabId);
          } else {
            // No other tabs available, set to empty string
            setActiveTab("");
          }
          return prevTabs.filter((t) => t.id !== tabId);
        });
      } else {
        // Non-active tab closed - no need to emit event, SchemaTreeView only cares about active tab
        setTabs((prevTabs) => prevTabs.filter((t) => t.id !== tabId));
      }
    },
    [activeTab, getNextOrPreviousTabId]
  );

  // Handle closing tabs to the right of a given tab
  const handleCloseTabsToRight = useCallback(
    (tabId: string) => {
      setTabs((prevTabs) => {
        // Tabs are in insertion order, so we just use them as-is
        const currentIndex = prevTabs.findIndex((t) => t.id === tabId);
        if (currentIndex === -1) {
          return prevTabs;
        }

        // Keep tabs up to and including the current tab
        const tabsToKeep = prevTabs.slice(0, currentIndex + 1);
        const closedTabIds = prevTabs.slice(currentIndex + 1).map((t) => t.id);

        // If the active tab is in the closed tabs, switch to the clicked tab
        if (closedTabIds.includes(activeTab)) {
          setActiveTab(tabId);
        }

        return tabsToKeep;
      });
    },
    [activeTab]
  );

  // Handle closing all tabs except the clicked one
  const handleCloseOthers = useCallback(
    (tabId: string) => {
      setTabs((prevTabs) => {
        const newTabs = prevTabs.filter((t) => t.id === tabId);

        // If the active tab was closed, switch to the clicked tab
        if (activeTab !== tabId && !newTabs.some((t) => t.id === activeTab)) {
          setActiveTab(tabId);
        }

        return newTabs;
      });
    },
    [activeTab]
  );

  // Handle closing all tabs
  const handleCloseAll = useCallback(() => {
    // Close all tabs including the query tab
    setTabs([]);
    setActiveTab("");
    // Emit event for tab closure (tabInfo: null) - SchemaTreeView will ignore this
    TabManager.sendActiveTabChange("", null);
  }, []);

  // Close all tabs when connection changes or is updated
  useEffect(() => {
    const currentConnectionName = selectedConnection?.name ?? null;
    const previousConnectionName = previousConnectionRef.current;

    // Create a key that includes connection details that might change (name, url, user)
    // This ensures tabs close when connection is saved/updated, even if name stays the same
    const currentConnectionKey = selectedConnection
      ? `${selectedConnection.name}-${selectedConnection.url}-${selectedConnection.user}`
      : null;
    const previousConnectionKey = previousConnectionKeyRef.current;

    // Close tabs if:
    // 1. Connection name changed (switching between different connections), OR
    // 2. Connection key changed (connection was updated/saved, even if name is the same)
    if (
      previousConnectionName !== null &&
      (previousConnectionName !== currentConnectionName || previousConnectionKey !== currentConnectionKey)
    ) {
      setTabs([]);
      setActiveTab("");
    }

    // Update the refs to track the current connection
    previousConnectionRef.current = currentConnectionName;
    previousConnectionKeyRef.current = currentConnectionKey;
  }, [selectedConnection]);

  // Tabs are kept in insertion order (no sorting) so new tabs appear at the end
  const sortedTabs = useMemo(() => {
    return tabs; // Return tabs in insertion order (new tabs are appended)
  }, [tabs]);

  // Memoize tab content to prevent unnecessary re-renders
  const tabContent = useMemo(() => {
    return sortedTabs.map((tab) => {
      if (tab.type === "query") {
        return (
          <div
            key={tab.id}
            className={`h-full ${activeTab === tab.id ? "block" : "hidden"}`}
            role="tabpanel"
            aria-hidden={activeTab !== tab.id}
          >
            <QueryTab />
          </div>
        );
      }
      if (tab.type === "dashboard") {
        return (
          <div
            key={tab.id}
            className={`h-full ${activeTab === tab.id ? "block" : "hidden"}`}
            role="tabpanel"
            aria-hidden={activeTab !== tab.id}
          >
            <ServerTab host={tab.host} />
          </div>
        );
      }
      if (tab.type === "database") {
        return (
          <div
            key={tab.id}
            className={`h-full ${activeTab === tab.id ? "block" : "hidden"}`}
            role="tabpanel"
            aria-hidden={activeTab !== tab.id}
          >
            <DatabaseTab database={tab.database} />
          </div>
        );
      }
      if (tab.type === "dependency") {
        return (
          <div
            key={tab.id}
            className={`h-full ${activeTab === tab.id ? "block" : "hidden"}`}
            role="tabpanel"
            aria-hidden={activeTab !== tab.id}
          >
            <DependencyView database={tab.database} />
          </div>
        );
      }
      if (tab.type === "table") {
        return (
          <div
            key={tab.id}
            className={`h-full ${activeTab === tab.id ? "block" : "hidden"}`}
            role="tabpanel"
            aria-hidden={activeTab !== tab.id}
          >
            <TableTab database={tab.database} table={tab.table} engine={tab.engine} />
          </div>
        );
      }
      if (tab.type === "query-log") {
        return (
          <div
            key={tab.id}
            className={`h-full ${activeTab === tab.id ? "block" : "hidden"}`}
            role="tabpanel"
            aria-hidden={activeTab !== tab.id}
          >
            <QueryLogTab initialQueryId={tab.queryId} initialEventDate={tab.eventDate} />
          </div>
        );
      }
      return null;
    });
  }, [sortedTabs, activeTab]);

  // Show wizard if no connections exist
  if (!hasAnyConnections) {
    return <ConnectionWizard />;
  }

  return (
    <div className="h-full w-full flex min-w-0 overflow-hidden">
      <PanelGroup direction="horizontal" className="h-full w-full min-w-0">
        {/* Left Panel: Schema Tree View */}
        <Panel defaultSize={20} minSize={10} className="border-r bg-background">
          <SchemaTreeView 
            onStatusChange={handleStatusChange}
          />
        </Panel>

        <PanelResizeHandle className="w-0.5 bg-border hover:bg-border/80 transition-colors cursor-col-resize" />

        {/* Right Panel Group: Tabs for Query and Table Views */}
        <Panel defaultSize={80} minSize={50} className="bg-background">
          <Tabs value={activeTab} onValueChange={setActiveTab} className="h-full w-full flex flex-col">
            {tabs.length > 0 && (
              <MainPageTabList
                activeTab={activeTab}
                onTabChange={setActiveTab}
                tabs={tabs}
                onCloseTab={handleCloseTab}
                onCloseTabsToRight={handleCloseTabsToRight}
                onCloseOthers={handleCloseOthers}
                onCloseAll={handleCloseAll}
                getPreviousTabId={getPreviousTabId}
              />
            )}
            <div className="flex-1 overflow-hidden relative">
              {/* Show Smart Empty State when no tabs exist */}
              {tabs.length === 0 && (
                <MainPageEmptyState 
                  status={initStatus} 
                  error={initError}
                  onRetry={() => window.location.reload()}
                />
              )}

              {/* All Tabs - Always mounted */}
              {tabContent}
            </div>
          </Tabs>
        </Panel>
      </PanelGroup>
    </div>
  );
}
