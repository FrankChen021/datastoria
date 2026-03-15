"use client";

import { StatusPopover } from "@/components/connection/connection-edit-component";
import { ThemedSyntaxHighlighter } from "@/components/shared/themed-syntax-highlighter";
import { Button } from "@/components/ui/button";
import { copyToClipboardWithMeta } from "@/components/ui/copy-button";
import { Input } from "@/components/ui/input";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Formatter } from "@/lib/formatter";
import { toastManager } from "@/lib/toast";
import { cn } from "@/lib/utils";
import { useVirtualizer } from "@tanstack/react-virtual";
import {
  AlertCircle,
  CheckIcon,
  ClipboardIcon,
  Clock3,
  History,
  Play,
  Search,
  Trash2,
} from "lucide-react";
import { useDeferredValue, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { MAX_QUERY_HISTORY_SIZE, queryHistoryManager } from "./query-history-manager";
import type { QueryHistoryEntry } from "./query-history-storage";

interface QueryHistorySheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onRun: (sql: string) => void;
}

export function QueryHistorySheet({ open, onOpenChange, onRun }: QueryHistorySheetProps) {
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const [entries, setEntries] = useState<QueryHistoryEntry[]>([]);
  const [searchText, setSearchText] = useState("");
  const [isClearAllOpen, setIsClearAllOpen] = useState(false);
  const deferredSearchText = useDeferredValue(searchText.trim().toLowerCase());

  useEffect(() => {
    setEntries(queryHistoryManager.list());
  }, []);

  useEffect(() => {
    const syncHistory = () => {
      setEntries(queryHistoryManager.list());
    };

    queryHistoryManager.addListener(syncHistory);
    return () => {
      queryHistoryManager.removeListener(syncHistory);
    };
  }, []);

  const filteredEntries = useMemo(() => {
    return entries.filter((entry) => {
      if (deferredSearchText.length === 0) {
        return true;
      }

      const haystack = entry.rawSQL.toLowerCase();
      return haystack.includes(deferredSearchText);
    });
  }, [deferredSearchText, entries]);

  const hasEntries = entries.length > 0;
  const hasFilteredEntries = filteredEntries.length > 0;
  const showNoResults = hasEntries && !hasFilteredEntries;
  const rowVirtualizer = useVirtualizer({
    count: filteredEntries.length,
    getScrollElement: () => scrollContainerRef.current,
    estimateSize: () => 180,
    getItemKey: (index) => filteredEntries[index]?.id ?? index,
    overscan: 6,
    measureElement: (element) => element?.getBoundingClientRect().height ?? 180,
  });
  const virtualItems = rowVirtualizer.getVirtualItems();
  const shouldUseVirtualization = scrollContainerRef.current !== null && virtualItems.length > 0;

  useEffect(() => {
    rowVirtualizer.scrollToOffset(0);
  }, [deferredSearchText, open, rowVirtualizer]);

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        className="flex h-full w-[min(52rem,96vw)] max-w-none flex-col gap-0 p-0 sm:max-w-[52rem]"
      >
        <SheetHeader className="border-b px-6 py-4">
          <div className="flex items-start justify-between gap-4 pr-8">
            <div className="space-y-1">
              <SheetTitle className="flex items-center gap-2">
                <History className="h-4 w-4" />
                SQL History
              </SheetTitle>
              <SheetDescription>
                Successful query runs are stored locally per user. Up to {MAX_QUERY_HISTORY_SIZE}{" "}
                items.
              </SheetDescription>
            </div>
          </div>
        </SheetHeader>

        <div className="px-4 pt-2 flex flex-col gap-3 sm:flex-row sm:items-center">
          <div className="relative flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={searchText}
              onChange={(event) => setSearchText(event.target.value)}
              placeholder="Search SQL text"
              className="h-9 pl-9"
            />
          </div>
          <StatusPopover
            open={isClearAllOpen}
            onOpenChange={setIsClearAllOpen}
            trigger={
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="h-8 px-2 text-xs"
                disabled={!hasEntries}
                onClick={() => setIsClearAllOpen(true)}
              >
                <Trash2 className="h-3.5 w-3.5" />
                Clear All
              </Button>
            }
            side="left"
            align="end"
            icon={
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-red-600 dark:text-red-400" />
            }
            title="Confirm clear all"
          >
            <div className="mb-3 text-xs">
              Are you sure to delete all SQL history entries? This action cannot be reverted.
            </div>
            <div className="flex justify-end gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="h-7"
                onClick={() => setIsClearAllOpen(false)}
              >
                Cancel
              </Button>
              <Button
                type="button"
                variant="destructive"
                size="sm"
                className="h-7"
                onClick={() => {
                  setEntries(queryHistoryManager.clear());
                  setIsClearAllOpen(false);
                }}
              >
                Clear all
              </Button>
            </div>
          </StatusPopover>
        </div>
        <div ref={scrollContainerRef} className="min-h-0 flex-1 overflow-y-auto px-4 py-3">
          {!hasEntries ? (
            <EmptyState
              icon={Clock3}
              title="No SQL history yet"
              description="Run a query successfully and it will appear here."
            />
          ) : showNoResults ? (
            <EmptyState
              icon={Search}
              title="No matching history"
              description="Try a different keyword."
            />
          ) : shouldUseVirtualization ? (
            <div
              className="relative w-full"
              style={{ height: `${rowVirtualizer.getTotalSize()}px` }}
            >
              {virtualItems.map((virtualItem) => {
                const entry = filteredEntries[virtualItem.index];
                if (!entry) {
                  return null;
                }

                return (
                  <div
                    key={virtualItem.key}
                    ref={rowVirtualizer.measureElement}
                    data-index={virtualItem.index}
                    className="absolute left-0 top-0 w-full pb-4"
                    style={{ transform: `translateY(${virtualItem.start}px)` }}
                  >
                    <QueryHistoryEntryCard
                      entry={entry}
                      index={virtualItem.index + 1}
                      searchText={deferredSearchText}
                      onDelete={(id) => setEntries(queryHistoryManager.remove(id))}
                      onRun={onRun}
                    />
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="space-y-4">
              {filteredEntries.map((entry, index) => (
                <QueryHistoryEntryCard
                  key={entry.id}
                  entry={entry}
                  index={index + 1}
                  searchText={deferredSearchText}
                  onDelete={(id) => setEntries(queryHistoryManager.remove(id))}
                  onRun={onRun}
                />
              ))}
            </div>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}

function QueryHistoryEntryCard({
  entry,
  index,
  searchText,
  onDelete,
  onRun,
}: {
  entry: QueryHistoryEntry;
  index: number;
  searchText: string;
  onDelete: (id: string) => void;
  onRun: (sql: string) => void;
}) {
  const [isDeleteOpen, setIsDeleteOpen] = useState(false);
  const [isHovered, setIsHovered] = useState(false);

  return (
    <article
      className="rounded-lg border bg-card"
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
      <header className="flex flex-wrap items-center justify-between gap-2 border-b px-4 py-2">
        <div className="flex min-w-0 flex-wrap items-center gap-2 text-sm">
          <span className="text-muted-foreground">#{index}</span>
        </div>
        <div className="text-sm text-muted-foreground">
          {Formatter.getInstance().getFormatter("timeDiff")(entry.timestamp)}
        </div>
      </header>

      <div className="relative p-0">
        <div
          className={cn(
            "absolute right-1 top-2 z-10 flex flex-wrap items-center justify-end gap-1 rounded-md bg-background/90 p-0.5 shadow-sm transition-opacity",
            isHovered || isDeleteOpen
              ? "opacity-100 pointer-events-auto"
              : "opacity-0 pointer-events-none"
          )}
        >
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="h-5 w-5"
            onClick={() => onRun(entry.rawSQL)}
            title="Run SQL"
            aria-label="Run SQL"
          >
            <Play className="!h-3.5 !w-3.5" />
          </Button>
          <HistorySheetCopyButton value={entry.rawSQL} aria-label="Copy SQL" title="Copy SQL" />
          <StatusPopover
            open={isDeleteOpen}
            onOpenChange={(open) => {
              setIsDeleteOpen(open);
              if (!open) {
                setIsHovered(false);
              }
            }}
            trigger={
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="h-5 w-5 text-destructive hover:text-destructive"
                onClick={(event) => {
                  event.stopPropagation();
                  setIsDeleteOpen(true);
                }}
                title="Delete SQL history entry"
                aria-label="Delete SQL history entry"
              >
                <Trash2 className="!h-3.5 !w-3.5" />
              </Button>
            }
            side="left"
            align="start"
            icon={
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-red-600 dark:text-red-400" />
            }
            title="Confirm deletion"
          >
            <div className="mb-3 text-xs">
              Are you sure to delete this SQL history entry? This action cannot be reverted.
            </div>
            <div className="flex justify-end gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="h-7"
                onClick={() => {
                  setIsDeleteOpen(false);
                  setIsHovered(false);
                }}
              >
                Cancel
              </Button>
              <Button
                type="button"
                variant="destructive"
                size="sm"
                className="h-7"
                onClick={() => {
                  onDelete(entry.id);
                  setIsDeleteOpen(false);
                  setIsHovered(false);
                }}
              >
                Delete
              </Button>
            </div>
          </StatusPopover>
        </div>
        <div className="w-full rounded-md">
          <ThemedSyntaxHighlighter
            language="sql"
            showLineNumbers={false}
            highlightQuery={searchText}
            expandable={true}
            collapseLines={10}
            customStyle={{
              backgroundColor: "var(--code-block-bg)",
              margin: 0,
              padding: "12px",
            }}
          >
            {entry.rawSQL}
          </ThemedSyntaxHighlighter>
        </div>
      </div>
    </article>
  );
}

function HistorySheetCopyButton({
  children,
  className,
  value,
  ...props
}: {
  children?: ReactNode;
  className?: string;
  value: string;
} & React.ButtonHTMLAttributes<HTMLButtonElement>) {
  const [hasCopied, setHasCopied] = useState(false);

  useEffect(() => {
    if (!hasCopied) {
      return;
    }

    const timeout = setTimeout(() => {
      setHasCopied(false);
    }, 3000);

    return () => clearTimeout(timeout);
  }, [hasCopied]);

  const handleCopy = async () => {
    try {
      await copyToClipboardWithMeta(value);
      setHasCopied(true);
    } catch {
      toastManager.show("Failed to copy to clipboard", "error");
    }
  };

  return (
    <Button
      type="button"
      variant="ghost"
      size="icon"
      className={cn("h-5 w-5", className)}
      onClick={handleCopy}
      {...props}
    >
      {hasCopied ? (
        <CheckIcon className="!h-3.5 !w-3.5" />
      ) : (
        <ClipboardIcon className="!h-3.5 !w-3.5" />
      )}
      {children}
    </Button>
  );
}

function EmptyState({
  icon: Icon,
  title,
  description,
}: {
  icon: typeof Clock3;
  title: string;
  description: string;
}) {
  return (
    <div className="flex h-full min-h-[16rem] flex-col items-center justify-center rounded-lg bg-muted/20 px-6 text-center">
      <div className="mb-3 rounded-full bg-muted p-3 text-muted-foreground">
        <Icon className="h-5 w-5" />
      </div>
      <div className="text-sm font-medium">{title}</div>
      <div className="mt-1 max-w-md text-sm text-muted-foreground">{description}</div>
    </div>
  );
}
