import { Button } from "@/components/ui/button";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Formatter } from "@/lib/formatter";
import { format } from "date-fns";
import { ChevronDown, ChevronUp, Square, X } from "lucide-react";
import { memo, useCallback, useEffect, useRef, useState } from "react";
import { QueryExecutionTimer } from "./query-execution-timer";
import { useQueryExecutor } from "./query-execution/query-executor";
import { QueryIdButton } from "./query-id-button";
import { QueryRequestView } from "./query-request-view";
import { QueryResponseView } from "./query-response/query-response-view";
import type { QueryResponseViewModel, QueryViewProps, QueryViewType } from "./query-view-model";

interface QueryListItemViewProps extends QueryViewProps {
  isFirst?: boolean;
  queryResponse?: QueryResponseViewModel;
  isExecuting: boolean;
  tabId?: string;
  scrollRootRef?: React.RefObject<HTMLDivElement | null>;
}

const QuerySummary = memo(({ summaryText }: { summaryText: string | undefined }) => {
  if (!summaryText) {
    return null;
  }

  try {
    const summary = JSON.parse(summaryText);
    const parts: string[] = [];
    Object.entries(summary).forEach(([key, value]) => {
      const numValue = typeof value === "number" ? value : Number(value);
      if (!isNaN(numValue) && numValue !== 0) {
        const formattedKey = key.replace(/_/g, " ");
        const formattedValue = Formatter.getInstance().getFormatter("comma_number")(numValue);
        parts.push(`${formattedKey}: ${formattedValue}`);
      }
    });
    return parts.length > 0 ? (
      <div className="text-xs text-muted-foreground">
        <span>Summary: {parts.join(", ")}</span>
      </div>
    ) : null;
  } catch {
    return null;
  }
});

QuerySummary.displayName = "QuerySummary";

