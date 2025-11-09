import type { TabInfo } from "@/components/tab-manager";
import { Button } from "@/components/ui/button";
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuTrigger,
} from "@/components/ui/context-menu";
import { TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ChevronLeft, ChevronRight, X } from "lucide-react";
import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";

interface MainPageTabListProps {
  activeTab: string;
  onTabChange: (tabId: string) => void;
  tabs: TabInfo[];
  onCloseTab: (tabId: string, event?: React.MouseEvent) => void;
  onCloseTabsToRight: (tabId: string) => void;
  onCloseOthers: (tabId: string) => void;
  onCloseAll: () => void;
  getPreviousTabId: (tabId: string, tabsList: TabInfo[]) => string;
}

const MainPageTabListComponent = ({
  activeTab,
  onTabChange,
  tabs,
  onCloseTab,
  onCloseTabsToRight,
  onCloseOthers,
  onCloseAll,
  getPreviousTabId,
}: MainPageTabListProps) => {
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

  // Memoize tab labels to avoid recalculating on every render
  const tabLabels = useMemo(() => {
    return sortedTabs
      .map((tab) => {
        if (tab.type === "query-log") {
          return { id: tab.id, label: tab.queryId || "Query Log Viewer" };
        } else if (tab.type === "dashboard") {
          return { id: tab.id, label: `Dashboard: ${tab.host}` };
        } else if (tab.type === "database") {
          return { id: tab.id, label: `Database: ${tab.database}` };
        } else if (tab.type === "dependency") {
          return { id: tab.id, label: `Dependencies: ${tab.database}` };
        } else if (tab.type === "table") {
          return { id: tab.id, label: `${tab.database}.${tab.table}` };
        }
        return null;
      })
      .filter((item): item is { id: string; label: string } => item !== null);
  }, [sortedTabs]);

  return (
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
              <ContextMenuItem onClick={() => onCloseTabsToRight("query")} disabled={tabs.length === 0}>
                Close to the right
              </ContextMenuItem>
              <ContextMenuSeparator />
              <ContextMenuItem onClick={() => onCloseOthers("query")} disabled={tabs.length === 0}>
                Close others
              </ContextMenuItem>
              <ContextMenuItem onClick={onCloseAll} disabled={tabs.length === 0}>
                Close all
              </ContextMenuItem>
            </ContextMenuContent>
          </ContextMenu>
          {sortedTabs.map((tab, index) => {
            const hasTabsToRight = index < sortedTabs.length - 1;
            const hasOtherTabs = tabs.length > 1;
            const tabLabel = tabLabels.find((l) => l.id === tab.id)?.label;

            if (!tabLabel) {
              return null;
            }

            return (
              <ContextMenu key={tab.id}>
                <ContextMenuTrigger asChild>
                  <div className="relative inline-flex items-center flex-shrink-0">
                    <TabsTrigger
                      value={tab.id}
                      className="rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent pr-8"
                      onClick={() => onTabChange(tab.id)}
                    >
                      <span>{tabLabel}</span>
                    </TabsTrigger>
                    <button
                      onClick={(e) => onCloseTab(tab.id, e)}
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
                        onTabChange(previousTabId);
                      }
                      onCloseTab(tab.id);
                    }}
                  >
                    Close this tab
                  </ContextMenuItem>
                  <ContextMenuItem onClick={() => onCloseTabsToRight(tab.id)} disabled={!hasTabsToRight}>
                    Close to the right
                  </ContextMenuItem>
                  <ContextMenuSeparator />
                  <ContextMenuItem onClick={() => onCloseOthers(tab.id)} disabled={!hasOtherTabs}>
                    Close others
                  </ContextMenuItem>
                  <ContextMenuItem onClick={onCloseAll} disabled={tabs.length === 0}>
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
  );
};

export const MainPageTabList = memo(MainPageTabListComponent);
