import { useConnection } from "@/components/connection/connection-context";
import type { TableDescriptor } from "@/components/shared/dashboard/dashboard-model";
import type { DashboardVisualizationComponent } from "@/components/shared/dashboard/dashboard-visualization-layout";
import { DashboardVisualizationPanel } from "@/components/shared/dashboard/dashboard-visualization-panel";
import type { TimeSpan } from "@/components/shared/dashboard/timespan-selector";
import { escapeSqlString } from "@/lib/string-utils";
import { forwardRef, memo, useImperativeHandle, useMemo, useRef } from "react";
import type { RefreshableTabViewRef } from "./table-tab";

export interface DataSampleViewProps {
  database: string;
  table: string;
  autoLoad?: boolean;
}

const DataSampleViewComponent = forwardRef<RefreshableTabViewRef, DataSampleViewProps>(
  ({ database, table }, ref) => {
    useConnection(); // Ensure connection context is available
    const tableComponentRef = useRef<DashboardVisualizationComponent | null>(null);

    // Create table descriptor - RefreshableTableComponent will discover columns from meta
    // Note: Formatters are not applied here because we don't know column names until data loads.
    // The table will work with default formatting. To add click-to-view functionality,
    // we would need to either:
    // 1. Modify RefreshableTableComponent to support a defaultFormatter prop
    // 2. Update the descriptor after the first data load with discovered column names
    const tableDescriptor = useMemo<TableDescriptor>(() => {
      return {
        type: "table",
        id: `data-sample-${database}-${table}`,
        width: 100,
        miscOption: { enableIndexColumn: true, enableShowRowDetail: true },
        headOption: {
          isSticky: true,
        },
        datasource: {
          sql: `SELECT * FROM ${escapeSqlString(database)}.${escapeSqlString(table)} LIMIT 1000`,
          params: {
            default_format: "JSON",
            output_format_json_quote_64bit_integers: 0,
          },
        },
        fieldOptions: {},
      };
    }, [database, table]);

    useImperativeHandle(
      ref,
      () => ({
        refresh: (_timeSpan?: TimeSpan) => {
          if (tableComponentRef.current) {
            // Force refresh by passing forceRefresh flag
            tableComponentRef.current.refresh({ forceRefresh: true });
          }
        },
      }),
      []
    );

    if (!tableDescriptor) {
      return (
        <div className="h-full flex items-center justify-center">
          <div className="text-muted-foreground">Loading table structure...</div>
        </div>
      );
    }

    return (
      <div className="h-full relative">
        <DashboardVisualizationPanel ref={tableComponentRef} descriptor={tableDescriptor} />
      </div>
    );
  }
);

DataSampleViewComponent.displayName = "DataSampleView";

export const DataSampleView = memo(DataSampleViewComponent);
