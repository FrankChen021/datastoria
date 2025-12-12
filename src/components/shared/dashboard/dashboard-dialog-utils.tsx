import { ExternalLink } from "lucide-react";
import { TabManager } from "@/components/tab-manager";
import { ThemedSyntaxHighlighter } from "@/components/themed-syntax-highlighter";
import { Dialog } from "@/components/use-dialog";
import type { SQLQuery } from "./dashboard-model";

/**
 * Shows a dialog displaying the SQL query
 */
export function showQueryDialog(query: SQLQuery | undefined, title?: string): void {
  if (!query?.sql) {
    return;
  }

  Dialog.showDialog({
    title: title ? `Query: ${title}` : "SQL Query",
    description: "The SQL query used for this component",
    className: "max-w-[800px] min-h-[30vh] max-h-[80vh]",
    disableContentScroll: false,
    mainContent: (
      <div className="w-full h-full overflow-auto">
        <ThemedSyntaxHighlighter language="sql" showLineNumbers={true}>
          {query.sql.trim()}
        </ThemedSyntaxHighlighter>
      </div>
    ),
    dialogButtons: [
      {
        text: "Open in Query Tab",
        icon: <ExternalLink className="h-4 w-4" />,
        default: false,
        variant: "outline",
        onClick: async () => {
          let sql = query.sql.trim();
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
