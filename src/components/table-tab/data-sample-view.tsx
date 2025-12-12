import type { TableDescriptor } from "@/components/shared/dashboard/dashboard-model";
import type { DashboardPanelComponent } from "@/components/shared/dashboard/dashboard-panel-layout";
import DashboardPanelTable from "@/components/shared/dashboard/dashboard-panel-table";
import type { TimeSpan } from "@/components/shared/dashboard/timespan-selector";
import { useConnection } from "@/lib/connection/ConnectionContext";
import { forwardRef, memo, useImperativeHandle, useMemo, useRef } from "react";
import type { RefreshableTabViewRef } from "./table-tab";

export interface DataSampleViewProps {
  database: string;
  table: string;
  autoLoad?: boolean;
}

const DataSampleViewComponent = forwardRef<RefreshableTabViewRef, DataSampleViewProps>(({ database, table }, ref) => {
  useConnection(); // Ensure connection context is available
  const tableComponentRef = useRef<DashboardPanelComponent | null>(null);

  // Create table descriptor - RefreshableTableComponent will discover columns from meta
  // Note: Formatters are not applied here because we don't know column names until data loads.
  // The table will work with default formatting. To add click-to-view functionality,
  // we would need to either:
  // 1. Modify RefreshableTableComponent to support a defaultFormatter prop
  // 2. Update the descriptor after the first data load with discovered column names
  const tableDescriptor = useMemo<TableDescriptor>(() => {
    const fullTableName = `${database}.${table}`;

    return {
      type: "table",
      id: `data-sample-${database}-${table}`,
      width: 100,
      showIndexColumn: true,
      headOption: {
        isSticky: true,
      },
      query: {
        sql: `SELECT * FROM ${fullTableName} LIMIT 1000`,
        headers: {
          "Content-Type": "text/plain",
        },
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
          // Force refresh by passing a unique timestamp to bypass the parameter change check
          // This ensures refresh always happens even if called multiple times with "same" parameters
          const refreshParam = { inputFilter: `refresh_${Date.now()}` };
          tableComponentRef.current.refresh(refreshParam);
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
      <DashboardPanelTable
        ref={(r) => {
          if (r) {
            tableComponentRef.current = r;
          }
        }}
        descriptor={tableDescriptor}
      />
    </div>
  );
});

DataSampleViewComponent.displayName = "DataSampleView";

export const DataSampleView = memo(DataSampleViewComponent);
