import { cn } from "@/lib/utils";
import { Check, ChevronDown, ChevronRight, CircleX, Loader2 } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Badge } from "../../ui/badge";

/**
 * Render a collapsible tool section with timing tracking
 */
export function CollapsiblePart({
  toolName,
  children,
  defaultExpanded = false,
  state,
  keepChildrenMounted = false,
}: {
  toolName: string;
  children?: React.ReactNode;
  defaultExpanded?: boolean;
  state?: string;
  keepChildrenMounted?: boolean;
}) {
  const [isExpanded, setIsExpanded] = useState(defaultExpanded);
  const [duration, setDuration] = useState<number | null>(null);
  const startTimeRef = useRef<number | null>(null);
  const prevStateRef = useRef<string | undefined>(state);

  useEffect(() => {
    setIsExpanded(defaultExpanded);
  }, [defaultExpanded]);

  // Track timing when state changes
  useEffect(() => {
    const prevState = prevStateRef.current;
    prevStateRef.current = state;

    // Start timing when tool becomes available (input-available means tool is running)
    if (prevState !== "input-available" && state === "input-available") {
      startTimeRef.current = Date.now();
      setDuration(null);
    }

    // Calculate duration when tool completes
    if ((state === "output-available" || state === "done") && startTimeRef.current !== null) {
      const endTime = Date.now();
      const durationMs = endTime - startTimeRef.current;
      setDuration(durationMs);
      startTimeRef.current = null;
    }
  }, [state]);

  // Determine if tool is complete
  const isError = state?.includes("error") || state === "output-error";
  const isComplete = state === "output-available" || state === "done" || isError;

  // Get status text based on state
  const getStatusText = () => {
    if (state === "input-streaming") return "receiving input...";
    if (state === "input-available") return "running...";
    if (state === "output-available" && duration !== null) {
      // Format duration
      if (duration < 1000) {
        return `${duration}ms`;
      }
      return `${(duration / 1000).toFixed(2)}s`;
    }
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
          ) : (
            <Loader2 className="h-3 w-3 animate-spin" />
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
          {statusText && <span className="text-muted-foreground">- {statusText}</span>}
        </div>
      </div>
      {(isExpanded || keepChildrenMounted) && (
        <div
          className="pl-3 border-l ml-1.5 mb-1 border-muted/50 transition-all"
          style={keepChildrenMounted && !isExpanded ? { display: "none" } : undefined}
        >
          {isComplete ? children : children ? children : "running..."}
        </div>
      )}
    </div>
  );
}
