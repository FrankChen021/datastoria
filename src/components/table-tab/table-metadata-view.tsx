import type { Dashboard, TableDescriptor, TransposeTableDescriptor } from "@/components/shared/dashboard/dashboard-model";
import DashboardPanels, { type DashboardPanelsRef } from "@/components/shared/dashboard/dashboard-panels";
import { BUILT_IN_TIME_SPAN_LIST, type TimeSpan } from "@/components/shared/dashboard/timespan-selector";
import { useConnection } from "@/lib/connection/connection-context";
import { forwardRef, memo, useImperativeHandle, useMemo, useRef, useState } from "react";
import type { RefreshableTabViewRef } from "./table-tab";

export interface TableMetadataViewProps {
  database: string;
  table: string;
  autoLoad?: boolean;
}

const TableMetadataViewComponent = forwardRef<RefreshableTabViewRef, TableMetadataViewProps>(
  ({ database, table }, ref) => {
    const dashboardPanelsRef = useRef<DashboardPanelsRef>(null);
    // Metadata doesn't really depend on time, but DashboardPanels requires a time span.
    // We use a default one.
    const [selectedTimeSpan, setSelectedTimeSpan] = useState<TimeSpan>(() => BUILT_IN_TIME_SPAN_LIST[3].getTimeSpan());

    const { connection } = useConnection();

    useImperativeHandle(ref, () => ({
      refresh: (timeSpan?: TimeSpan) => {
        if (timeSpan) {
          setSelectedTimeSpan(timeSpan);
        } else {
          // Force refresh
          dashboardPanelsRef.current?.refresh(selectedTimeSpan);
        }
      },
    }));

    const dashboard = useMemo<Dashboard>(() => {

      const d: Dashboard = {
        version: 2,
        filter: {
          showTimeSpanSelector: false,
          showRefresh: false,
          showAutoRefresh: false,
        },
        charts: [
          {
            type: "transpose-table",
            id: `table-ddl-${database}-${table}`,
            titleOption: {
              title: "Table Metadata",
              align: "center",
            },
            collapsed: false,
            gridPos: {
              w: 24,
              h: 24
            },
            query: {
              sql: `
SELECT * FROM system.tables WHERE database = '${database}' AND name = '${table}'
`,
            },
            fieldOptions: {
              create_table_query: { name: "create_table_query", format: "inline_sql" },
              as_select: { name: "as_select", format: "inline_sql" },
            },
          } as TransposeTableDescriptor,
          {
            type: "table",
            titleOption: {
            title: "Table Columns",
            align: "center",
          },
          collapsed: true,
          miscOption: { enableIndexColumn: true },
          gridPos: {
            w: 24,
            h: 12
          },
            query: {
              sql: `SELECT * FROM system.columns WHERE database = '${database}' AND table = '${table}'`,
            },
            fieldOptions: {
              // Hide database and table columns
              database: { position: -1 },
              table: { position: -1 },
            },
          } as TableDescriptor,
        ],
      } as Dashboard;

      if (connection?.cluster && connection.cluster.length > 0) {
        d.charts.push({
          type: "table",
          titleOption: {
          title: "Table Metadata On Cluster",
          align: "center",
        },
        collapsed: true,
        miscOption: { enableIndexColumn: true },
        gridPos: {
          w: 24,
          h: 12
        },
          sortOption: {
            initialSort: {
              column: "host",
              direction: "asc",
            },
          },
          fieldOptions: {
            create_table_query: {
              format: 'sql'
            },
            table_query_hash: {
              format: (val) => val
            },
          },
          query: {
            sql: `
SELECT
  FQDN() as host, 
  create_table_query, 
  sipHash64(create_table_query) as table_query_hash,
  metadata_modification_time
FROM clusterAllReplicas('${connection.cluster}', system.tables) WHERE database = '${database}' AND name = '${table}'
ORDER BY host
`,
          },
        } as TableDescriptor);
      }

      return d;
    }, [database, table]);

    return <DashboardPanels ref={dashboardPanelsRef} dashboard={dashboard} selectedTimeSpan={selectedTimeSpan} />;
  }
);

TableMetadataViewComponent.displayName = "TableMetadataView";

export const TableMetadataView = memo(TableMetadataViewComponent);
