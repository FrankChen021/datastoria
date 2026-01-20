import { AppLogo } from "@/components/app-logo";
import { DEFAULT_CHAT_QUESTIONS } from "@/components/chat/view/chat-view";
import { useChatPanel } from "@/components/chat/view/use-chat-panel";
import { ClusterTab } from "@/components/cluster-tab/cluster-tab";
import { DatabaseTab } from "@/components/database-tab/database-tab";
import { NodeTab } from "@/components/node-tab/node-tab";
import { QueryLogInspectorTab } from "@/components/query-log-inspector/query-log-inspector-tab";
import { QueryTab } from "@/components/query-tab/query-tab";
import { SYSTEM_TABLE_REGISTRY } from "@/components/system-table-tab/system-table-registry";
import { TabManager, type TabInfo } from "@/components/tab-manager";
import { TableTab } from "@/components/table-tab/table-tab";
import { Button } from "@/components/ui/button";
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuTrigger,
} from "@/components/ui/context-menu";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import type { Connection } from "@/lib/connection/connection";
import { hostNameManager } from "@/lib/host-name-manager";
import {
  ChevronLeft,
  ChevronRight,
  Database,
  Monitor,
  Network,
  Search,
  Sparkles,
  Table as TableIcon,
  Telescope,
  Terminal,
  X,
  type LucideIcon,
} from "lucide-react";
import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";

interface MainPageTabListProps {
  selectedConnection: Connection | null;
}

