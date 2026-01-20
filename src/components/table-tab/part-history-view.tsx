import type {
  Dashboard,
  StatDescriptor,
  TableDescriptor,
} from "@/components/shared/dashboard/dashboard-model";
import DashboardPanelContainer, {
  type DashboardPanelContainerRef,
} from "@/components/shared/dashboard/dashboard-panel-container";
import {
  BUILT_IN_TIME_SPAN_LIST,
  type TimeSpan,
} from "@/components/shared/dashboard/timespan-selector";
import { forwardRef, memo, useImperativeHandle, useMemo, useRef, useState } from "react";
import type { RefreshableTabViewRef } from "./table-tab";

export interface PartHistoryViewProps {
  database: string;
  table: string;
  autoLoad?: boolean;
}

const PartHistoryView = memo(
  forwardRef<RefreshableTabViewRef, PartHistoryViewProps>(({ database, table }, ref) => {
    const [selectedTimeSpan, setSelectedTimeSpan] = useState<TimeSpan | undefined>(undefined);
    const dashboardPanelsRef = useRef<DashboardPanelContainerRef>(null);
    const defaultTimeSpan = useMemo(() => BUILT_IN_TIME_SPAN_LIST[3].getTimeSpan(), []);

    // Calculate current time span (use selected if available, otherwise default)
    const currentTimeSpan = selectedTimeSpan ?? defaultTimeSpan;

    useImperativeHandle(
      ref,
      () => ({
        refresh: (timeSpan?: TimeSpan) => {
          if (timeSpan) {
            // Update state - prop change will trigger automatic refresh in DashboardPanelContainer
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
        name: `part-history-${database}-${table}`,
        folder: "",
        title: "Part History",
        filter: {
          showTimeSpanSelector: false,
          showRefresh: false,
          showAutoRefresh: false,
        },
        charts: [
          //
          // New Part
          //
          {
            type: "stat",
            titleOption: {
              title: "New Part",
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
            },

            drilldown: {
              main: {
                type: "table",
                titleOption: {
                  title: "New Part Log",
                },
                query: {
                  sql: `
                SELECT * FROM system.part_log WHERE database = '${database}' AND table = '${table}'
                AND 
                    event_date >= toDate(fromUnixTimestamp({startTimestamp:UInt32})) 
                    AND event_date <= toDate(fromUnixTimestamp({endTimestamp:UInt32}))
                    AND event_time >= fromUnixTimestamp({startTimestamp:UInt32})
                    AND event_time < fromUnixTimestamp({endTimestamp:UInt32})
                    AND event_type = 'NewPart'
                ORDER BY event_time DESC
                `,
                },
                sortOption: {
                  initialSort: {
                    column: "event_time",
                    direction: "desc",
                  },
                  serverSideSorting: true,
                },
                miscOption: {
                  enableCompactMode: true,
                  enableIndexColumn: true,
                },
                pagination: {
                  mode: "server",
                  pageSize: 100,
                },
              } as TableDescriptor,
              minimap: {
                type: "table",
                titleOption: {
                  title: "Merge Log",
                },
                query: {
                  sql: `
                SELECT * FROM system.part_log WHERE database = '${database}' AND table = '${table}'
                AND 
                    event_date >= toDate(fromUnixTimestamp({startTimestamp:UInt32})) 
                    AND event_date <= toDate(fromUnixTimestamp({endTimestamp:UInt32}))
                    AND event_time >= fromUnixTimestamp({startTimestamp:UInt32})
                    AND event_time < fromUnixTimestamp({endTimestamp:UInt32})
                    AND event_type = 'NewPart'
                ORDER BY event_time DESC
                `,
                },
                sortOption: {
                  initialSort: {
                    column: "event_time",
                    direction: "desc",
                  },
                },
              } as TableDescriptor,
            },
          } as StatDescriptor,

          //
          // Download Part
          //
          {
            type: "stat",
            titleOption: {
              title: "Replication Part",
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
    AND event_type = 'DownloadPart'
GROUP BY t
ORDER BY t
WITH FILL STEP {rounding:UInt32}
`,
            },

            drilldown: {
              main: {
                type: "table",
                titleOption: {
                  title: "Replicate Part Log",
                },
                query: {
                  sql: `
                SELECT * FROM system.part_log WHERE database = '${database}' AND table = '${table}'
                AND 
                    event_date >= toDate(fromUnixTimestamp({startTimestamp:UInt32})) 
                    AND event_date <= toDate(fromUnixTimestamp({endTimestamp:UInt32}))
                    AND event_time >= fromUnixTimestamp({startTimestamp:UInt32})
                    AND event_time < fromUnixTimestamp({endTimestamp:UInt32})
                    AND event_type = 'DownloadPart'
                ORDER BY event_time DESC
                `,
                },
                sortOption: {
                  initialSort: {
                    column: "event_time",
                    direction: "desc",
                    serverSideSorting: true,
                  },
                },
                miscOption: {
                  enableCompactMode: true,
                  enableIndexColumn: true,
                },
                pagination: {
                  mode: "server",
                  pageSize: 100,
                },
              } as TableDescriptor,
              minimap: {
                type: "table",
                titleOption: {
                  title: "Merge Log",
                },
                query: {
                  sql: `
                SELECT * FROM system.part_log WHERE database = '${database}' AND table = '${table}'
                AND 
                    event_date >= toDate(fromUnixTimestamp({startTimestamp:UInt32})) 
                    AND event_date <= toDate(fromUnixTimestamp({endTimestamp:UInt32}))
                    AND event_time >= fromUnixTimestamp({startTimestamp:UInt32})
                    AND event_time < fromUnixTimestamp({endTimestamp:UInt32})
                    AND event_type = 'DownloadPart'
                ORDER BY event_time DESC
                `,
                },
                sortOption: {
                  initialSort: {
                    column: "event_time",
                    direction: "desc",
                  },
                },
              } as TableDescriptor,
            },
          } as StatDescriptor,

          //
          // Merges
          //
          {
            type: "stat",
            titleOption: {
              title: "Merges",
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
            },

            drilldown: {
              main: {
                type: "table",
                titleOption: {
                  title: "Merge Part Log",
                },
                query: {
                  sql: `
                SELECT * FROM system.part_log WHERE database = '${database}' AND table = '${table}'
                AND 
                    event_date >= toDate(fromUnixTimestamp({startTimestamp:UInt32})) 
                    AND event_date <= toDate(fromUnixTimestamp({endTimestamp:UInt32}))
                    AND event_time >= fromUnixTimestamp({startTimestamp:UInt32})
                    AND event_time < fromUnixTimestamp({endTimestamp:UInt32})
                    AND event_type = 'MergeParts'
                ORDER BY event_time DESC
                `,
                },
                sortOption: {
                  initialSort: {
                    column: "event_time",
                    direction: "desc",
                  },
                  serverSideSorting: true,
                },
                miscOption: {
                  enableCompactMode: true,
                  enableIndexColumn: true,
                },
                pagination: {
                  mode: "server",
                  pageSize: 100,
                },
              } as TableDescriptor,
              minimap: {
                type: "table",
                titleOption: {
                  title: "Merge Part Log",
                },
                query: {
                  sql: `
                SELECT * FROM system.part_log WHERE database = '${database}' AND table = '${table}'
                AND 
                    event_date >= toDate(fromUnixTimestamp({startTimestamp:UInt32})) 
                    AND event_date <= toDate(fromUnixTimestamp({endTimestamp:UInt32}))
                    AND event_time >= fromUnixTimestamp({startTimestamp:UInt32})
                    AND event_time < fromUnixTimestamp({endTimestamp:UInt32})
                    AND event_type = 'MergeParts'
                ORDER BY event_time DESC
                `,
                },
                sortOption: {
                  initialSort: {
                    column: "event_time",
                    direction: "desc",
                  },
                },
              } as TableDescriptor,
            },
          } as StatDescriptor,

          //
          // Mutations
          //
          {
            type: "stat",
            titleOption: {
              title: "Mutations",
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
            },

            drilldown: {
              main: {
                type: "table",
                titleOption: {
                  title: "Mutate Part Log",
                },
                query: {
                  sql: `
                SELECT * FROM system.part_log WHERE database = '${database}' AND table = '${table}'
                AND 
                    event_date >= toDate(fromUnixTimestamp({startTimestamp:UInt32})) 
                    AND event_date <= toDate(fromUnixTimestamp({endTimestamp:UInt32}))
                    AND event_time >= fromUnixTimestamp({startTimestamp:UInt32})
                    AND event_time < fromUnixTimestamp({endTimestamp:UInt32})
                    AND event_type = 'MutatePart'
                ORDER BY event_time DESC
                `,
                },
                sortOption: {
                  initialSort: {
                    column: "event_time",
                    direction: "desc",
                  },
                  serverSideSorting: true,
                },
                miscOption: {
                  enableCompactMode: true,
                  enableIndexColumn: true,
                },
                pagination: {
                  mode: "server",
                  pageSize: 100,
                },
              } as TableDescriptor,
              minimap: {
                type: "table",
                titleOption: {
                  title: "Merge Log",
                },
                query: {
                  sql: `
                SELECT * FROM system.part_log WHERE database = '${database}' AND table = '${table}'
                AND 
                    event_date >= toDate(fromUnixTimestamp({startTimestamp:UInt32})) 
                    AND event_date <= toDate(fromUnixTimestamp({endTimestamp:UInt32}))
                    AND event_time >= fromUnixTimestamp({startTimestamp:UInt32})
                    AND event_time < fromUnixTimestamp({endTimestamp:UInt32})
                    AND event_type = 'MutatePart'
                ORDER BY event_time DESC
                `,
                },
                sortOption: {
                  initialSort: {
                    column: "event_time",
                    direction: "desc",
                  },
                },
              } as TableDescriptor,
            },
          } as StatDescriptor,

          {
            type: "stat",
            titleOption: {
              title: "Removed Parts",
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
            },
            drilldown: {
              main: {
                type: "table",
                titleOption: {
                  title: "Remove Part Log",
                },
                query: {
                  sql: `
                SELECT * FROM system.part_log WHERE database = '${database}' AND table = '${table}'
                AND 
                    event_date >= toDate(fromUnixTimestamp({startTimestamp:UInt32})) 
                    AND event_date <= toDate(fromUnixTimestamp({endTimestamp:UInt32}))
                    AND event_time >= fromUnixTimestamp({startTimestamp:UInt32})
                    AND event_time < fromUnixTimestamp({endTimestamp:UInt32})
                    AND event_type = 'RemovePart'
                ORDER BY event_time DESC
                `,
                },
                sortOption: {
                  initialSort: {
                    column: "event_time",
                    direction: "desc",
                  },
                  serverSideSorting: true,
                },
                miscOption: {
                  enableCompactMode: true,
                  enableIndexColumn: true,
                },
                pagination: {
                  mode: "server",
                  pageSize: 100,
                },
              } as TableDescriptor,
              minimap: {
                type: "table",
                titleOption: {
                  title: "Remove Part Log",
                },
                query: {
                  sql: `
                SELECT * FROM system.part_log WHERE database = '${database}' AND table = '${table}'
                AND 
                    event_date >= toDate(fromUnixTimestamp({startTimestamp:UInt32})) 
                    AND event_date <= toDate(fromUnixTimestamp({endTimestamp:UInt32}))
                    AND event_time >= fromUnixTimestamp({startTimestamp:UInt32})
                    AND event_time < fromUnixTimestamp({endTimestamp:UInt32})
                    AND event_type = 'RemovePart'
                ORDER BY event_time DESC
                `,
                },
                sortOption: {
                  initialSort: {
                    column: "event_time",
                    direction: "desc",
                  },
                },
              } as TableDescriptor,
            },
          } as StatDescriptor,
        ],
      };
    }, [database, table]);

    return (
      <DashboardPanelContainer
        ref={dashboardPanelsRef}
        dashboard={dashboard}
        selectedTimeSpan={currentTimeSpan}
      />
    );
  })
);
export { PartHistoryView };
