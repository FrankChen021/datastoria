import { Button } from "@/components/ui/button";
import { TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuTrigger,
} from "@/components/ui/context-menu";
import { ChevronLeft, ChevronRight, X } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";

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

interface MainPageTabListProps {
  activeTab: string;
  onTabChange: (tabId: string) => void;
  tableTabs: TableTabInfo[];
  dependencyTabs: DependencyTabInfo[];
  databaseTabs: DatabaseTabInfo[];
  dashboardTabs: DashboardTabInfo[];
  onCloseTableTab: (tabId: string, event?: React.MouseEvent) => void;
  onCloseDependencyTab: (tabId: string, event?: React.MouseEvent) => void;
  onCloseDatabaseTab: (tabId: string, event?: React.MouseEvent) => void;
  onCloseDashboardTab: (tabId: string, event?: React.MouseEvent) => void;
  onCloseTabsToRight: (tabId: string) => void;
  onCloseOthers: (tabId: string) => void;
  onCloseAll: () => void;
  getPreviousTabId: (
    tabId: string,
    tableTabs: TableTabInfo[],
    dependencyTabs: DependencyTabInfo[],
    databaseTabs: DatabaseTabInfo[],
    dashboardTabs: DashboardTabInfo[]
  ) => string;
}

export function MainPageTabList({
  activeTab,
  onTabChange,
  tableTabs,
  dependencyTabs,
  databaseTabs,
  dashboardTabs,
  onCloseTableTab,
  onCloseDependencyTab,
  onCloseDatabaseTab,
  onCloseDashboardTab,
  onCloseTabsToRight,
  onCloseOthers,
  onCloseAll,
  getPreviousTabId,
}: MainPageTabListProps) {
  const tabsScrollContainerRef = useRef<HTMLDivElement>(null);
  const [canScrollLeft, setCanScrollLeft] = useState(false);
  const [canScrollRight, setCanScrollRight] = useState(false);
  const scrollStateRef = useRef({ canScrollLeft: false, canScrollRight: false });
  const scrollTimeoutRef = useRef<number | null>(null);

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
  const handleWheel = useCallback((e: WheelEvent) => {
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
  }, [handleScroll]);

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
  }, [checkScrollPosition, handleScroll, handleWheel, tableTabs, dependencyTabs, databaseTabs, dashboardTabs]);

  // Scroll active tab into view
  useEffect(() => {
    if (!tabsScrollContainerRef.current) return;

    // Find the active tab trigger element
    const activeTabTrigger = tabsScrollContainerRef.current.querySelector(`[data-state="active"]`) as HTMLElement;

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
  }, [activeTab, tableTabs, dependencyTabs, databaseTabs, dashboardTabs, checkScrollPosition]);

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

  return (
    <div className="relative w-full border-b bg-background h-9 flex items-center">
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
      <div ref={tabsScrollContainerRef} className="flex-1 overflow-x-auto scrollbar-hide">
        <TabsList className="inline-flex justify-start rounded-none border-0 h-auto p-0 bg-transparent flex-nowrap">
          <ContextMenu>
            <ContextMenuTrigger asChild>
              <div className="inline-flex items-center flex-shrink-0">
                <TabsTrigger
                  value="query"
                  className="rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent"
                  onClick={() => onTabChange("query")}
                >
                  Query
                </TabsTrigger>
              </div>
            </ContextMenuTrigger>
            <ContextMenuContent>
              <ContextMenuItem
                onClick={() => onCloseTabsToRight("query")}
                disabled={tableTabs.length === 0 && dependencyTabs.length === 0 && databaseTabs.length === 0 && dashboardTabs.length === 0}
              >
                Close to the right
              </ContextMenuItem>
              <ContextMenuSeparator />
              <ContextMenuItem
                onClick={() => onCloseOthers("query")}
                disabled={tableTabs.length === 0 && dependencyTabs.length === 0 && databaseTabs.length === 0 && dashboardTabs.length === 0}
              >
                Close others
              </ContextMenuItem>
              <ContextMenuItem
                onClick={onCloseAll}
                disabled={tableTabs.length === 0 && dependencyTabs.length === 0 && databaseTabs.length === 0 && dashboardTabs.length === 0}
              >
                Close all
              </ContextMenuItem>
            </ContextMenuContent>
          </ContextMenu>
          {dashboardTabs.map((tab, index) => (
            <ContextMenu key={tab.id}>
              <ContextMenuTrigger asChild>
                <div className="relative inline-flex items-center flex-shrink-0">
                  <TabsTrigger
                    value={tab.id}
                    className="rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent pr-8"
                    onClick={() => onTabChange(tab.id)}
                  >
                    <span>Dashboard: {tab.host}</span>
                  </TabsTrigger>
                  <button
                    onClick={(e) => onCloseDashboardTab(tab.id, e)}
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
                      const previousTabId = getPreviousTabId(tab.id, tableTabs, dependencyTabs, databaseTabs, dashboardTabs);
                      onTabChange(previousTabId);
                    }
                    onCloseDashboardTab(tab.id);
                  }}
                >
                  Close this tab
                </ContextMenuItem>
                <ContextMenuItem
                  onClick={() => onCloseTabsToRight(tab.id)}
                  disabled={index === dashboardTabs.length - 1 && dependencyTabs.length === 0 && databaseTabs.length === 0 && tableTabs.length === 0}
                >
                  Close to the right
                </ContextMenuItem>
                <ContextMenuSeparator />
                <ContextMenuItem
                  onClick={() => onCloseOthers(tab.id)}
                  disabled={dashboardTabs.length === 1 && dependencyTabs.length === 0 && databaseTabs.length === 0 && tableTabs.length === 0}
                >
                  Close others
                </ContextMenuItem>
                <ContextMenuItem
                  onClick={onCloseAll}
                  disabled={dashboardTabs.length === 0 && dependencyTabs.length === 0 && databaseTabs.length === 0 && tableTabs.length === 0}
                >
                  Close all
                </ContextMenuItem>
              </ContextMenuContent>
            </ContextMenu>
          ))}
          {databaseTabs.map((tab, index) => (
            <ContextMenu key={tab.id}>
              <ContextMenuTrigger asChild>
                <div className="relative inline-flex items-center flex-shrink-0">
                  <TabsTrigger
                    value={tab.id}
                    className="rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent pr-8"
                    onClick={() => onTabChange(tab.id)}
                  >
                    <span>Database: {tab.database}</span>
                  </TabsTrigger>
                  <button
                    onClick={(e) => onCloseDatabaseTab(tab.id, e)}
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
                      const previousTabId = getPreviousTabId(tab.id, tableTabs, dependencyTabs, databaseTabs, dashboardTabs);
                      onTabChange(previousTabId);
                    }
                    onCloseDatabaseTab(tab.id);
                  }}
                >
                  Close this tab
                </ContextMenuItem>
                <ContextMenuItem
                  onClick={() => onCloseTabsToRight(tab.id)}
                  disabled={index === databaseTabs.length - 1 && dependencyTabs.length === 0 && tableTabs.length === 0}
                >
                  Close to the right
                </ContextMenuItem>
                <ContextMenuSeparator />
                <ContextMenuItem
                  onClick={() => onCloseOthers(tab.id)}
                  disabled={databaseTabs.length === 1 && dependencyTabs.length === 0 && tableTabs.length === 0}
                >
                  Close others
                </ContextMenuItem>
                <ContextMenuItem
                  onClick={onCloseAll}
                  disabled={databaseTabs.length === 0 && dependencyTabs.length === 0 && tableTabs.length === 0}
                >
                  Close all
                </ContextMenuItem>
              </ContextMenuContent>
            </ContextMenu>
          ))}
          {dependencyTabs.map((tab, index) => (
            <ContextMenu key={tab.id}>
              <ContextMenuTrigger asChild>
                <div className="relative inline-flex items-center flex-shrink-0">
                  <TabsTrigger
                    value={tab.id}
                    className="rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent pr-8"
                    onClick={() => onTabChange(tab.id)}
                  >
                    <span>Dependencies: {tab.database}</span>
                  </TabsTrigger>
                  <button
                    onClick={(e) => onCloseDependencyTab(tab.id, e)}
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
                      const previousTabId = getPreviousTabId(tab.id, tableTabs, dependencyTabs, databaseTabs, dashboardTabs);
                      onTabChange(previousTabId);
                    }
                    onCloseDependencyTab(tab.id);
                  }}
                >
                  Close this tab
                </ContextMenuItem>
                <ContextMenuItem
                  onClick={() => onCloseTabsToRight(tab.id)}
                  disabled={index === dependencyTabs.length - 1 && databaseTabs.length === 0 && tableTabs.length === 0}
                >
                  Close to the right
                </ContextMenuItem>
                <ContextMenuSeparator />
                <ContextMenuItem
                  onClick={() => onCloseOthers(tab.id)}
                  disabled={dependencyTabs.length === 1 && databaseTabs.length === 0 && tableTabs.length === 0}
                >
                  Close others
                </ContextMenuItem>
                <ContextMenuItem
                  onClick={onCloseAll}
                  disabled={dependencyTabs.length === 0 && databaseTabs.length === 0 && tableTabs.length === 0}
                >
                  Close all
                </ContextMenuItem>
              </ContextMenuContent>
            </ContextMenu>
          ))}
          {tableTabs.map((tab, index) => (
            <ContextMenu key={tab.id}>
              <ContextMenuTrigger asChild>
                <div className="relative inline-flex items-center flex-shrink-0">
                  <TabsTrigger
                    value={tab.id}
                    className="rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent pr-8"
                    onClick={() => onTabChange(tab.id)}
                  >
                    <span>
                      {tab.database}.{tab.table}
                    </span>
                  </TabsTrigger>
                  <button
                    onClick={(e) => onCloseTableTab(tab.id, e)}
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
                      const previousTabId = getPreviousTabId(tab.id, tableTabs, dependencyTabs, databaseTabs, dashboardTabs);
                      onTabChange(previousTabId);
                    }
                    onCloseTableTab(tab.id);
                  }}
                >
                  Close this tab
                </ContextMenuItem>
                <ContextMenuItem
                  onClick={() => onCloseTabsToRight(tab.id)}
                  disabled={index === tableTabs.length - 1 && dependencyTabs.length === 0 && databaseTabs.length === 0}
                >
                  Close to the right
                </ContextMenuItem>
                <ContextMenuSeparator />
                <ContextMenuItem
                  onClick={() => onCloseOthers(tab.id)}
                  disabled={tableTabs.length === 1 && dependencyTabs.length === 0 && databaseTabs.length === 0}
                >
                  Close others
                </ContextMenuItem>
                <ContextMenuItem
                  onClick={onCloseAll}
                  disabled={tableTabs.length === 0 && dependencyTabs.length === 0 && databaseTabs.length === 0}
                >
                  Close all
                </ContextMenuItem>
              </ContextMenuContent>
            </ContextMenu>
          ))}
        </TabsList>
      </div>
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
    </div>
  );
}

