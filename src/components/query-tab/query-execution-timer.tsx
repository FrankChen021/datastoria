import { Formatter } from "@/lib/formatter";
import { useEffect, useRef, useState } from "react";

interface QueryExecutionTimerProps {
  isExecuting: boolean;
}

export function QueryExecutionTimer({ isExecuting }: QueryExecutionTimerProps) {
  const [formattedTime, setFormattedTime] = useState("");
  // Store startTime in state as requested, though we use the captured 'now' value in the interval
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const [_, setStartTime] = useState<number | null>(null);
  const intervalRef = useRef<number | null>(null);
  const formatter = Formatter.getInstance().getFormatter("millisecond");

  useEffect(() => {
    if (isExecuting) {
      // Start timing
      const now = Date.now();
      setStartTime(now);
      const initialFormatted = formatter(0);
      setFormattedTime(typeof initialFormatted === "string" ? initialFormatted : String(initialFormatted));

      // Update every 100ms
      // Use the captured 'now' value directly since state updates are async
      intervalRef.current = setInterval(() => {
        const elapsed = Date.now() - now;
        const formatted = formatter(elapsed);
        setFormattedTime(typeof formatted === "string" ? formatted : String(formatted));
      }, 100);
    } else {
      // Stop timing
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
      setStartTime(null);
    }

    // Cleanup on unmount or when isExecuting changes
    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isExecuting]);

  if (!isExecuting) {
    return null;
  }

  return (
    <span className="text-sm text-muted-foreground">
      {" "}
      {formattedTime}
    </span>
  );
}

