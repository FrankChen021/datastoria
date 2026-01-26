import { useConnection } from "@/components/connection/connection-context";
import type {
  Dashboard,
  TableDescriptor,
  TransposeTableDescriptor,
} from "@/components/shared/dashboard/dashboard-model";
import DashboardPanelContainer, {
  type DashboardPanelContainerRef,
} from "@/components/shared/dashboard/dashboard-panel-container";
import {
  BUILT_IN_TIME_SPAN_LIST,
  type TimeSpan,
} from "@/components/shared/dashboard/timespan-selector";
import type { ObjectFormatter } from "@/lib/formatter";
import { escapeSqlString } from "@/lib/string-utils";
import { forwardRef, memo, useImperativeHandle, useMemo, useRef, useState } from "react";
import { OpenDatabaseTabButton } from "./open-database-tab-button";
import { OpenTableTabButton } from "./open-table-tab-button";
import type { RefreshableTabViewRef } from "./table-tab";

/**
 * Custom formatter for engine_full field.
 * For Distributed engines, it parses the pattern "Distributed(cluster, database, table, ...)"
 * and renders the database and table as clickable buttons.
 */
const formatEngineFull: ObjectFormatter = (value: unknown) => {
  if (typeof value !== "string") {
    return String(value ?? "");
  }

  // Check if it's a Distributed engine
  // Pattern: Distributed(cluster, database, table, ...)
  const distributedMatch = value.match(/^Distributed\(([^,]+),\s*([^,]+),\s*([^,)]+)/);
  if (!distributedMatch) {
    // Not a Distributed engine or doesn't match the pattern, return as-is
    return value;
  }

  const [fullMatch, cluster, database, table] = distributedMatch;
  const remainingPart = value.slice(fullMatch.length);

  // Trim whitespace and remove surrounding quotes (single or double) from extracted values
  const trimmedDatabase = database.trim().replace(/^['"]|['"]$/g, "");
  const trimmedTable = table.trim().replace(/^['"]|['"]$/g, "");
  const trimmedCluster = cluster.trim().replace(/^['"]|['"]$/g, "");

  return (
    <span className="inline-flex flex-wrap items-center gap-0">
      <span>Distributed({trimmedCluster}, </span>
      <OpenDatabaseTabButton database={trimmedDatabase} showLinkIcon={false} />
      <span>, </span>
      <OpenTableTabButton database={trimmedDatabase} table={trimmedTable} showLinkIcon={false} />
      <span>{remainingPart}</span>
    </span>
  );
};

export interface TableMetadataViewProps {
  database: string;
  table: string;
  autoLoad?: boolean;
}

const TableMetadataViewComponent = forwardRef<RefreshableTabViewRef, TableMetadataViewProps>(
  ({ database, table }, ref) => {
    const dashboardPanelsRef = useRef<DashboardPanelContainerRef>(null);
    // Metadata doesn't really depend on time, but DashboardPanelContainer requires a time span.
    // We use a default one.
    const [selectedTimeSpan, setSelectedTimeSpan] = useState<TimeSpan>(() =>
      BUILT_IN_TIME_SPAN_LIST[3].getTimeSpan()
    );

    const { connection } = useConnection();

    useImperativeHandle(
      ref,
      () => ({
        refresh: (timeSpan?: TimeSpan) => {
          if (timeSpan) {
            setSelectedTimeSpan(timeSpan);
          } else {
            // Force refresh
            dashboardPanelsRef.current?.refresh(selectedTimeSpan);
          }
        },
      }),
      [selectedTimeSpan]
    );

    const dashboard = useMemo<Dashboard>(() => {
      const escapedDatabase = escapeSqlString(database);
      const escapedTable = escapeSqlString(table);
      const d: Dashboard = {
        version: 3,
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
              h: 24,
            },
            datasource: {
              sql: `
SELECT * FROM system.tables WHERE database = '${escapedDatabase}' AND name = '${escapedTable}'
`,
            },
            fieldOptions: {
              create_table_query: { name: "create_table_query", format: "inline_sql" },
              as_select: { name: "as_select", format: "inline_sql" },
              engine_full: { name: "engine_full", format: formatEngineFull },
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
              h: 12,
            },
            datasource: {
              sql: `SELECT * FROM system.columns WHERE database = '${escapedDatabase}' AND table = '${escapedTable}'`,
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
        const escapedCluster = escapeSqlString(connection.cluster);
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
            h: 12,
          },
          sortOption: {
            initialSort: {
              column: "host",
              direction: "asc",
            },
          },
          fieldOptions: {
            create_table_query: {
              format: "sql",
            },
            table_query_hash: {
              format: (val) => val,
            },
          },
          datasource: {
            sql: `
SELECT
  FQDN() as host, 
  create_table_query, 
  sipHash64(create_table_query) as table_query_hash,
  metadata_modification_time
FROM clusterAllReplicas('${escapedCluster}', system.tables) WHERE database = '${escapedDatabase}' AND name = '${escapedTable}'
ORDER BY host
`,
          },
        } as TableDescriptor);
      }

      return d;
    }, [database, table, connection?.cluster]);

    return (
      <DashboardPanelContainer
        ref={dashboardPanelsRef}
        dashboard={dashboard}
        initialTimeSpan={selectedTimeSpan}
      />
    );
  }
);

TableMetadataViewComponent.displayName = "TableMetadataView";

export const TableMetadataView = memo(TableMetadataViewComponent);
