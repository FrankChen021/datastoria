import { ChatSessionList } from "@/components/chat/session/chat-session-list";
import { useChatPanel } from "@/components/chat/view/use-chat-panel";
import { SchemaTreeView } from "@/components/schema-tree/schema-tree-view";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Book, ChevronLeft, ChevronRight, Database, MessagesSquare } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { SnippetListView } from "../query-tab/snippet/snippet-list-view";
import type { SchemaLoadResult } from "../schema-tree/schema-tree-loader";

interface SidebarPanelProps {
  initialSchemaData: SchemaLoadResult | null;
}

function SidebarTabHeader() {
  const tabsScrollContainerRef = useRef<HTMLDivElement>(null);
  const [canScrollLeft, setCanScrollLeft] = useState(false);
  const [canScrollRight, setCanScrollRight] = useState(false);

  const checkScrollPosition = useCallback(() => {
    const container = tabsScrollContainerRef.current;
    if (!container) return;

    const { scrollLeft, scrollWidth, clientWidth } = container;
    setCanScrollLeft(scrollLeft > 0);
    setCanScrollRight(scrollLeft < scrollWidth - clientWidth - 1);
  }, []);

  const handleScrollLeft = useCallback(() => {
    const container = tabsScrollContainerRef.current;
    if (!container) return;
    container.scrollBy({ left: -160, behavior: "smooth" });
    setTimeout(checkScrollPosition, 120);
  }, [checkScrollPosition]);

  const handleScrollRight = useCallback(() => {
    const container = tabsScrollContainerRef.current;
    if (!container) return;
    container.scrollBy({ left: 160, behavior: "smooth" });
    setTimeout(checkScrollPosition, 120);
  }, [checkScrollPosition]);

  useEffect(() => {
    const container = tabsScrollContainerRef.current;
    if (!container) return;

    checkScrollPosition();

    const resizeObserver = new ResizeObserver(() => {
      requestAnimationFrame(checkScrollPosition);
    });
    resizeObserver.observe(container);

    container.addEventListener("scroll", checkScrollPosition, { passive: true });

    return () => {
      resizeObserver.disconnect();
      container.removeEventListener("scroll", checkScrollPosition);
    };
  }, [checkScrollPosition]);

  const showNavigationButtons = canScrollLeft || canScrollRight;

  return (
    <div className="relative w-full border-b bg-muted/40 h-9 shrink-0 flex items-center">
      {showNavigationButtons && (
        <button
          type="button"
          className="h-9 w-6 flex items-center justify-center border-r hover:bg-background/50 disabled:opacity-50 disabled:cursor-default"
          onClick={handleScrollLeft}
          disabled={!canScrollLeft}
          aria-label="Scroll tabs left"
        >
          <ChevronLeft className="h-4 w-4" />
        </button>
      )}

      <div ref={tabsScrollContainerRef} className="flex-1 overflow-x-auto scrollbar-hide">
        <TabsList className="inline-flex justify-start rounded-none border-0 h-9 p-0 bg-transparent flex-nowrap">
          <TabsTrigger
            value="database"
            className="shrink-0 rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-background h-full px-3 whitespace-nowrap"
          >
            <Database className="h-4 w-4 mr-2" />
            Schema
          </TabsTrigger>
          <TabsTrigger
            value="snippets"
            className="shrink-0 rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-background h-full px-3 whitespace-nowrap"
          >
            <Book className="h-4 w-4 mr-2" />
            Snippets
          </TabsTrigger>
          <TabsTrigger
            value="history"
            className="shrink-0 rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-background h-full px-3 whitespace-nowrap"
          >
            <MessagesSquare className="h-4 w-4 mr-2" />
            Chats
          </TabsTrigger>
        </TabsList>
      </div>

      {showNavigationButtons && (
        <button
          type="button"
          className="h-9 w-6 flex items-center justify-center border-l hover:bg-background/50 disabled:opacity-50 disabled:cursor-default"
          onClick={handleScrollRight}
          disabled={!canScrollRight}
          aria-label="Scroll tabs right"
        >
          <ChevronRight className="h-4 w-4" />
        </button>
      )}
    </div>
  );
}

export function SidebarPanel({ initialSchemaData }: SidebarPanelProps) {
  const { currentChatId, requestNewChat, selectChat, activeSidebarTab, setActiveSidebarTab } =
    useChatPanel();

  return (
    <Tabs
      value={activeSidebarTab}
      onValueChange={(value) => {
        setActiveSidebarTab(value as "database" | "snippets" | "history");
      }}
      className="w-full h-full flex flex-col"
    >
      <SidebarTabHeader />
      <TabsContent value="database" className="flex-1 overflow-hidden mt-0 min-h-0">
        <SchemaTreeView initialSchemaData={initialSchemaData} />
      </TabsContent>
      <TabsContent value="snippets" className="flex-1 overflow-hidden mt-0 min-h-0">
        <SnippetListView />
      </TabsContent>
      <TabsContent value="history" className="flex-1 overflow-hidden mt-0 min-h-0">
        {activeSidebarTab === "history" && (
          <ChatSessionList
            currentChatId={currentChatId ?? ""}
            onNewChat={requestNewChat}
            onSelectChat={selectChat}
            className="h-full"
          />
        )}
      </TabsContent>
    </Tabs>
  );
}
