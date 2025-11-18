import { ThemedSyntaxHighlighter } from "../themed-syntax-highlighter";
import { Dialog } from "../use-dialog";
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
    className: "max-w-[80vw] max-h-[80vh]",
    disableContentScroll: false,
    mainContent: (
      <div className="w-full h-full overflow-auto">
        <ThemedSyntaxHighlighter language="sql" showLineNumbers={true}>
          {query.sql.trim()}
        </ThemedSyntaxHighlighter>
      </div>
    ),
  });
}
