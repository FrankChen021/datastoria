import type { StatDescriptor } from "@/components/dashboard/chart-utils";
import DashboardContainer, { type DashboardContainerRef } from "@/components/dashboard/dashboard-container";
import type { Dashboard } from "@/components/dashboard/dashboard-model";
import type { TimeSpan } from "@/components/dashboard/timespan-selector";
import { forwardRef, memo, useImperativeHandle, useMemo, useRef, useState } from "react";

import type { RefreshableTabViewRef } from "./table-tab";

export interface PartLogViewProps {
  database: string;
  table: string;
  autoLoad?: boolean;
}

const PartLogViewComponent = forwardRef<RefreshableTabViewRef, PartLogViewProps>(({ database, table }, ref) => {
  const [selectedTimeSpan, setSelectedTimeSpan] = useState<TimeSpan | undefined>(undefined);
  const dashboardContainerRef = useRef<DashboardContainerRef>(null);

  useImperativeHandle(
    ref,
    () => ({
      refresh: (timeSpan?: TimeSpan) => {
        if (timeSpan) {
          setSelectedTimeSpan(timeSpan);
          // Use the provided timeSpan for refresh immediately
          setTimeout(() => {
            dashboardContainerRef.current?.refresh(timeSpan);
          }, 10);
        } else {
          // Use current selectedTimeSpan or trigger refresh with undefined
          setTimeout(() => {
            dashboardContainerRef.current?.refresh(selectedTimeSpan);
          }, 10);
        }
      },
      supportsTimeSpanSelector: true,
    }),
    [selectedTimeSpan]
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
          isCollapsed: false,
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
          isCollapsed: false,
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
          isCollapsed: false,
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
          isCollapsed: false,
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

  return (
    <DashboardContainer
      ref={dashboardContainerRef}
      dashboard={dashboard}
      hideTimeSpanSelector={true}
      externalTimeSpan={selectedTimeSpan}
    />
  );
});

PartLogViewComponent.displayName = "PartLogView";

export const PartLogView = memo(PartLogViewComponent);
