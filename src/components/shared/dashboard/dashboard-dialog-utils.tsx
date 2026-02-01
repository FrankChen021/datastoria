import { ThemedSyntaxHighlighter } from "@/components/shared/themed-syntax-highlighter";
import { Dialog } from "@/components/shared/use-dialog";
import { TabManager } from "@/components/tab-manager";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ExternalLink } from "lucide-react";
import type { SQLQuery } from "./dashboard-model";

/** Responsive className for dashboard drilldown dialogs: near full-screen on mobile, 60vw/70vh on desktop */
export const DRILLDOWN_DIALOG_CLASS_NAME =
  "w-[95vw] max-w-[95vw] h-[90dvh] sm:max-w-[60vw] sm:h-[70vh]";

/**
 * Shows a dialog displaying the SQL query
 */
export function showQueryDialog(
  query: SQLQuery | undefined,
  title?: string,
  executedSql?: string
): void {
  if (!query?.sql) {
    return;
  }

  // Check if we should show both queries (if executedSql is provided and different from template)
  const showTabs = executedSql && executedSql.trim() !== query.sql.trim();

  // Dialog content based on whether we show tabs or not
  const content = showTabs ? (
    <div className="w-full h-full flex flex-col overflow-hidden">
      <Tabs defaultValue="executed" className="w-full h-full flex flex-col">
        <TabsList className="w-full justify-start rounded-none border-b bg-transparent p-0 h-auto">
          <TabsTrigger
            value="executed"
            className="rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent data-[state=active]:shadow-none data-[state=active]:rounded-b-none px-4 py-2"
          >
            Executed Query
          </TabsTrigger>
          <TabsTrigger
            value="template"
            className="rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent data-[state=active]:shadow-none data-[state=active]:rounded-b-none px-4 py-2"
          >
            Query Template
          </TabsTrigger>
        </TabsList>
        <TabsContent value="executed" className="flex-1 overflow-auto mt-2 min-h-0">
          <ThemedSyntaxHighlighter
            language="sql"
            showLineNumbers={true}
            customStyle={{
              padding: "0rem",
              margin: 0,
              fontSize: "0.875rem",
              lineHeight: "1.5",
            }}
          >
            {executedSql!.trim()}
          </ThemedSyntaxHighlighter>
        </TabsContent>
        <TabsContent value="template" className="flex-1 overflow-auto mt-2 min-h-0">
          {/* Note: TabsContent has its own focus handling, but we need ensure overflow works */}
          <ThemedSyntaxHighlighter
            language="sql"
            showLineNumbers={true}
            customStyle={{
              padding: "0rem",
              margin: 0,
              fontSize: "0.875rem",
              lineHeight: "1.5",
            }}
          >
            {query.sql.trim()}
          </ThemedSyntaxHighlighter>
        </TabsContent>
      </Tabs>
    </div>
  ) : (
    <div className="w-full h-full overflow-auto">
      <ThemedSyntaxHighlighter language="sql" showLineNumbers={true}>
        {executedSql?.trim() || query.sql.trim()}
      </ThemedSyntaxHighlighter>
    </div>
  );

  Dialog.showDialog({
    title: title ? `Query: ${title}` : "SQL Query",
    description: "The SQL query used for this component",
    className: "max-w-[800px] min-h-[50vh] max-h-[80vh] flex flex-col", // Increased min-height and added flex
    disableContentScroll: false, // We handle scrolling inside the tabs
    mainContent: content,
    dialogButtons: [
      {
        text: "Open in Query Tab",
        icon: <ExternalLink className="h-4 w-4" />,
        default: false,
        variant: "outline",
        onClick: async () => {
          // Default to executed SQL if available (most useful for debugging), otherwise template
          let sql = (executedSql || query.sql).trim();
          if (title) {
            sql = `-- ${title}\n${sql}`;
          }

          // Activate the query tab and set the SQL query
          TabManager.activateQueryTab({
            query: sql,
            mode: "insert",
          });

          // Return true to close the dialog
          return true;
        },
      },
    ],
  });
}
