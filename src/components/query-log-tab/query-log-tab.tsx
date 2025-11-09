import { BUILT_IN_TIME_SPAN_LIST, DisplayTimeSpan } from "@/components/dashboard/timespan-selector";
import { QueryLogView } from "@/components/query-log-tab/query-log-view";
import { DateTimeExtension } from "@/lib/datetime-utils";
import { endOfDay, parseISO, startOfDay } from "date-fns";
import { useCallback, useEffect, useMemo, useState } from "react";

interface QueryLogTabProps {
  initialQueryId?: string;
  initialEventDate?: string;
}

// Helper function to create a DisplayTimeSpan for a specific date
function createTimeSpanForDate(eventDate: string): DisplayTimeSpan {
  try {
    // Try to parse the eventDate - it might be in various formats
    let date: Date;
    if (eventDate.includes("T") || eventDate.includes(" ")) {
      // ISO format or date-time format
      date = parseISO(eventDate);
    } else {
      // Date only format (YYYY-MM-DD)
      date = parseISO(eventDate + "T00:00:00");
    }

    if (isNaN(date.getTime())) {
      // If parsing fails, fall back to default
      return BUILT_IN_TIME_SPAN_LIST[12]; // "Today"
    }

    const start = startOfDay(date);
    const end = endOfDay(date);
    const startISO = DateTimeExtension.formatISO8601(start) || "";
    const endISO = DateTimeExtension.formatISO8601(end) || "";
    const label = DateTimeExtension.toYYYYMMddHHmmss(start).split(" ")[0]; // Just the date part

    return new DisplayTimeSpan(label, "user", "unit", true, startISO, endISO);
  } catch {
    // If any error occurs, fall back to default
    return BUILT_IN_TIME_SPAN_LIST[12]; // "Today"
  }
}

export function QueryLogTab({ initialQueryId, initialEventDate }: QueryLogTabProps = {}) {
  const [activeQueryId, setActiveQueryId] = useState<string | undefined>(initialQueryId);

  // Create initial time span based on eventDate if provided, otherwise default to "Today"
  const initialTimeSpan = useMemo(() => {
    if (initialEventDate) {
      return createTimeSpanForDate(initialEventDate);
    }
    return BUILT_IN_TIME_SPAN_LIST[12]; // Default to "Today"
  }, [initialEventDate]);

  const [selectedTimeSpan, setSelectedTimeSpan] = useState<DisplayTimeSpan>(initialTimeSpan);

  // Update activeQueryId when initialQueryId changes (e.g., when tab becomes active with a new query ID)
  useEffect(() => {
    if (initialQueryId) {
      setActiveQueryId(initialQueryId);
    }
  }, [initialQueryId]);

  // Update time span when initialEventDate changes
  useEffect(() => {
    if (initialEventDate) {
      const newTimeSpan = createTimeSpanForDate(initialEventDate);
      setSelectedTimeSpan(newTimeSpan);
    }
  }, [initialEventDate]);

  const handleQueryIdChange = useCallback((queryId: string | undefined) => {
    setActiveQueryId(queryId);
  }, []);

  const handleTimeSpanChange = useCallback((timeSpan: DisplayTimeSpan) => {
    setSelectedTimeSpan(timeSpan);
  }, []);

  return (
    <div className="h-full w-full flex flex-col">
      <QueryLogView
        queryId={activeQueryId}
        embedded={true}
        onQueryIdChange={handleQueryIdChange}
        initialTimeSpan={selectedTimeSpan}
        onTimeSpanChange={handleTimeSpanChange}
        initialEventDate={initialEventDate}
      />
    </div>
  );
}
