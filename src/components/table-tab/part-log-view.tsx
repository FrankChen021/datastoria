import type { StatDescriptor } from "@/components/dashboard/dashboard-model";
import type { Dashboard } from "@/components/dashboard/dashboard-model";
import DashboardPanels, { type DashboardPanelsRef } from "@/components/dashboard/dashboard-panels";
import type { TimeSpan } from "@/components/dashboard/timespan-selector";
import { BUILT_IN_TIME_SPAN_LIST } from "@/components/dashboard/timespan-selector";
import { forwardRef, memo, useImperativeHandle, useMemo, useRef, useState } from "react";

import type { RefreshableTabViewRef } from "./table-tab";

export interface PartLogViewProps {
  database: string;
  table: string;
  autoLoad?: boolean;
}

const PartLogViewComponent = forwardRef<RefreshableTabViewRef, PartLogViewProps>(({ database, table }, ref) => {
  const [selectedTimeSpan, setSelectedTimeSpan] = useState<TimeSpan | undefined>(undefined);
  const dashboardPanelsRef = useRef<DashboardPanelsRef>(null);
  const defaultTimeSpan = useMemo(() => BUILT_IN_TIME_SPAN_LIST[3].getTimeSpan(), []);

  // Calculate current time span (use selected if available, otherwise default)
  const currentTimeSpan = selectedTimeSpan ?? defaultTimeSpan;

  useImperativeHandle(
    ref,
    () => ({
      refresh: (timeSpan?: TimeSpan) => {
        if (timeSpan) {
          // Update state - prop change will trigger automatic refresh in DashboardPanels
          setSelectedTimeSpan(timeSpan);
        } else {
          // No timeSpan provided - explicitly refresh with current time span
          // This handles the case when clicking refresh without changing the time range
          setTimeout(() => {
            dashboardPanelsRef.current?.refresh(currentTimeSpan);
          }, 10);
        }
      },
      supportsTimeSpanSelector: true,
    }),
    [currentTimeSpan]
  );

  // Create dashboard with the stat chart
  const dashboard = useMemo<Dashboard>(() => {
    return {
      name: `part-log-${database}-${table}`,
      folder: "",
      title: "Part Log",
      filter: {
        showFilterInput: false,
        showTimeSpanSelector: false,
        showRefresh: false,
        showAutoRefresh: false,
      },
      charts: [
        {
          type: "stat",
          id: `merge-count-${database}-${table}`,
          titleOption: {
            title: "Number of Merges",
            align: "center",
          },
          collapsed: false,
          width: 2,
          minimapOption: {
            type: "line",
          },
          valueOption: {
            reducer: "sum",
            align: "center",
            format: "comma_number",
          },
          query: {
            sql: `
SELECT 
toStartOfInterval(event_time, INTERVAL {rounding:UInt32} SECOND)::INT as t,
count()
FROM system.part_log
WHERE 
    event_date >= toDate(fromUnixTimestamp({startTimestamp:UInt32})) 
    AND event_date <= toDate(fromUnixTimestamp({endTimestamp:UInt32}))
    AND event_time >= fromUnixTimestamp({startTimestamp:UInt32})
    AND event_time < fromUnixTimestamp({endTimestamp:UInt32})
    AND database = '${database}'
    AND table = '${table}'
    AND event_type = 'MergeParts'
GROUP BY t
ORDER BY t
WITH FILL STEP {rounding:UInt32}
`,
            headers: {
              "Content-Type": "text/plain",
            },
          },
        } as StatDescriptor,

        {
          type: "stat",
          id: `mutation-count-${database}-${table}`,
          titleOption: {
            title: "Number of Mutations",
            align: "center",
          },
          collapsed: false,
          width: 2,
          minimapOption: {
            type: "line",
          },
          valueOption: {
            reducer: "sum",
            align: "center",
            format: "comma_number",
          },
          query: {
            sql: `
SELECT 
toStartOfInterval(event_time, INTERVAL {rounding:UInt32} SECOND)::INT as t,
count()
FROM system.part_log
WHERE 
    event_date >= toDate(fromUnixTimestamp({startTimestamp:UInt32})) 
    AND event_date <= toDate(fromUnixTimestamp({endTimestamp:UInt32}))
    AND event_time >= fromUnixTimestamp({startTimestamp:UInt32})
    AND event_time < fromUnixTimestamp({endTimestamp:UInt32})
    AND database = '${database}'
    AND table = '${table}'
    AND event_type = 'MutatePart'
GROUP BY t
ORDER BY t
WITH FILL STEP {rounding:UInt32}
`,
            headers: {
              "Content-Type": "text/plain",
            },
          },
        } as StatDescriptor,

        {
          type: "stat",
          id: `new-part-count-${database}-${table}`,
          titleOption: {
            title: "Number of New Part",
            align: "center",
          },
          collapsed: false,
          width: 2,
          minimapOption: {
            type: "line",
          },
          valueOption: {
            reducer: "sum",
            align: "center",
            format: "comma_number",
          },
          query: {
            sql: `
SELECT 
toStartOfInterval(event_time, INTERVAL {rounding:UInt32} SECOND)::INT as t,
count()
FROM system.part_log
WHERE 
    event_date >= toDate(fromUnixTimestamp({startTimestamp:UInt32})) 
    AND event_date <= toDate(fromUnixTimestamp({endTimestamp:UInt32}))
    AND event_time >= fromUnixTimestamp({startTimestamp:UInt32})
    AND event_time < fromUnixTimestamp({endTimestamp:UInt32})
    AND database = '${database}'
    AND table = '${table}'
    AND event_type = 'NewPart'
GROUP BY t
ORDER BY t
WITH FILL STEP {rounding:UInt32}
`,
            headers: {
              "Content-Type": "text/plain",
            },
          },
        } as StatDescriptor,

        {
          type: "stat",
          id: `new-part-count-${database}-${table}`,
          titleOption: {
            title: "Number of Removed Parts",
            align: "center",
          },
          collapsed: false,
          width: 2,
          minimapOption: {
            type: "line",
          },
          valueOption: {
            reducer: "sum",
            align: "center",
            format: "comma_number",
          },
          query: {
            sql: `
SELECT 
toStartOfInterval(event_time, INTERVAL {rounding:UInt32} SECOND)::INT as t,
count()
FROM system.part_log
WHERE 
    event_date >= toDate(fromUnixTimestamp({startTimestamp:UInt32})) 
    AND event_date <= toDate(fromUnixTimestamp({endTimestamp:UInt32}))
    AND event_time >= fromUnixTimestamp({startTimestamp:UInt32})
    AND event_time < fromUnixTimestamp({endTimestamp:UInt32})
    AND database = '${database}'
    AND table = '${table}'
    AND event_type = 'RemovePart'
GROUP BY t
ORDER BY t
WITH FILL STEP {rounding:UInt32}
`,
            headers: {
              "Content-Type": "text/plain",
            },
          },
        } as StatDescriptor,
      ],
    };
  }, [database, table]);

  return <DashboardPanels ref={dashboardPanelsRef} dashboard={dashboard} selectedTimeSpan={currentTimeSpan} />;
});

PartLogViewComponent.displayName = "PartLogView";

export const PartLogView = memo(PartLogViewComponent);
