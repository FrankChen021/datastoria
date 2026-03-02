import { ChatSessionList } from "@/components/chat/session/chat-session-list";
import { useChatPanel } from "@/components/chat/view/use-chat-panel";
import { SchemaTreeView } from "@/components/schema-tree/schema-tree-view";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Book, Database, MessagesSquare } from "lucide-react";
import { SnippetListView } from "../query-tab/snippet/snippet-list-view";
import type { SchemaLoadResult } from "../schema-tree/schema-tree-loader";

interface SidebarPanelProps {
  initialSchemaData: SchemaLoadResult | null;
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
      <TabsList className="w-full justify-start rounded-none border-b bg-muted/40 p-0 h-9 shrink-0">
        <TabsTrigger
          value="database"
          className="flex-1 rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-background h-full px-2"
        >
          <Database className="h-4 w-4 mr-2" />
          Schema
        </TabsTrigger>
        <TabsTrigger
          value="snippets"
          className="flex-1 rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-background h-full px-2"
        >
          <Book className="h-4 w-4 mr-2" />
          Snippets
        </TabsTrigger>
        <TabsTrigger
          value="history"
          className="flex-1 rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-background h-full px-2"
        >
          <MessagesSquare className="h-4 w-4 mr-2" />
          Sessions
        </TabsTrigger>
      </TabsList>
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
