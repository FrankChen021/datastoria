import type {
  Dashboard,
  TransposeTableDescriptor,
} from "@/components/shared/dashboard/dashboard-model";
import DashboardPanelContainer, {
  type DashboardPanelContainerRef,
} from "@/components/shared/dashboard/dashboard-panel-container";
import { SqlUtils } from "@/lib/sql-utils";
import { forwardRef, useMemo } from "react";

export interface DatabaseMetadataProps {
  database: string;
}

export const DatabaseMetadata = forwardRef<DashboardPanelContainerRef, DatabaseMetadataProps>(
  ({ database }, ref) => {
    const escapedDatabase = useMemo(() => SqlUtils.escapeSqlString(database), [database]);
    const dashboard = useMemo<Dashboard>(
      () => ({
        version: 3,
        filter: {
          showTimeSpanSelector: false,
          showRefresh: false,
          showAutoRefresh: false,
        },
        charts: [
          {
            type: "transpose-table",
            titleOption: {
              title: "Database Metadata",
              align: "left",
            },
            gridPos: {
              w: 24,
              h: 9,
            },
            datasource: {
              sql: `
select 
  *
from system.databases
where database = '${escapedDatabase}'
`,
            },
          } as TransposeTableDescriptor,
        ],
      }),
      [escapedDatabase]
    );

    return <DashboardPanelContainer ref={ref} dashboard={dashboard} />;
  }
);

DatabaseMetadata.displayName = "DatabaseMetadata";