export function QueryListItemView({
  onQueryDelete,
  view,
  queryRequest,
  isFirst,
  queryResponse,
  isExecuting,
  tabId,
  scrollRootRef,
}: QueryListItemViewProps) {
  const { cancelQuery } = useQueryExecutor();
  const [collapsed, setCollapsed] = useState(queryRequest.showRequest === "collapse");
  const deleteButtonRef = useRef<HTMLButtonElement>(null);
  const scrollPlaceholderRef = useRef<HTMLDivElement>(null);
  const thisComponentRef = useRef<HTMLDivElement>(null);
  const scrollUpButtonWrapperRef = useRef<HTMLDivElement>(null);
  const scrollDownButtonWrapperRef = useRef<HTMLDivElement>(null);
  const isHoveringRef = useRef(false);

  const timestamp = format(new Date(queryRequest.timestamp), "yyyy-MM-dd HH:mm:ss");

  const setScrollButtonVisibility = useCallback(() => {
    const root = scrollRootRef?.current ?? null;
    const section = thisComponentRef.current;
    if (!root || !section) return;

    const rootRect = root.getBoundingClientRect();
    const sectionRect = section.getBoundingClientRect();

    const isInView = sectionRect.bottom > rootRect.top && sectionRect.top < rootRect.bottom;
    if (!isInView) {
      if (scrollUpButtonWrapperRef.current) {
        scrollUpButtonWrapperRef.current.style.display = "none";
      }
      if (scrollDownButtonWrapperRef.current) {
        scrollDownButtonWrapperRef.current.style.display = "none";
      }
      return;
    }

    const clippedTop = sectionRect.top < rootRect.top - 1;
    const clippedBottom = sectionRect.bottom > rootRect.bottom + 1;

    // Calculate the visible top and bottom positions within the scroll container
    const visibleTop = Math.max(sectionRect.top, rootRect.top);
    const visibleBottom = Math.min(sectionRect.bottom, rootRect.bottom);

    if (scrollUpButtonWrapperRef.current) {
      if (clippedTop) {
        scrollUpButtonWrapperRef.current.style.display = "";
        // Position at the bottom of the visible viewport region (offset from section bottom)
        const offsetFromSectionBottom = sectionRect.bottom - visibleBottom;
        scrollUpButtonWrapperRef.current.style.bottom = `${offsetFromSectionBottom + 8}px`;
        scrollUpButtonWrapperRef.current.style.top = "auto";
      } else {
        scrollUpButtonWrapperRef.current.style.display = "none";
      }
    }

    if (scrollDownButtonWrapperRef.current) {
      if (clippedBottom) {
        scrollDownButtonWrapperRef.current.style.display = "";
        // Position at the top of the visible viewport region (offset from section top)
        const offsetFromSectionTop = visibleTop - sectionRect.top;
        scrollDownButtonWrapperRef.current.style.top = `${offsetFromSectionTop + 8}px`;
        scrollDownButtonWrapperRef.current.style.bottom = "auto";
      } else {
        scrollDownButtonWrapperRef.current.style.display = "none";
      }
    }
  }, [scrollRootRef]);

  const handleMouseEnter = useCallback(() => {
    isHoveringRef.current = true;
    if (deleteButtonRef.current) {
      deleteButtonRef.current.style.opacity = "1";
      deleteButtonRef.current.style.pointerEvents = "auto";
    }
    setScrollButtonVisibility();
  }, [setScrollButtonVisibility]);

  const handleMouseLeave = useCallback(() => {
    isHoveringRef.current = false;
    if (deleteButtonRef.current) {
      deleteButtonRef.current.style.opacity = "0";
      deleteButtonRef.current.style.pointerEvents = "none";
    }
    if (scrollUpButtonWrapperRef.current) {
      scrollUpButtonWrapperRef.current.style.display = "none";
    }
    if (scrollDownButtonWrapperRef.current) {
      scrollDownButtonWrapperRef.current.style.display = "none";
    }
  }, []);

  const scrollToTop = useCallback(() => {
    const root = scrollRootRef?.current ?? null;
    const section = thisComponentRef.current;
    if (!root || !section) return;

    const rootRect = root.getBoundingClientRect();
    const sectionRect = section.getBoundingClientRect();

    const delta = sectionRect.top - rootRect.top - 8;
    root.scrollBy({ top: delta, behavior: "smooth" });
    // Use multiple requestAnimationFrame calls to ensure visibility updates after smooth scroll completes
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          setScrollButtonVisibility();
        });
      });
    });
  }, [scrollRootRef, setScrollButtonVisibility]);

  const scrollToBottom = useCallback(() => {
    const root = scrollRootRef?.current ?? null;
    const section = thisComponentRef.current;
    if (!root || !section) return;

    const rootRect = root.getBoundingClientRect();
    const sectionRect = section.getBoundingClientRect();

    const delta = sectionRect.bottom - rootRect.bottom + 8;
    root.scrollBy({ top: delta, behavior: "smooth" });
    // Use multiple requestAnimationFrame calls to ensure visibility updates after smooth scroll completes
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          setScrollButtonVisibility();
        });
      });
    });
  }, [scrollRootRef, setScrollButtonVisibility]);

  // Scroll to placeholder when execution completes
  useEffect(() => {
    if (queryResponse !== undefined && !isExecuting && scrollPlaceholderRef.current) {
      // Use requestAnimationFrame to wait for DOM to render, then scroll smoothly
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          if (scrollPlaceholderRef.current) {
            scrollPlaceholderRef.current.scrollIntoView({ block: "end", behavior: "smooth" });
          }
        });
      });
    }
  }, [queryResponse, isExecuting]);

  // Add scroll event listener to update button visibility when scrolling while hovering
  useEffect(() => {
    const root = scrollRootRef?.current;
    if (!root) return;

    const handleScroll = () => {
      if (isHoveringRef.current) {
        setScrollButtonVisibility();
      }
    };

    root.addEventListener("scroll", handleScroll, { passive: true });
    return () => {
      root.removeEventListener("scroll", handleScroll);
    };
  }, [scrollRootRef, setScrollButtonVisibility]);

  // Handle query deletion - cancel if executing, then delete
  const handleDelete = () => {
    if (isExecuting) {
      cancelQuery(queryRequest.queryId);
    }
    if (onQueryDelete) {
      onQueryDelete(queryRequest.queryId);
    }
  };

  const renderQueryRequest = () => {
    if (queryRequest.showRequest === "hide") {
      return null;
    }

    if (queryRequest.showRequest === "collapse") {
      return (
        <Collapsible open={!collapsed} onOpenChange={(open) => setCollapsed(!open)}>
          <div className="flex items-center gap-2 mb-2">
            <CollapsibleTrigger asChild>
              <Button variant="ghost" size="sm">
                {collapsed ? (
                  <ChevronDown className="h-4 w-4" />
                ) : (
                  <ChevronUp className="h-4 w-4" />
                )}
              </Button>
            </CollapsibleTrigger>
          </div>
          <CollapsibleContent>
            <QueryRequestView queryRequest={queryRequest} />
          </CollapsibleContent>
        </Collapsible>
      );
    }

    return <QueryRequestView queryRequest={queryRequest} />;
  };

  return (
    <div
      ref={thisComponentRef}
      className={`relative group/query-item pl-2 py-3 ${isFirst ? "" : "border-t"}`}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
    >
      {/* Floating buttons positioned at the visible viewport edges */}
      <div
        ref={scrollUpButtonWrapperRef}
        className="pointer-events-none absolute left-1/2 z-20"
        style={{ display: "none", bottom: 0, transform: "translateX(-50%)" }}
      >
        <Button
          variant="ghost"
          size="sm"
          type="button"
          title="Scroll up"
          className="h-6 w-6 rounded-full bg-accent transition-opacity pointer-events-auto"
          onClick={scrollToTop}
        >
          <ChevronUp className="h-4 w-4" />
        </Button>
      </div>

      <div
        ref={scrollDownButtonWrapperRef}
        className="pointer-events-none absolute left-1/2 z-20"
        style={{ display: "none", top: 0, transform: "translateX(-50%)" }}
      >
        <Button
          variant="ghost"
          size="icon"
          type="button"
          title="Scroll down"
          className="h-6 w-6 rounded-full bg-accent transition-opacity pointer-events-auto"
          onClick={scrollToBottom}
        >
          <ChevronDown className="h-4 w-4" />
        </Button>
      </div>

      {/* Header */}
      <div className="flex items-center gap-2 mb-1">
        <h4 className="text-sm font-semibold text-muted-foreground">{timestamp}</h4>
        {!isExecuting && onQueryDelete && (
          <Button
            ref={deleteButtonRef}
            variant="ghost"
            size="icon"
            className="h-5 w-5 transition-opacity"
            style={{ opacity: 0, pointerEvents: "none" }}
            onClick={handleDelete}
          >
            <X className="h-4 w-4" />
          </Button>
        )}
      </div>

      {/* Query Request */}
      {renderQueryRequest()}

      {/* Query Response */}
      {queryResponse &&
        (queryResponse.data !== undefined || queryResponse.message !== undefined) && (
          <QueryResponseView
            queryResponse={queryResponse}
            queryRequest={queryRequest}
            sql={queryRequest.sql}
            view={view as QueryViewType}
            tabId={tabId}
          />
        )}

      <div className="flex items-center gap-2 mt-1">
        <QueryExecutionTimer isExecuting={isExecuting} />
        {isExecuting && (
          <Button
            variant="ghost"
            size="sm"
            className="h-6 text-xs rounded-sm text-destructive"
            onClick={() => cancelQuery(queryRequest.queryId)}
          >
            <Square className="!h-3 !w-3" /> Click to cancel execution
          </Button>
        )}
      </div>

      {/* Query Status */}
      <div ref={scrollPlaceholderRef} className="flex flex-col">
        {queryResponse && (queryResponse.queryId || queryRequest.queryId) && (
          <QueryIdButton
            queryId={queryResponse.queryId || queryRequest.queryId}
            traceId={queryRequest.traceId}
          />
        )}
        {/* <div className="text-xs text-muted-foreground">Request Server: {queryRequest.requestServer}</div> */}
        {queryResponse?.httpHeaders?.["x-clickhouse-server-display-name"] && (
          <div className="text-xs text-muted-foreground">
            Server: {queryResponse.httpHeaders["x-clickhouse-server-display-name"]}
          </div>
        )}
        <QuerySummary summaryText={queryResponse?.httpHeaders?.["x-clickhouse-summary"]} />
      </div>
    </div>
  );
}
