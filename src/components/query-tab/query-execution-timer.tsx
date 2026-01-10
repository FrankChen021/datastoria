import { Loader2 } from "lucide-react";
import { useEffect, useRef, useState } from "react";

interface QueryExecutionTimerProps {
  isExecuting: boolean;
}

export function QueryExecutionTimer({ isExecuting }: QueryExecutionTimerProps) {
  const [formattedTime, setFormattedTime] = useState("00:00.000");
  // Store startTime in state as requested, though we use the captured 'now' value in the interval

  const [_, setStartTime] = useState<number | null>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Format time as MM:SS.mmm for fixed width
  const formatTime = (milliseconds: number): string => {
    const totalSeconds = Math.floor(milliseconds / 1000);
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    const ms = milliseconds % 1000;

    return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}.${String(ms).padStart(3, "0")}`;
  };

  useEffect(() => {
    if (isExecuting) {
      // Start timing
      const now = Date.now();
      setStartTime(now);
      setFormattedTime(formatTime(0));

      // Update every 100ms
      // Use the captured 'now' value directly since state updates are async
      intervalRef.current = setInterval(() => {
        const elapsed = Date.now() - now;
        setFormattedTime(formatTime(elapsed));
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
  }, [isExecuting]);

  return (
    <div className="flex items-center gap-1.5">
      {isExecuting && <Loader2 className="!h-3 !w-3 animate-spin text-muted-foreground" />}
      <span className="text-xs text-muted-foreground">Elapsed: </span>
      <span className="text-xs text-muted-foreground font-mono">{formattedTime}</span>
    </div>
  );
}
