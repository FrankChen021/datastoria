import { DashboardTab } from "@/components/dashboard-tab/dashboard-tab";
import {
  DashboardTabManager,
  type OpenDashboardTabEventDetail,
} from "@/components/dashboard-tab/dashboard-tab-manager";
import { DatabaseTab } from "@/components/database-tab/database-tab";
import {
  DatabaseTabManager,
  type OpenDatabaseTabEventDetail,
} from "@/components/database-tab/database-tab-manager";
import { DependencyTab } from "@/components/dependency-tab/dependency-tab";
import {
  DependencyTabManager,
  type OpenDependencyTabEventDetail,
} from "@/components/dependency-tab/dependency-tab-manager";
import { QueryTab } from "@/components/query-tab/query-tab";
import { SchemaTreeView } from "@/components/schema/schema-tree-view";
import { TableTab } from "@/components/table-tab/table-tab";
import { TableTabManager, type OpenTableTabEventDetail } from "@/components/table-tab/table-tab-manager";
import { Tabs } from "@/components/ui/tabs";
import { useConnection } from "@/lib/connection/ConnectionContext";
import { useCallback, useEffect, useRef, useState } from "react";
import { Panel, PanelGroup, PanelResizeHandle } from "react-resizable-panels";
import { MainPageTabList } from "./main-page-tab-list";

interface TableTabInfo {
  id: string;
  database: string;
  table: string;
  engine?: string;
}

interface DependencyTabInfo {
  id: string;
  database: string;
}

interface DatabaseTabInfo {
  id: string;
  database: string;
}

interface DashboardTabInfo {
  id: string;
  host: string;
}

