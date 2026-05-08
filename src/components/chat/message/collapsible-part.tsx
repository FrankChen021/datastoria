import { cn } from "@/lib/utils";
import { ChevronRight, CircleX, SquareTerminal, Wrench } from "lucide-react";
import { useEffect, useRef, useState } from "react";

export const RUNNING_TEXT_CLASS =
  "animate-tool-call-text-shimmer bg-[linear-gradient(100deg,color-mix(in_oklch,var(--muted-foreground)_62%,transparent)_0%,var(--foreground)_24%,color-mix(in_oklch,var(--muted-foreground)_62%,transparent)_48%)] bg-[length:220%_100%] [background-position:140%_0] bg-clip-text text-transparent motion-reduce:animate-none motion-reduce:bg-none motion-reduce:text-muted-foreground";

export function Timer({ isRunning }: { isRunning: boolean }) {
  const [formattedTime, setFormattedTime] = useState("");

  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (isRunning) {
      // Start timing
      const now = Date.now();

      // Update every 100ms
      // Use the captured 'now' value directly since state updates are async
      intervalRef.current = setInterval(() => {
        const elapsed = Date.now() - now;
        setFormattedTime(`${(elapsed / 1000).toFixed(1)}s`);
      }, 100);
    } else {
      // Stop timing
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    }

    // Cleanup on unmount or when isExecuting changes
    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    };
  }, [isRunning]);

  return <span className="text-xs text-muted-foreground">{formattedTime}</span>;
}

/**
 * Render a collapsible tool section with timing tracking
 */
export function CollapsiblePart({
  toolName,
  headerExtra,
  children,
  defaultExpanded = false,
  state,
  keepChildrenMounted = false,
  success,
  isRunning = true,
  showStatusIcon = true,
  expandIncomplete = true,
}: {
  toolName: string;
  headerExtra?: React.ReactNode;
  children?: React.ReactNode;
  defaultExpanded?: boolean;
  state?: string;
  keepChildrenMounted?: boolean;
  success?: boolean;
  isRunning?: boolean;
  showStatusIcon?: boolean;
  expandIncomplete?: boolean;
}) {
  const [isExpanded, setIsExpanded] = useState(defaultExpanded);

  useEffect(() => {
    setIsExpanded(defaultExpanded);
  }, [defaultExpanded]);

  useEffect(() => {
    if (!expandIncomplete) {
      return;
    }

    setIsExpanded(defaultExpanded || state !== "output-available");
  }, [defaultExpanded, expandIncomplete, state]);

  // Determine if tool is complete
  // Use external success value if provided, otherwise use state-based logic
  const isError =
    success !== undefined ? !success : state?.includes("error") || state === "output-error";
  const isComplete = state === "output-available" || state === "done" || isError;

  // If streaming stopped and tool is not complete, treat it as stopped (no timer, no spinner)
  const isActuallyRunning = !isComplete && isRunning;

  // Get status text based on state
  const getStatusText = () => {
    if (!isRunning) return null; // Don't show status text when streaming stopped
    if (state === "input-streaming") return "receiving input...";
    if (state === "input-available") return "running...";
    return null;
  };

  const statusText = getStatusText();

  return (
    <div className="flex flex-col overflow-hidden">
      <div
        className={cn(
          "group flex w-fit items-center rounded-md px-1.5 py-1 text-muted-foreground transition-colors hover:bg-muted/30 hover:text-foreground",
          isExpanded ? "bg-muted/30 text-foreground" : "",
          children ? "cursor-pointer" : ""
        )}
        onClick={() => setIsExpanded(!isExpanded)}
      >
        <div className="flex items-center gap-2 text-sm leading-5">
          {showStatusIcon && (
            <>
              {isError || (!isComplete && !isActuallyRunning) ? (
                <CircleX className="h-3.5 w-3.5 text-destructive" />
              ) : (
                <Wrench className="h-4 w-4" />
              )}
            </>
          )}
          {!showStatusIcon && <SquareTerminal className="h-4 w-4" />}
          <span className={cn("font-medium", isActuallyRunning && RUNNING_TEXT_CLASS)}>
            {toolName}
          </span>
          {headerExtra ? (
            <span className="max-w-[360px] truncate text-sm font-medium">
              {headerExtra}
            </span>
          ) : null}
          {statusText && <span className="text-sm text-muted-foreground">{statusText}</span>}
          <Timer isRunning={isActuallyRunning} />
          {children && (
            <ChevronRight
              className={cn(
                "h-4 w-4 text-muted-foreground opacity-0 transition-all group-hover:opacity-100",
                isExpanded ? "rotate-90 opacity-100" : ""
              )}
            />
          )}
        </div>
      </div>
      {(isExpanded || keepChildrenMounted) && (
        <div
          className={cn(
            "ml-3 border-l border-muted/50 pl-4 transition-all",
            children ? "mb-1" : ""
          )}
          style={keepChildrenMounted && !isExpanded ? { display: "none" } : undefined}
        >
          {children}
        </div>
      )}
    </div>
  );
}
