import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuTrigger,
} from "@/components/ui/context-menu";
import { Trash2 } from "lucide-react";
import { useCallback, useEffect, useRef } from "react";
import { useQueryExecutor } from "./query-execution/query-executor";
import { QueryListItemView } from "./query-list-item-view";

export interface QueryListViewProps {
  tabId?: string; // Optional tab ID for multi-tab support
}

export function QueryListView({ tabId }: QueryListViewProps) {
  const {
    sqlMessages,
    isSqlExecuting,
    deleteQuery,
    deleteAllQueries: clearAllQueries,
  } = useQueryExecutor();

  const responseScrollContainerRef = useRef<HTMLDivElement>(null);
  const scrollPlaceholderRef = useRef<HTMLDivElement>(null);
  const prevSqlMessagesCountRef = useRef(sqlMessages.length);

  const scrollToBottom = useCallback((instant = false) => {
    if (scrollPlaceholderRef.current && responseScrollContainerRef.current) {
      // If instant, set scrollTop directly
      if (instant) {
        responseScrollContainerRef.current.scrollTop =
          responseScrollContainerRef.current.scrollHeight;
        return;
      }

      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          if (scrollPlaceholderRef.current) {
            scrollPlaceholderRef.current.scrollIntoView({ block: "end", behavior: "smooth" });
          }
        });
      });
    }
  }, []);

  // Auto scroll when list grows
  useEffect(() => {
    // Check if a new SQL message was added by comparing with previous count
    const sqlMessageAdded = sqlMessages.length > prevSqlMessagesCountRef.current;
    prevSqlMessagesCountRef.current = sqlMessages.length;

    if (sqlMessageAdded) {
      // New SQL query was added - always scroll to bottom
      scrollToBottom();
    } else if (isSqlExecuting) {
      // Also scroll if SQL is executing and user is at bottom
      const container = responseScrollContainerRef.current;
      if (container) {
        const { scrollTop, scrollHeight, clientHeight } = container;
        // Threshold of 100px to consider "at bottom"
        const isAtBottom = scrollHeight - scrollTop - clientHeight <= 100;
        if (isAtBottom) {
          scrollToBottom(true);
        }
      }
    }
  }, [sqlMessages.length, isSqlExecuting, scrollToBottom]);

  // Deletion Handlers
  const handleQueryDelete = useCallback(
    (id: string) => {
      deleteQuery(id);
    },
    [deleteQuery]
  );

  const handleClearScreen = useCallback(() => {
    clearAllQueries();
  }, [clearAllQueries]);

  return (
    <ContextMenu>
      <ContextMenuTrigger asChild>
        <div
          ref={responseScrollContainerRef}
          className="h-full w-full overflow-auto"
          style={{ scrollBehavior: "smooth" }}
        >
          {sqlMessages.length === 0 ? (
            <div className="text-sm text-muted-foreground p-1">
              Input your SQL in the editor below and execute it, then the results will appear here.
            </div>
          ) : (
            <>
              {sqlMessages.map((msg, index) => (
                <QueryListItemView
                  key={msg.id}
                  {...msg}
                  onQueryDelete={handleQueryDelete}
                  isFirst={index === 0}
                  scrollRootRef={responseScrollContainerRef}
                />
              ))}
              <div ref={scrollPlaceholderRef} className="h-6" />
            </>
          )}
        </div>
      </ContextMenuTrigger>
      <ContextMenuContent>
        <ContextMenuItem onClick={handleClearScreen}>
          <Trash2 className="mr-2 h-4 w-4" />
          Clear screen
        </ContextMenuItem>
      </ContextMenuContent>
    </ContextMenu>
  );
}
