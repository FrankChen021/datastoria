import { cn } from "@/lib/utils";
import { ChevronRight, CircleX, SquareTerminal, Wrench } from "lucide-react";
import { useEffect, useRef, useState } from "react";

export const RUNNING_TEXT_CLASS =
  "animate-tool-call-text-shimmer bg-[linear-gradient(100deg,color-mix(in_oklch,var(--muted-foreground)_62%,transparent)_0%,var(--foreground)_24%,color-mix(in_oklch,var(--muted-foreground)_62%,transparent)_48%)] bg-[length:220%_100%] [background-position:140%_0] bg-clip-text text-transparent motion-reduce:animate-none motion-reduce:bg-none motion-reduce:text-muted-foreground";

function formatElapsedTime(seconds: number): string {
  if (seconds < 60) {
    return `${seconds}s`;
  }

  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = seconds % 60;
  return `${minutes}m ${remainingSeconds.toString().padStart(2, "0")}s`;
}

export function Timer({ isRunning }: { isRunning: boolean }) {
  const [elapsedSeconds, setElapsedSeconds] = useState<number | null>(null);

  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (isRunning) {
      const now = Date.now();
      setElapsedSeconds(null);

      intervalRef.current = setInterval(() => {
        const elapsed = Math.floor((Date.now() - now) / 1000);
        setElapsedSeconds(elapsed > 0 ? elapsed : null);
      }, 1000);
    } else {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    }

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    };
  }, [isRunning]);

  if (elapsedSeconds === null) {
    return null;
  }

  const formattedTime = formatElapsedTime(elapsedSeconds);

  return (
    <span
      className={cn(
        "text-left text-xs tabular-nums text-muted-foreground",
        elapsedSeconds < 60 ? "min-w-[3ch]" : "min-w-[6ch]"
      )}
    >
      {formattedTime}
    </span>
  );
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
  const isCollapsible = Boolean(children);
  const headerClassName = cn(
    "group flex w-fit items-center rounded-md px-1.5 py-1 text-left text-muted-foreground transition-colors hover:bg-muted/30 hover:text-foreground",
    isExpanded ? "bg-muted/30 text-foreground" : "",
    isCollapsible
      ? "cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1"
      : ""
  );
  const headerContent = (
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
      <span className={cn("font-medium", isActuallyRunning && RUNNING_TEXT_CLASS)}>{toolName}</span>
      {headerExtra ? (
        <span className="max-w-[360px] truncate text-sm font-medium">{headerExtra}</span>
      ) : null}
      {statusText && <span className="text-sm text-muted-foreground">{statusText}</span>}
      <Timer isRunning={isActuallyRunning} />
      {isCollapsible && (
        <ChevronRight
          className={cn(
            "h-4 w-4 text-muted-foreground opacity-0 transition-all group-hover:opacity-100",
            isExpanded ? "rotate-90 opacity-100" : ""
          )}
        />
      )}
    </div>
  );

  return (
    <div className="flex flex-col overflow-hidden">
      {isCollapsible ? (
        <button
          type="button"
          className={headerClassName}
          onClick={() => setIsExpanded((current) => !current)}
          aria-expanded={isExpanded}
        >
          {headerContent}
        </button>
      ) : (
        <div className={headerClassName}>{headerContent}</div>
      )}
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
