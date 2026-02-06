import { Formatter } from "@/lib/formatter";
import { cn } from "@/lib/utils";
import { Check, ChevronDown, ChevronRight, CircleX, Loader2 } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Badge } from "../../ui/badge";

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
        setFormattedTime(Formatter.getInstance().milliFormat(elapsed, 2));
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

  return <span className="text-xs text-muted-foreground text-[10px]">{formattedTime}</span>;
}

/**
 * Render a collapsible tool section with timing tracking
 */
export function CollapsiblePart({
  toolName,
  children,
  defaultExpanded = false,
  state,
  keepChildrenMounted = false,
  success,
  isRunning = true,
}: {
  toolName: string;
  children?: React.ReactNode;
  defaultExpanded?: boolean;
  state?: string;
  keepChildrenMounted?: boolean;
  success?: boolean;
  isRunning?: boolean;
}) {
  const [isExpanded, setIsExpanded] = useState(defaultExpanded);

  useEffect(() => {
    setIsExpanded(defaultExpanded);
  }, [defaultExpanded]);

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
    <div className="flex flex-col mt-0 overflow-hidden">
      <div
        className={cn(
          "flex items-center hover:bg-muted/50 transition-colors w-fit pr-2 rounded-sm",
          isExpanded ? "bg-muted/50" : "",
          children ? "cursor-pointer" : ""
        )}
        onClick={() => setIsExpanded(!isExpanded)}
      >
        <div className="flex items-center gap-2 py-0.5 text-[10px]">
          {isComplete ? (
            isError ? (
              <CircleX className="h-3 w-3 text-destructive" />
            ) : (
              <Check className="h-3 w-3" />
            )
          ) : isActuallyRunning ? (
            <Loader2 className="h-3 w-3 animate-spin" />
          ) : (
            <CircleX className="h-3 w-3 text-destructive" />
          )}
          <Badge className="flex items-center gap-0.5 rounded-sm border-none pl-1 pr-2 h-4 py-0 font-normal text-[10px]">
            {children &&
              (isExpanded ? (
                <ChevronDown className="h-3 w-3" />
              ) : (
                <ChevronRight className="h-3 w-3" />
              ))}
            {toolName}
          </Badge>
          {statusText && <span className="text-muted-foreground">{statusText}</span>}
          <Timer isRunning={isActuallyRunning} />
        </div>
      </div>
      {(isExpanded || keepChildrenMounted) && (
        <div
          className={cn(
            "pl-3 border-l ml-1.5 border-muted/50 transition-all",
            children ? "mb-1" : ""
          )}
          style={keepChildrenMounted && !isExpanded ? { display: "none" } : undefined}
        >
          {isComplete ? children : children ? children : "running"}
        </div>
      )}
    </div>
  );
}