export function MainPage() {
  const { selectedConnection } = useConnection();
  const [activeTab, setActiveTab] = useState<string>("query");
  const [tableTabs, setTableTabs] = useState<TableTabInfo[]>([]);
  const [dependencyTabs, setDependencyTabs] = useState<DependencyTabInfo[]>([]);
  const [databaseTabs, setDatabaseTabs] = useState<DatabaseTabInfo[]>([]);
  const [dashboardTabs, setDashboardTabs] = useState<DashboardTabInfo[]>([]);
  const [pendingTabId, setPendingTabId] = useState<string | null>(null);
  const previousConnectionRef = useRef<string | null>(null);

  // Generate a unique tab ID from database and table name
  const getTableTabId = useCallback((database: string, table: string) => {
    return `table:${database}.${table}`;
  }, []);

  // Generate a unique tab ID from database name
  const getDependencyTabId = useCallback((database: string) => {
    return `dependency:${database}`;
  }, []);

  // Generate a unique tab ID from database name
  const getDatabaseTabId = useCallback((database: string) => {
    return `database:${database}`;
  }, []);

  // Generate a unique tab ID from host name
  const getDashboardTabId = useCallback((host: string) => {
    return `dashboard:${host}`;
  }, []);

  // Handle open table tab events
  useEffect(() => {
    const handler = (event: CustomEvent<OpenTableTabEventDetail>) => {
      const { database, table, engine } = event.detail;
      const tabId = getTableTabId(database, table);

      // Update tabs and active tab in a single batch
      setTableTabs((prevTabs) => {
        const exists = prevTabs.some((t) => t.id === tabId);

        if (!exists) {
          // Set pending tab ID to activate after state update
          setPendingTabId(tabId);
          return [...prevTabs, { id: tabId, database, table, engine }];
        }
        // Tab already exists, activate it immediately
        setActiveTab(tabId);
        return prevTabs;
      });
    };

    const unsubscribe = TableTabManager.onOpenTableTab(handler);
    return unsubscribe;
  }, [getTableTabId]);

  // Handle open dependency tab events
  useEffect(() => {
    const handler = (event: CustomEvent<OpenDependencyTabEventDetail>) => {
      const { database } = event.detail;
      const tabId = getDependencyTabId(database);

      // Update tabs and active tab in a single batch
      setDependencyTabs((prevTabs) => {
        const exists = prevTabs.some((t) => t.id === tabId);

        if (!exists) {
          // Set pending tab ID to activate after state update
          setPendingTabId(tabId);
          return [...prevTabs, { id: tabId, database }];
        }
        // Tab already exists, activate it immediately
        setActiveTab(tabId);
        return prevTabs;
      });
    };

    const unsubscribe = DependencyTabManager.onOpenDependencyTab(handler);
    return unsubscribe;
  }, [getDependencyTabId]);

  // Handle open database tab events
  useEffect(() => {
    const handler = (event: CustomEvent<OpenDatabaseTabEventDetail>) => {
      const { database } = event.detail;
      const tabId = getDatabaseTabId(database);

      // Update tabs and active tab in a single batch
      setDatabaseTabs((prevTabs) => {
        const exists = prevTabs.some((t) => t.id === tabId);

        if (!exists) {
          // Set pending tab ID to activate after state update
          setPendingTabId(tabId);
          return [...prevTabs, { id: tabId, database }];
        }
        // Tab already exists, activate it immediately
        setActiveTab(tabId);
        return prevTabs;
      });
    };

    const unsubscribe = DatabaseTabManager.onOpenDatabaseTab(handler);
    return unsubscribe;
  }, [getDatabaseTabId]);

  // Handle open dashboard tab events
  useEffect(() => {
    const handler = (event: CustomEvent<OpenDashboardTabEventDetail>) => {
      const { host } = event.detail;
      const tabId = getDashboardTabId(host);

      // Update tabs and active tab in a single batch
      setDashboardTabs((prevTabs) => {
        const exists = prevTabs.some((t) => t.id === tabId);

        if (!exists) {
          // Set pending tab ID to activate after state update
          setPendingTabId(tabId);
          return [...prevTabs, { id: tabId, host }];
        }
        // Tab already exists, activate it immediately
        setActiveTab(tabId);
        return prevTabs;
      });
    };

    const unsubscribe = DashboardTabManager.onOpenDashboardTab(handler);
    return unsubscribe;
  }, [getDashboardTabId]);

  // Activate pending tab after it's added to the list
  useEffect(() => {
    if (
      pendingTabId &&
      (tableTabs.some((t) => t.id === pendingTabId) ||
        dependencyTabs.some((t) => t.id === pendingTabId) ||
        databaseTabs.some((t) => t.id === pendingTabId) ||
        dashboardTabs.some((t) => t.id === pendingTabId))
    ) {
      setActiveTab(pendingTabId);
      setPendingTabId(null);
    }
  }, [pendingTabId, tableTabs, dependencyTabs, databaseTabs, dashboardTabs]);


  // Helper function to get the previous tab ID
  const getPreviousTabId = useCallback(
    (
      tabId: string,
      tableTabsList: TableTabInfo[],
      dependencyTabsList: DependencyTabInfo[],
      databaseTabsList: DatabaseTabInfo[],
      dashboardTabsList: DashboardTabInfo[]
    ) => {
      // Check if it's a table tab
      const tableIndex = tableTabsList.findIndex((t) => t.id === tabId);
      if (tableIndex !== -1) {
        // If it's the first table tab
        if (tableIndex === 0) {
          // Check dependency tabs
          if (dependencyTabsList.length > 0) {
            return dependencyTabsList[dependencyTabsList.length - 1].id;
          }
          // Check database tabs
          if (databaseTabsList.length > 0) {
            return databaseTabsList[databaseTabsList.length - 1].id;
          }
          // Check dashboard tabs
          if (dashboardTabsList.length > 0) {
            return dashboardTabsList[dashboardTabsList.length - 1].id;
          }
          // Otherwise return query tab
          return "query";
        }
        // Otherwise return the previous table tab
        return tableTabsList[tableIndex - 1].id;
      }

      // Check if it's a dependency tab
      const dependencyIndex = dependencyTabsList.findIndex((t) => t.id === tabId);
      if (dependencyIndex !== -1) {
        // If it's the first dependency tab
        if (dependencyIndex === 0) {
          // Check database tabs
          if (databaseTabsList.length > 0) {
            return databaseTabsList[databaseTabsList.length - 1].id;
          }
          // Check dashboard tabs
          if (dashboardTabsList.length > 0) {
            return dashboardTabsList[dashboardTabsList.length - 1].id;
          }
          // Otherwise return query tab
          return "query";
        }
        // Otherwise return the previous dependency tab
        return dependencyTabsList[dependencyIndex - 1].id;
      }

      // Check if it's a database tab
      const databaseIndex = databaseTabsList.findIndex((t) => t.id === tabId);
      if (databaseIndex !== -1) {
        // If it's the first database tab
        if (databaseIndex === 0) {
          // Check dashboard tabs
          if (dashboardTabsList.length > 0) {
            return dashboardTabsList[dashboardTabsList.length - 1].id;
          }
          // Otherwise return query tab
          return "query";
        }
        // Otherwise return the previous database tab
        return databaseTabsList[databaseIndex - 1].id;
      }

      // Check if it's a dashboard tab
      const dashboardIndex = dashboardTabsList.findIndex((t) => t.id === tabId);
      if (dashboardIndex !== -1) {
        // If it's the first dashboard tab, return query tab
        if (dashboardIndex === 0) {
          return "query";
        }
        // Otherwise return the previous dashboard tab
        return dashboardTabsList[dashboardIndex - 1].id;
      }

      // Fallback to query tab
      return "query";
    },
    []
  );

  // Handle closing a table tab
  const handleCloseTableTab = useCallback(
    (tabId: string, event?: React.MouseEvent) => {
      event?.stopPropagation();
      // If the closed tab was active, find the previous tab
      if (activeTab === tabId) {
        setTableTabs((prevTabs) => {
          const newTabs = prevTabs.filter((t) => t.id !== tabId);
          const previousTabId = getPreviousTabId(tabId, prevTabs, dependencyTabs, databaseTabs, dashboardTabs);
          setActiveTab(previousTabId);
          return newTabs;
        });
      } else {
        setTableTabs((prevTabs) => prevTabs.filter((t) => t.id !== tabId));
      }
    },
    [activeTab, dependencyTabs, databaseTabs, dashboardTabs, getPreviousTabId]
  );

  // Handle closing a dependency tab
  const handleCloseDependencyTab = useCallback(
    (tabId: string, event?: React.MouseEvent) => {
      event?.stopPropagation();
      // If the closed tab was active, find the previous tab
      if (activeTab === tabId) {
        setDependencyTabs((prevTabs) => {
          const newTabs = prevTabs.filter((t) => t.id !== tabId);
          const previousTabId = getPreviousTabId(tabId, tableTabs, prevTabs, databaseTabs, dashboardTabs);
          setActiveTab(previousTabId);
          return newTabs;
        });
      } else {
        setDependencyTabs((prevTabs) => prevTabs.filter((t) => t.id !== tabId));
      }
    },
    [activeTab, tableTabs, databaseTabs, dashboardTabs, getPreviousTabId]
  );

  // Handle closing a database tab
  const handleCloseDatabaseTab = useCallback(
    (tabId: string, event?: React.MouseEvent) => {
      event?.stopPropagation();
      // If the closed tab was active, find the previous tab
      if (activeTab === tabId) {
        setDatabaseTabs((prevTabs) => {
          const newTabs = prevTabs.filter((t) => t.id !== tabId);
          const previousTabId = getPreviousTabId(tabId, tableTabs, dependencyTabs, prevTabs, dashboardTabs);
          setActiveTab(previousTabId);
          return newTabs;
        });
      } else {
        setDatabaseTabs((prevTabs) => prevTabs.filter((t) => t.id !== tabId));
      }
    },
    [activeTab, tableTabs, dependencyTabs, dashboardTabs, getPreviousTabId]
  );

  // Handle closing a dashboard tab
  const handleCloseDashboardTab = useCallback(
    (tabId: string, event?: React.MouseEvent) => {
      event?.stopPropagation();
      // If the closed tab was active, find the previous tab
      if (activeTab === tabId) {
        setDashboardTabs((prevTabs) => {
          const newTabs = prevTabs.filter((t) => t.id !== tabId);
          const previousTabId = getPreviousTabId(tabId, tableTabs, dependencyTabs, databaseTabs, prevTabs);
          setActiveTab(previousTabId);
          return newTabs;
        });
      } else {
        setDashboardTabs((prevTabs) => prevTabs.filter((t) => t.id !== tabId));
      }
    },
    [activeTab, tableTabs, dependencyTabs, databaseTabs, getPreviousTabId]
  );

  // Handle closing tabs to the right of a given tab
  const handleCloseTabsToRight = useCallback(
    (tabId: string) => {
      // If tabId is "query", close all tabs
      if (tabId === "query") {
        setTableTabs([]);
        setDependencyTabs([]);
        setDatabaseTabs([]);
        setDashboardTabs([]);
        setActiveTab("query");
        return;
      }

      // Check if it's a table tab
      const tableIndex = tableTabs.findIndex((t) => t.id === tabId);
      if (tableIndex !== -1) {
        setTableTabs((prevTabs) => {
          const newTabs = prevTabs.slice(0, tableIndex + 1);
          const closedTabIds = prevTabs.slice(tableIndex + 1).map((t) => t.id);
          // Also close all dependency, database and dashboard tabs if closing table tabs to the right
          setDependencyTabs([]);
          setDatabaseTabs([]);
          setDashboardTabs([]);

          // If the active tab is in the closed tabs, switch to the clicked tab
          if (closedTabIds.includes(activeTab)) {
            setActiveTab(tabId);
          }

          return newTabs;
        });
        return;
      }

      // Check if it's a dependency tab
      const dependencyIndex = dependencyTabs.findIndex((t) => t.id === tabId);
      if (dependencyIndex !== -1) {
        setDependencyTabs((prevTabs) => {
          const newTabs = prevTabs.slice(0, dependencyIndex + 1);
          const closedTabIds = prevTabs.slice(dependencyIndex + 1).map((t) => t.id);
          // Also close all database and dashboard tabs
          setDatabaseTabs([]);
          setDashboardTabs([]);

          // If the active tab is in the closed tabs, switch to the clicked tab
          if (closedTabIds.includes(activeTab)) {
            setActiveTab(tabId);
          }

          return newTabs;
        });
        return;
      }

      // Check if it's a database tab
      const databaseIndex = databaseTabs.findIndex((t) => t.id === tabId);
      if (databaseIndex !== -1) {
        setDatabaseTabs((prevTabs) => {
          const newTabs = prevTabs.slice(0, databaseIndex + 1);
          const closedTabIds = prevTabs.slice(databaseIndex + 1).map((t) => t.id);
          // Also close all dashboard tabs
          setDashboardTabs([]);

          // If the active tab is in the closed tabs, switch to the clicked tab
          if (closedTabIds.includes(activeTab)) {
            setActiveTab(tabId);
          }

          return newTabs;
        });
        return;
      }

      // Check if it's a dashboard tab
      const dashboardIndex = dashboardTabs.findIndex((t) => t.id === tabId);
      if (dashboardIndex !== -1) {
        setDashboardTabs((prevTabs) => {
          const newTabs = prevTabs.slice(0, dashboardIndex + 1);
          const closedTabIds = prevTabs.slice(dashboardIndex + 1).map((t) => t.id);

          // If the active tab is in the closed tabs, switch to the clicked tab
          if (closedTabIds.includes(activeTab)) {
            setActiveTab(tabId);
          }

          return newTabs;
        });
      }
    },
    [activeTab, tableTabs, dependencyTabs, databaseTabs, dashboardTabs]
  );

  // Handle closing all tabs except the clicked one
  const handleCloseOthers = useCallback(
    (tabId: string) => {
      // If tabId is "query", close all other tabs (but keep query tab)
      if (tabId === "query") {
        setTableTabs([]);
        setDependencyTabs([]);
        setDatabaseTabs([]);
        setDashboardTabs([]);
        setActiveTab("query");
        return;
      }

      // Check if it's a table tab
      const isTableTab = tableTabs.some((t) => t.id === tabId);
      if (isTableTab) {
        setTableTabs((prevTabs) => {
          const newTabs = prevTabs.filter((t) => t.id === tabId);
          // Close all dependency, database and dashboard tabs
          setDependencyTabs([]);
          setDatabaseTabs([]);
          setDashboardTabs([]);

          // If the active tab was closed, switch to the clicked tab
          if (activeTab !== tabId && !newTabs.some((t) => t.id === activeTab)) {
            setActiveTab(tabId);
          }

          return newTabs;
        });
        return;
      }

      // Check if it's a dependency tab
      const isDependencyTab = dependencyTabs.some((t) => t.id === tabId);
      if (isDependencyTab) {
        setDependencyTabs((prevTabs) => {
          const newTabs = prevTabs.filter((t) => t.id === tabId);
          // Close all table, database and dashboard tabs
          setTableTabs([]);
          setDatabaseTabs([]);
          setDashboardTabs([]);

          // If the active tab was closed, switch to the clicked tab
          if (activeTab !== tabId && !newTabs.some((t) => t.id === activeTab)) {
            setActiveTab(tabId);
          }

          return newTabs;
        });
        return;
      }

      // Check if it's a database tab
      const isDatabaseTab = databaseTabs.some((t) => t.id === tabId);
      if (isDatabaseTab) {
        setDatabaseTabs((prevTabs) => {
          const newTabs = prevTabs.filter((t) => t.id === tabId);
          // Close all table, dependency and dashboard tabs
          setTableTabs([]);
          setDependencyTabs([]);
          setDashboardTabs([]);

          // If the active tab was closed, switch to the clicked tab
          if (activeTab !== tabId && !newTabs.some((t) => t.id === activeTab)) {
            setActiveTab(tabId);
          }

          return newTabs;
        });
        return;
      }

      // Check if it's a dashboard tab
      const isDashboardTab = dashboardTabs.some((t) => t.id === tabId);
      if (isDashboardTab) {
        setDashboardTabs((prevTabs) => {
          const newTabs = prevTabs.filter((t) => t.id === tabId);
          // Close all table, dependency and database tabs
          setTableTabs([]);
          setDependencyTabs([]);
          setDatabaseTabs([]);

          // If the active tab was closed, switch to the clicked tab
          if (activeTab !== tabId && !newTabs.some((t) => t.id === activeTab)) {
            setActiveTab(tabId);
          }

          return newTabs;
        });
      }
    },
    [activeTab, tableTabs, dependencyTabs, databaseTabs, dashboardTabs]
  );

  // Handle closing all tabs (but keep Query tab)
  const handleCloseAll = useCallback(() => {
    setTableTabs([]);
    setDependencyTabs([]);
    setDatabaseTabs([]);
    setDashboardTabs([]);
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
              tableTabs={tableTabs}
              dependencyTabs={dependencyTabs}
              databaseTabs={databaseTabs}
              dashboardTabs={dashboardTabs}
              onCloseTableTab={handleCloseTableTab}
              onCloseDependencyTab={handleCloseDependencyTab}
              onCloseDatabaseTab={handleCloseDatabaseTab}
              onCloseDashboardTab={handleCloseDashboardTab}
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
              {/* Dashboard Tabs - Always mounted */}
              {dashboardTabs.map((tab) => (
                <div
                  key={tab.id}
                  className={`h-full ${activeTab === tab.id ? "block" : "hidden"}`}
                  role="tabpanel"
                  aria-hidden={activeTab !== tab.id}
                >
                  <DashboardTab host={tab.host} />
                </div>
              ))}
              {/* Database Tabs - Always mounted */}
              {databaseTabs.map((tab) => (
                <div
                  key={tab.id}
                  className={`h-full ${activeTab === tab.id ? "block" : "hidden"}`}
                  role="tabpanel"
                  aria-hidden={activeTab !== tab.id}
                >
                  <DatabaseTab database={tab.database} />
                </div>
              ))}
              {/* Dependency Tabs - Always mounted */}
              {dependencyTabs.map((tab) => (
                <div
                  key={tab.id}
                  className={`h-full ${activeTab === tab.id ? "block" : "hidden"}`}
                  role="tabpanel"
                  aria-hidden={activeTab !== tab.id}
                >
                  <DependencyTab database={tab.database} />
                </div>
              ))}
              {/* Table Tabs - Always mounted */}
              {tableTabs.map((tab) => (
                <div
                  key={tab.id}
                  className={`h-full ${activeTab === tab.id ? "block" : "hidden"}`}
                  role="tabpanel"
                  aria-hidden={activeTab !== tab.id}
                >
                  <TableTab database={tab.database} table={tab.table} engine={tab.engine} />
                </div>
              ))}
            </div>
          </Tabs>
        </Panel>
      </PanelGroup>
    </div>
  );
}

