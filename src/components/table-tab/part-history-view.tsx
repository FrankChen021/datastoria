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
import { escapeSqlString } from "@/lib/string-utils";
import { forwardRef, memo, useImperativeHandle, useMemo, useRef } from "react";
import type { RefreshableTabViewRef } from "./table-tab";

export interface PartHistoryViewProps {
  database: string;
  table: string;
  autoLoad?: boolean;
}

const PartHistoryView = memo(
  forwardRef<RefreshableTabViewRef, PartHistoryViewProps>(({ database, table }, ref) => {
    const dashboardPanelsRef = useRef<DashboardPanelContainerRef>(null);
    const defaultTimeSpan = useMemo(() => BUILT_IN_TIME_SPAN_LIST[3].getTimeSpan(), []);

    useImperativeHandle(
      ref,
      () => ({
        refresh: (timeSpan?: TimeSpan) => {
          dashboardPanelsRef.current?.refresh(timeSpan ?? defaultTimeSpan);
        },
        supportsTimeSpanSelector: true,
      }),
      [defaultTimeSpan]
    );

    // Create dashboard with the stat chart
    const dashboard = useMemo<Dashboard>(() => {
      const escapedDatabase = escapeSqlString(database);
      const escapedTable = escapeSqlString(table);
      return {
        name: `part-history-${database}-${table}`,
        version: 3,
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
            gridPos: {
              w: 8,
              h: 4,
            },
            minimapOption: {
              type: "line",
            },
            valueOption: {
              reducer: "sum",
              align: "center",
              format: "comma_number",
            },
            datasource: {
              sql: `
SELECT 
toStartOfInterval(event_time, INTERVAL {rounding:UInt32} SECOND)::INT as t,
count()
FROM system.part_log
WHERE 
    event_date >= toDate({from:String}) 
    AND event_date >= toDate({to:String})
    AND event_time >= {from:String}
    AND event_time < {to:String}
    AND database = '${escapedDatabase}'
    AND table = '${escapedTable}'
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
                datasource: {
                  sql: `
                SELECT * FROM system.part_log WHERE database = '${escapedDatabase}' AND table = '${escapedTable}'
                AND 
                    event_date >= toDate({from:String}) 
                    AND event_date >= toDate({to:String})
                    AND event_time >= {from:String}
                    AND event_time < {to:String}
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
                headOption: {
                  isSticky: true,
                },
                datasource: {
                  sql: `
                SELECT * FROM system.part_log WHERE database = '${escapedDatabase}' AND table = '${escapedTable}'
                AND 
                    event_date >= toDate({from:String}) 
                    AND event_date >= toDate({to:String})
                    AND event_time >= {from:String}
                    AND event_time < {to:String}
                    AND event_type = 'NewPart'
                ORDER BY event_time DESC
                `,
                },
                miscOption: {
                  enableCompactMode: true,
                  enableIndexColumn: true,
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
              title: "Download Part",
              align: "center",
            },
            collapsed: false,
            gridPos: {
              w: 8,
              h: 4,
            },
            minimapOption: {
              type: "line",
            },
            valueOption: {
              reducer: "sum",
              align: "center",
              format: "comma_number",
            },
            datasource: {
              sql: `
SELECT 
toStartOfInterval(event_time, INTERVAL {rounding:UInt32} SECOND)::INT as t,
count()
FROM system.part_log
WHERE 
    event_date >= toDate({from:String}) 
    AND event_date >= toDate({to:String})
    AND event_time >= {from:String}
    AND event_time < {to:String}
    AND database = '${escapedDatabase}'
    AND table = '${escapedTable}'
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
                datasource: {
                  sql: `
                SELECT * FROM system.part_log WHERE database = '${escapedDatabase}' AND table = '${escapedTable}'
                AND 
                    event_date >= toDate({from:String}) 
                    AND event_date >= toDate({to:String})
                    AND event_time >= {from:String}
                    AND event_time < {to:String}
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
                  title: "Download Part Log",
                },
                datasource: {
                  sql: `
                SELECT * FROM system.part_log WHERE database = '${escapedDatabase}' AND table = '${escapedTable}'
                AND 
                    event_date >= toDate({from:String}) 
                    AND event_date >= toDate({to:String})
                    AND event_time >= {from:String}
                    AND event_time < {to:String}
                    AND event_type = 'DownloadPart'
                ORDER BY event_time DESC
                LIMIT 100
                `,
                },
                miscOption: {
                  enableCompactMode: true,
                  enableIndexColumn: true,
                },
                sortOption: {
                  initialSort: {
                    column: "event_time",
                    direction: "desc",
                    serverSideSorting: true,
                  },
                },
                pagination: {
                  mode: "server",
                  pageSize: 100,
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
            gridPos: {
              w: 8,
              h: 4,
            },
            minimapOption: {
              type: "line",
            },
            valueOption: {
              reducer: "sum",
              align: "center",
              format: "comma_number",
            },
            datasource: {
              sql: `
SELECT 
toStartOfInterval(event_time, INTERVAL {rounding:UInt32} SECOND)::INT as t,
count()
FROM system.part_log
WHERE 
    event_date >= toDate({from:String}) 
    AND event_date >= toDate({to:String})
    AND event_time >= {from:String}
    AND event_time < {to:String}
    AND database = '${escapedDatabase}'
    AND table = '${escapedTable}'
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
                datasource: {
                  sql: `
                SELECT * FROM system.part_log WHERE database = '${escapedDatabase}' AND table = '${escapedTable}'
                AND 
                    event_date >= toDate({from:String}) 
                    AND event_date >= toDate({to:String})
                    AND event_time >= {from:String}
                    AND event_time < {to:String}
                    AND event_type = 'MergeParts'
                ORDER BY event_time DESC
                LIMIT 100
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
                datasource: {
                  sql: `
                SELECT * FROM system.part_log WHERE database = '${escapedDatabase}' AND table = '${escapedTable}'
                AND 
                    event_date >= toDate({from:String}) 
                    AND event_date >= toDate({to:String})
                    AND event_time >= {from:String}
                    AND event_time < {to:String}
                    AND event_type = 'MergeParts'
                ORDER BY event_time DESC
                LIMIT 100
                `,
                },
                miscOption: {
                  enableCompactMode: true,
                  enableIndexColumn: true,
                },
                sortOption: {
                  initialSort: { column: "event_time", direction: "desc", serverSideSorting: true },
                },
                pagination: {
                  mode: "server",
                  pageSize: 100,
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
            gridPos: {
              w: 8,
              h: 4,
            },
            minimapOption: {
              type: "line",
            },
            valueOption: {
              reducer: "sum",
              align: "center",
              format: "comma_number",
            },
            datasource: {
              sql: `
SELECT 
toStartOfInterval(event_time, INTERVAL {rounding:UInt32} SECOND)::INT as t,
count()
FROM system.part_log
WHERE 
    event_date >= toDate({from:String}) 
    AND event_date >= toDate({to:String})
    AND event_time >= {from:String}
    AND event_time < {to:String}
    AND database = '${escapedDatabase}'
    AND table = '${escapedTable}'
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
                datasource: {
                  sql: `
                SELECT * FROM system.part_log WHERE database = '${escapedDatabase}' AND table = '${escapedTable}'
                AND 
                    event_date >= toDate({from:String}) 
                    AND event_date >= toDate({to:String})
                    AND event_time >= {from:String}
                    AND event_time < {to:String}
                    AND event_type = 'MutatePart'
                ORDER BY event_time DESC
                LIMIT 100
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
                datasource: {
                  sql: `
                SELECT * FROM system.part_log WHERE database = '${escapedDatabase}' AND table = '${escapedTable}'
                AND 
                    event_date >= toDate({from:String}) 
                    AND event_date >= toDate({to:String})
                    AND event_time >= {from:String}
                    AND event_time < {to:String}
                    AND event_type = 'MutatePart'
                ORDER BY event_time DESC
                LIMIT 100
                `,
                },
                miscOption: {
                  enableCompactMode: true,
                  enableIndexColumn: true,
                },
                sortOption: {
                  initialSort: {
                    column: "event_time",
                    direction: "desc",
                  },
                  serverSideSorting: true,
                },
                pagination: {
                  mode: "server",
                  pageSize: 100,
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
            gridPos: {
              w: 8,
              h: 4,
            },
            minimapOption: {
              type: "line",
            },
            valueOption: {
              reducer: "sum",
              align: "center",
              format: "comma_number",
            },
            datasource: {
              sql: `
SELECT 
toStartOfInterval(event_time, INTERVAL {rounding:UInt32} SECOND)::INT as t,
count()
FROM system.part_log
WHERE 
    event_date >= toDate({from:String}) 
    AND event_date >= toDate({to:String})
    AND event_time >= {from:String}
    AND event_time < {to:String}
    AND database = '${escapedDatabase}'
    AND table = '${escapedTable}'
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
                datasource: {
                  sql: `
                SELECT * FROM system.part_log WHERE database = '${escapedDatabase}' AND table = '${escapedTable}'
                AND 
                    event_date >= toDate({from:String}) 
                    AND event_date >= toDate({to:String})
                    AND event_time >= {from:String}
                    AND event_time < {to:String}
                    AND event_type = 'RemovePart'
                ORDER BY event_time DESC
                LIMIT 100
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
                datasource: {
                  sql: `
                SELECT * FROM system.part_log WHERE database = '${escapedDatabase}' AND table = '${escapedTable}'
                AND 
                    event_date >= toDate({from:String}) 
                    AND event_date >= toDate({to:String})
                    AND event_time >= {from:String}
                    AND event_time < {to:String}
                    AND event_type = 'RemovePart'
                ORDER BY event_time DESC
                LIMIT 100
                `,
                },
                miscOption: {
                  enableCompactMode: true,
                  enableIndexColumn: true,
                },
                sortOption: {
                  initialSort: {
                    column: "event_time",
                    direction: "desc",
                  },
                  serverSideSorting: true,
                },
                pagination: {
                  mode: "server",
                  pageSize: 100,
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
        initialTimeSpan={defaultTimeSpan}
      />
    );
  })
);
export { PartHistoryView };