// Component for the "Ready" state (Welcome screen)
function EmptyTabPlaceholderComponent() {
  const questions = DEFAULT_CHAT_QUESTIONS;
  const { open: openChatPanel, postMessage, displayMode } = useChatPanel();
  const isChatPanelVisible = displayMode !== "hidden";

  const handleOpenChat = useCallback(() => {
    openChatPanel();
  }, [openChatPanel]);

  const handleQuestionClick = useCallback(
    (question: { text: string; autoRun?: boolean }) => {
      // Post the message to the chat panel with autoRun option
      if (question.autoRun) {
        postMessage(question.text, { forceNewChat: true });
      } else {
        openChatPanel();
      }
    },
    [openChatPanel, postMessage]
  );

  return (
    <div className="h-full w-full flex flex-col items-center justify-center bg-muted/5 text-center animate-in fade-in zoom-in-95 duration-300">
      <div className="bg-background shadow-sm">
        <AppLogo width={64} height={64} />
      </div>

      <h3 className="text-2xl font-semibold tracking-tight mb-2">Welcome to Data Storia</h3>

      <p className="text-muted-foreground max-w-xl mb-4 text-sm leading-relaxed">
        Select a table from the sidebar to view its details, or start by running a new SQL query.
      </p>

      {/* Primary Action Buttons */}
      <div className="flex gap-3 mb-12">
        <Button onClick={() => TabManager.activateQueryTab()} className="gap-2 shadow-sm">
          <Terminal className="h-4 w-4" />
          Write SQL to Query
        </Button>
        {/* Only show AI chat button when chat panel is not visible */}
        {!isChatPanelVisible && (
          <Button onClick={handleOpenChat} className="gap-2 shadow-sm" variant="default">
            <Sparkles className="h-4 w-4" />
            Chat with AI Assistant
          </Button>
        )}
      </div>

      {/* Question Suggestions Section - Only show when chat panel is not visible */}
      {!isChatPanelVisible && (
        <div className="w-full max-w-xl">
          <p className="text-xs text-muted-foreground mb-2">Try asking the AI assistant:</p>
          <div className="flex flex-wrap gap-2 justify-center">
            {questions.map((question, index) => (
              <Button
                key={index}
                variant="ghost"
                size="sm"
                className="h-auto py-1.5 px-3 text-xs text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-colors"
                onClick={() => handleQuestionClick(question)}
              >
                {question.text}
              </Button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

export const MainPageTabList = memo(function MainPageTabList({
  selectedConnection,
}: MainPageTabListProps) {
  // Tab management state
  const [activeTab, setActiveTab] = useState<string>("");
  const [tabs, setTabs] = useState<TabInfo[]>([]);
  const [pendingTabId, setPendingTabId] = useState<string | null>(null);
  const previousConnectionKeyRef = useRef<string | null>(null);

  // Scroll state
  const tabsScrollContainerRef = useRef<HTMLDivElement>(null);
  const [canScrollLeft, setCanScrollLeft] = useState(false);
  const [canScrollRight, setCanScrollRight] = useState(false);
  const scrollStateRef = useRef({ canScrollLeft: false, canScrollRight: false });
  const scrollTimeoutRef = useRef<number | null>(null);

  // Handle open tab events (unified handler)
  useEffect(() => {
    const handler = (event: CustomEvent<TabInfo>) => {
      const newTab = event.detail;
      const tabId = newTab.id;

      if (!newTab) return;

      // Check if tab already exists first
      setTabs((prevTabs) => {
        const existingTab = prevTabs.find((t) => t.id === tabId);

        if (existingTab) {
          // Tab already exists, activate it immediately
          setActiveTab(tabId);
          return prevTabs;
        }

        // Tab doesn't exist, add it and set pending activation
        setPendingTabId(tabId);
        return [...prevTabs, newTab];
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
    // Don't re-emit the current active tab while we're in the middle of activating a new tab.
    if (pendingTabId) {
      return;
    }

    if (!activeTab) {
      return;
    }

    const tabInfo = tabs.find((t) => t.id === activeTab) || null;
    TabManager.sendActiveTabChange(activeTab, tabInfo);
  }, [activeTab, tabs, pendingTabId]);

  // Open query tab and node tab when connection is available (initial load or connection change)
  useEffect(() => {
    const currentConnectionId = selectedConnection?.connectionId ?? null;
    const previousConnectionId = previousConnectionKeyRef.current;

    // Open tabs if connection changed OR on initial load with connection
    // This handles both: initial load (previousConnectionId is null) and connection switching
    if (previousConnectionId !== currentConnectionId && currentConnectionId !== null) {
      const openTabs: TabInfo[] = tabs.filter((t) => t.type === "query");

      // Find the activated query tab, if not founded, activate the last one
      let activeTabId = "";
      if (openTabs.length > 0) {
        if (!openTabs.some((t) => t.id === activeTab)) {
          // Activate the last query tab
          activeTabId = openTabs[openTabs.length - 1].id;
        } else {
          // Keep current activated tab unchanged
          activeTabId = activeTab;
        }
      } else {
        // Open and activate query tab
        openTabs.push({
          id: "query",
          type: "query",
        });
        activeTabId = "query";
      }

      // Open query tab and node tab if connection has a target node
      if (selectedConnection?.metadata.displayName) {
        const hostName = selectedConnection.metadata.displayName;
        const shortHostName = hostNameManager.getShortHostname(hostName);

        // Open node tab
        openTabs.push({
          id: `node:${hostName}`,
          type: "node",
          host: shortHostName,
        });

        // If node tab opens, always activate the node tab
        activeTabId = `node:${hostName}`;
      }
      setTabs(openTabs);
      setActiveTab(activeTabId);
    }

    // Update the ref to track the current connection
    previousConnectionKeyRef.current = currentConnectionId;
  }, [selectedConnection, tabs, activeTab]);

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

  // Handle close tab events
  useEffect(() => {
    const handler = (event: CustomEvent<string>) => {
      const tabIdToClose = event.detail;
      handleCloseTab(tabIdToClose);
    };

    const unsubscribe = TabManager.onCloseTab(handler);
    return unsubscribe;
  }, [handleCloseTab]);

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

  // Check scroll position and update button visibility
  // Only updates state when values actually change to prevent unnecessary re-renders
  const checkScrollPosition = useCallback(() => {
    const container = tabsScrollContainerRef.current;
    if (!container) return;

    const { scrollLeft, scrollWidth, clientWidth } = container;
    const newCanScrollLeft = scrollLeft > 0;
    const newCanScrollRight = scrollLeft < scrollWidth - clientWidth - 1;

    // Only update state if values actually changed
    if (scrollStateRef.current.canScrollLeft !== newCanScrollLeft) {
      scrollStateRef.current.canScrollLeft = newCanScrollLeft;
      setCanScrollLeft(newCanScrollLeft);
    }
    if (scrollStateRef.current.canScrollRight !== newCanScrollRight) {
      scrollStateRef.current.canScrollRight = newCanScrollRight;
      setCanScrollRight(newCanScrollRight);
    }
  }, []);

  // Throttled scroll handler to prevent excessive re-renders
  const handleScroll = useCallback(() => {
    // Clear any pending timeout
    if (scrollTimeoutRef.current !== null) {
      clearTimeout(scrollTimeoutRef.current);
    }
    // Throttle scroll checks to reduce re-renders
    scrollTimeoutRef.current = window.setTimeout(() => {
      checkScrollPosition();
    }, 16); // ~60fps
  }, [checkScrollPosition]);

  // Prevent browser navigation gestures on horizontal scroll
  const handleWheel = useCallback(
    (e: WheelEvent) => {
      const container = tabsScrollContainerRef.current;
      if (!container) return;

      // Check if this is a horizontal scroll
      const isHorizontalScroll = Math.abs(e.deltaX) > Math.abs(e.deltaY);

      if (isHorizontalScroll) {
        // Prevent default to stop browser back/forward navigation
        e.preventDefault();

        // Manually scroll the container
        container.scrollLeft += e.deltaX;

        // Trigger our scroll handler to update button states
        handleScroll();
      }
    },
    [handleScroll]
  );

  // Update scroll button visibility on mount, resize, and tab changes
  useEffect(() => {
    checkScrollPosition();
    const container = tabsScrollContainerRef.current;
    if (!container) return;

    const resizeObserver = new ResizeObserver(() => {
      // Use requestAnimationFrame for resize to batch updates
      requestAnimationFrame(checkScrollPosition);
    });
    resizeObserver.observe(container);

    container.addEventListener("scroll", handleScroll, { passive: true });
    // Add wheel event listener to prevent browser navigation
    container.addEventListener("wheel", handleWheel, { passive: false });

    return () => {
      resizeObserver.disconnect();
      container.removeEventListener("scroll", handleScroll);
      container.removeEventListener("wheel", handleWheel);
      if (scrollTimeoutRef.current !== null) {
        clearTimeout(scrollTimeoutRef.current);
        scrollTimeoutRef.current = null;
      }
    };
  }, [checkScrollPosition, handleScroll, handleWheel, tabs]);

  // Scroll active tab into view
  useEffect(() => {
    if (!tabsScrollContainerRef.current) return;

    // Find the active tab trigger element
    const activeTabTrigger = tabsScrollContainerRef.current.querySelector(
      `[data-state="active"]`
    ) as HTMLElement;

    if (activeTabTrigger) {
      // Scroll the active tab into view with smooth behavior
      activeTabTrigger.scrollIntoView({
        behavior: "smooth",
        block: "nearest",
        inline: "center",
      });
    }

    // Check scroll position after scrolling
    // Use requestAnimationFrame to batch with other updates
    requestAnimationFrame(() => {
      setTimeout(checkScrollPosition, 100);
    });
  }, [activeTab, tabs, checkScrollPosition]);

  // Handle scroll left
  const handleScrollLeft = useCallback(() => {
    const container = tabsScrollContainerRef.current;
    if (!container) return;
    container.scrollBy({ left: -200, behavior: "smooth" });
    // Update button visibility after a short delay to account for smooth scrolling
    // Use the throttled handler instead of direct check
    setTimeout(handleScroll, 100);
  }, [handleScroll]);

  // Handle scroll right
  const handleScrollRight = useCallback(() => {
    const container = tabsScrollContainerRef.current;
    if (!container) return;
    container.scrollBy({ left: 200, behavior: "smooth" });
    // Update button visibility after a short delay to account for smooth scrolling
    // Use the throttled handler instead of direct check
    setTimeout(handleScroll, 100);
  }, [handleScroll]);

  const showNavigationButtons = canScrollLeft || canScrollRight;

  // Tabs are kept in insertion order (no sorting) so new tabs appear at the end
  const sortedTabs = useMemo(() => {
    return tabs; // Return tabs in insertion order (new tabs are appended)
  }, [tabs]);

  // Memoize tab labels and icons to avoid recalculating on every render
  const tabLabels = useMemo(() => {
    return sortedTabs
      .map((tab) => {
        if (tab.type === "query") {
          return { id: tab.id, label: "Query", icon: Terminal };
        } else if (tab.type === "query-log") {
          return { id: tab.id, label: tab.queryId || "Query Log Viewer", icon: Search };
        } else if (tab.type === "node") {
          return { id: tab.id, label: `${tab.host}`, icon: Monitor };
        } else if (tab.type === "cluster") {
          return { id: tab.id, label: `${tab.cluster}`, icon: Network };
        } else if (tab.type === "database") {
          return { id: tab.id, label: `${tab.database}`, icon: Database };
        } else if (tab.type === "table") {
          return { id: tab.id, label: `${tab.database}.${tab.table}`, icon: TableIcon };
        } else if (tab.type === "system-table") {
          const entry = SYSTEM_TABLE_REGISTRY.get(tab.tableName);
          return { id: tab.id, label: entry?.title || tab.tableName, icon: Telescope };
        }
        return null;
      })
      .filter((item): item is { id: string; label: string; icon: LucideIcon } => item !== null);
  }, [sortedTabs]);

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
            <QueryTab
              initialQuery={tab.initialQuery}
              initialMode={tab.initialMode}
              initialExecute={tab.initialExecute}
              active={activeTab === tab.id}
            />
          </div>
        );
      }
      if (tab.type === "node") {
        return (
          <div
            key={tab.id}
            className={`h-full ${activeTab === tab.id ? "block" : "hidden"}`}
            role="tabpanel"
            aria-hidden={activeTab !== tab.id}
          >
            <NodeTab host={tab.host} />
          </div>
        );
      }
      if (tab.type === "cluster") {
        return (
          <div
            key={tab.id}
            className={`h-full ${activeTab === tab.id ? "block" : "hidden"}`}
            role="tabpanel"
            aria-hidden={activeTab !== tab.id}
          >
            <ClusterTab />
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
      if (tab.type === "system-table") {
        const EntryComponent = SYSTEM_TABLE_REGISTRY.get(tab.tableName)?.component;
        return (
          <div
            key={tab.id}
            className={`h-full ${activeTab === tab.id ? "block" : "hidden"}`}
            role="tabpanel"
            aria-hidden={activeTab !== tab.id}
          >
            {EntryComponent ? (
              <EntryComponent database="system" table={tab.tableName} />
            ) : (
              <div className="p-4 text-muted-foreground">
                Introspection component not found for {tab.tableName}
              </div>
            )}
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
            <QueryLogInspectorTab initialQueryId={tab.queryId} initialEventDate={tab.eventDate} />
          </div>
        );
      }
      return null;
    });
  }, [sortedTabs, activeTab]);

  return (
    <Tabs value={activeTab} onValueChange={setActiveTab} className="h-full w-full flex flex-col">
      {tabs.length > 0 && (
        <div className="relative w-full border-b bg-background h-9 flex items-center">
          {showNavigationButtons && (
            <Button
              variant="ghost"
              size="icon"
              className="h-9 w-9 rounded-none shrink-0 z-10"
              onClick={handleScrollLeft}
              disabled={!canScrollLeft}
              aria-label="Scroll tabs left"
            >
              <ChevronLeft className="h-4 w-4" />
            </Button>
          )}
          <div ref={tabsScrollContainerRef} className="flex-1 overflow-x-auto scrollbar-hide">
            <TabsList className="inline-flex justify-start rounded-none border-0 h-auto p-0 bg-transparent flex-nowrap">
              {sortedTabs.map((tab, index) => {
                const hasTabsToRight = index < sortedTabs.length - 1;
                const hasOtherTabs = tabs.length > 1;
                const tabInfo = tabLabels.find((l) => l.id === tab.id);

                if (!tabInfo) {
                  return null;
                }

                const { label: tabLabel, icon: TabIcon } = tabInfo;

                return (
                  <ContextMenu key={tab.id}>
                    <ContextMenuTrigger asChild>
                      <div className="relative inline-flex items-center flex-shrink-0">
                        <TabsTrigger
                          value={tab.id}
                          className="rounded-none border-t-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-muted data-[state=active]:font-semibold pr-8"
                          onClick={() => setActiveTab(tab.id)}
                        >
                          <TabIcon className="h-4 w-4 mr-1.5" />
                          <span>{tabLabel}</span>
                        </TabsTrigger>
                        <button
                          onClick={(e) => handleCloseTab(tab.id, e)}
                          className="absolute right-2 top-1/2 -translate-y-1/2 p-1 rounded hover:bg-muted z-10"
                          aria-label="Close tab"
                        >
                          <X className="h-3 w-3" />
                        </button>
                      </div>
                    </ContextMenuTrigger>
                    <ContextMenuContent>
                      <ContextMenuItem
                        onClick={(e) => {
                          e.stopPropagation();
                          if (activeTab === tab.id) {
                            const previousTabId = getPreviousTabId(tab.id, tabs);
                            setActiveTab(previousTabId);
                          }
                          handleCloseTab(tab.id);
                        }}
                      >
                        Close this tab
                      </ContextMenuItem>
                      <ContextMenuItem
                        onClick={() => handleCloseTabsToRight(tab.id)}
                        disabled={!hasTabsToRight}
                      >
                        Close to the right
                      </ContextMenuItem>
                      <ContextMenuItem
                        onClick={() => handleCloseOthers(tab.id)}
                        disabled={!hasOtherTabs}
                      >
                        Close others
                      </ContextMenuItem>
                      <ContextMenuItem onClick={handleCloseAll} disabled={tabs.length === 0}>
                        Close all
                      </ContextMenuItem>
                    </ContextMenuContent>
                  </ContextMenu>
                );
              })}
            </TabsList>
          </div>
          {showNavigationButtons && (
            <Button
              variant="ghost"
              size="icon"
              className="h-9 w-9 rounded-none shrink-0 z-10"
              onClick={handleScrollRight}
              disabled={!canScrollRight}
              aria-label="Scroll tabs right"
            >
              <ChevronRight className="h-4 w-4" />
            </Button>
          )}
        </div>
      )}
      <div className="flex-1 overflow-hidden relative">
        {/* Show Smart Empty State when no tabs exist */}
        {tabs.length === 0 && <EmptyTabPlaceholderComponent />}

        {/* All Tabs - Always mounted */}
        {tabContent}
      </div>
    </Tabs>
  );
});
