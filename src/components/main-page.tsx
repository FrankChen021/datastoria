import { DatabaseTab } from "@/components/database-tab/database-tab";
import { DependencyView } from "@/components/dependency-view/dependency-view";
import { QueryTab } from "@/components/query-tab/query-tab";
import { QueryLogTab } from "@/components/query-log-tab/query-log-tab";
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
  const { selectedConnection } = useConnection();
  const [activeTab, setActiveTab] = useState<string>("query");
  const [tabs, setTabs] = useState<TabInfo[]>([]);
  const [pendingTabId, setPendingTabId] = useState<string | null>(null);
  const previousConnectionRef = useRef<string | null>(null);

  // Helper functions to generate tab IDs
  const getTableTabId = useCallback((database: string, table: string) => {
    return `table:${database}.${table}`;
  }, []);

  const getDependencyTabId = useCallback((database: string) => {
    return `dependency:${database}`;
  }, []);

  const getDatabaseTabId = useCallback((database: string) => {
    return `database:${database}`;
  }, []);

  const getDashboardTabId = useCallback((host: string) => {
    return `dashboard:${host}`;
  }, []);

  const getQueryLogTabId = useCallback((queryId?: string) => {
    if (queryId) {
      return `Query Log: ${queryId}`;
    }
    return "query-log";
  }, []);

  // Handle open tab events (unified handler)
  useEffect(() => {
    const handler = (event: CustomEvent<import("@/components/tab-manager").OpenTabEventDetail>) => {
      const { type, database, table, engine, host } = event.detail;
      let tabId: string;
      let newTab: TabInfo | null = null;

      switch (type) {
        case "query":
          // Query tab is always present, just activate it
          setActiveTab("query");
          return;
        case "table":
          if (!database || !table) return;
          tabId = getTableTabId(database, table);
          newTab = { id: tabId, type: "table", database, table, engine };
          break;
        case "dependency":
          if (!database) return;
          tabId = getDependencyTabId(database);
          newTab = { id: tabId, type: "dependency", database };
          break;
        case "database":
          if (!database) return;
          tabId = getDatabaseTabId(database);
          newTab = { id: tabId, type: "database", database };
          break;
        case "server":
          if (!host) return;
          tabId = getDashboardTabId(host);
          newTab = { id: tabId, type: "dashboard", host };
          break;
        case "query-log":
          tabId = getQueryLogTabId(event.detail.queryId);
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
  }, [getTableTabId, getDependencyTabId, getDatabaseTabId, getDashboardTabId, getQueryLogTabId]);

  // Activate pending tab after it's added to the list
  useEffect(() => {
    if (pendingTabId && tabs.some((t) => t.id === pendingTabId)) {
      setActiveTab(pendingTabId);
      setPendingTabId(null);
    }
  }, [pendingTabId, tabs]);


  // Helper function to get the next tab ID, or previous if no next exists
  const getNextOrPreviousTabId = useCallback((tabId: string, tabsList: TabInfo[]) => {
    // Create a full list including query tab at the beginning (query tab is always present)
    // Tabs are in insertion order, so we just use them as-is
    const allTabIds = ["query", ...tabsList.map((t) => t.id)];

    const currentIndex = allTabIds.findIndex((id) => id === tabId);
    if (currentIndex === -1) {
      return "query";
    }

    // Try to get the next tab
    if (currentIndex < allTabIds.length - 1) {
      return allTabIds[currentIndex + 1];
    }

    // If no next tab, get the previous tab
    if (currentIndex > 0) {
      return allTabIds[currentIndex - 1];
    }

    // Fallback to query tab
    return "query";
  }, []);

  // Helper function to get the previous tab ID (kept for backward compatibility with other handlers)
  const getPreviousTabId = useCallback((tabId: string, tabsList: TabInfo[]) => {
    // Tabs are in insertion order, so we just use them as-is
    const currentIndex = tabsList.findIndex((t) => t.id === tabId);
    if (currentIndex === -1) {
      return "query";
    }

    if (currentIndex === 0) {
      return "query";
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
          setActiveTab(nextTabId);
          return prevTabs.filter((t) => t.id !== tabId);
        });
      } else {
        setTabs((prevTabs) => prevTabs.filter((t) => t.id !== tabId));
      }
    },
    [activeTab, getNextOrPreviousTabId]
  );

  // Handle closing tabs to the right of a given tab
  const handleCloseTabsToRight = useCallback(
    (tabId: string) => {
      // If tabId is "query", close all tabs
      if (tabId === "query") {
        setTabs([]);
        setActiveTab("query");
        return;
      }

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
      // If tabId is "query", close all other tabs (but keep query tab)
      if (tabId === "query") {
        setTabs([]);
        setActiveTab("query");
        return;
      }

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

  // Handle closing all tabs (but keep Query tab)
  const handleCloseAll = useCallback(() => {
    setTabs([]);
    // Always switch to query tab after closing all
    setActiveTab("query");
  }, []);

  // Close all tabs when connection changes
  useEffect(() => {
    const currentConnectionName = selectedConnection?.name ?? null;
    const previousConnectionName = previousConnectionRef.current;

    // Only close tabs if connection actually changed (not on initial mount)
    if (previousConnectionName !== null && previousConnectionName !== currentConnectionName) {
      handleCloseAll();
    }

    // Update the ref to track the current connection
    previousConnectionRef.current = currentConnectionName;
  }, [selectedConnection?.name, handleCloseAll]);

  // Tabs are kept in insertion order (no sorting) so new tabs appear at the end
  const sortedTabs = useMemo(() => {
    return tabs; // Return tabs in insertion order (new tabs are appended)
  }, [tabs]);

  // Memoize tab content to prevent unnecessary re-renders
  const tabContent = useMemo(() => {
    return sortedTabs.map((tab) => {
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

  return (
    <div className="h-full w-full flex min-w-0 overflow-hidden">
      <PanelGroup direction="horizontal" className="h-full w-full min-w-0">
        {/* Left Panel: Schema Tree View */}
        <Panel defaultSize={20} minSize={10} className="border-r bg-background">
          <SchemaTreeView />
        </Panel>

        <PanelResizeHandle className="w-0.5 bg-border hover:bg-border/80 transition-colors cursor-col-resize" />

        {/* Right Panel Group: Tabs for Query and Table Views */}
        <Panel defaultSize={80} minSize={50} className="bg-background">
          <Tabs value={activeTab} onValueChange={setActiveTab} className="h-full w-full flex flex-col">
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
            <div className="flex-1 overflow-hidden relative">
              {/* Query Tab - Always mounted */}
              <div
                className={`h-full ${activeTab === "query" ? "block" : "hidden"}`}
                role="tabpanel"
                aria-hidden={activeTab !== "query"}
              >
                <QueryTab />
              </div>
              {/* All Tabs - Always mounted */}
              {tabContent}
            </div>
          </Tabs>
        </Panel>
      </PanelGroup>
    </div>
  );
}

