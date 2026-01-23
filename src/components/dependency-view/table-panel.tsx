import { ThemedSyntaxHighlighter } from "@/components/shared/themed-syntax-highlighter";
import { OpenTableTabButton } from "@/components/table-tab/open-table-tab-button";
import { Button } from "@/components/ui/button";
import { X } from "lucide-react";
import type { DependencyGraphNode } from "./dependency-builder";

export interface TablePanelProps {
  tableNode: DependencyGraphNode;
  onClose: () => void;
}

export const TablePanel = ({ tableNode, onClose }: TablePanelProps) => {
  return (
    <>
      {/* Header with close button */}
      <div className="flex items-center justify-between pl-2 border-b flex-shrink-0 h-8">
        <OpenTableTabButton
          database={tableNode.namespace}
          table={tableNode.name}
          engine={tableNode.category}
          variant="shadcn-link"
          showDatabase={true}
          className="truncate"
        />
        <Button variant="ghost" size="icon" onClick={onClose} className="h-6 w-6 mr-1">
          <X className="h-3.5 w-3.5" />
        </Button>
      </div>

      {/* Metadata modification time */}
      {tableNode.metadataModificationTime && (
        <div className="px-3 py-2 border-b text-xs text-muted-foreground">
          Metadata Last modified: {tableNode.metadataModificationTime}
        </div>
      )}

      {/* DDL content */}
      <div className="flex-1 overflow-auto">
        <ThemedSyntaxHighlighter
          customStyle={{ fontSize: "14px", margin: 0 }}
          language="sql"
          showLineNumbers={true}
        >
          {tableNode.query}
        </ThemedSyntaxHighlighter>
      </div>
    </>
  );
};
