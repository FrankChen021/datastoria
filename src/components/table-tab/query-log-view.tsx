import type { ColumnDef, TableDescriptor } from "@/components/dashboard/chart-utils";
import type { RefreshableComponent } from "@/components/dashboard/refreshable-component";
import RefreshableTableComponent from "@/components/dashboard/refreshable-table-component";
import type { TimeSpan } from "@/components/dashboard/timespan-selector";
import { DateTimeExtension } from "@/lib/datetime-utils";
import { forwardRef, useEffect, useImperativeHandle, useMemo, useRef, useState } from "react";

import type { RefreshableTabViewRef } from "./table-tab";

export interface QueryLogViewProps {
  database: string;
  table: string;
  autoLoad?: boolean;
}

export const QueryLogView = forwardRef<RefreshableTabViewRef, QueryLogViewProps>(
  ({ database, table, autoLoad = false }, ref) => {
    const [refreshTrigger, setRefreshTrigger] = useState(0);
    const [selectedTimeSpan, setSelectedTimeSpan] = useState<TimeSpan | undefined>(undefined);
    const tableComponentRef = useRef<RefreshableComponent>(null);
    const isMountedRef = useRef(true);

    useImperativeHandle(ref, () => ({
      refresh: (timeSpan?: TimeSpan) => {
        if (timeSpan) {
          setSelectedTimeSpan(timeSpan);
        }
        setRefreshTrigger((prev) => prev + 1);
      },
      supportsTimeSpanSelector: true,
    }));

    // Create table descriptor
    const tableDescriptor = useMemo<TableDescriptor>(() => {
      // Calculate start time - use selected timespan if available, otherwise default to start of today
      let eventTimeStart: string;
      let eventTimeEnd: string | undefined;
      let eventDateFilter: string;

      if (selectedTimeSpan?.startISO8601) {
        const startDate = new Date(selectedTimeSpan.startISO8601);
        eventTimeStart = DateTimeExtension.toYYYYMMddHHmmss(startDate);
        
        if (selectedTimeSpan.endISO8601) {
          const endDate = new Date(selectedTimeSpan.endISO8601);
          eventTimeEnd = DateTimeExtension.toYYYYMMddHHmmss(endDate);
        }

        // Use toDate() to get the date part for event_date filter
        // For timespan, we might need to check multiple dates, but for simplicity, use the start date
        const startDateOnly = new Date(startDate);
        startDateOnly.setHours(0, 0, 0, 0);
        const dateStr = DateTimeExtension.formatDateTime(startDateOnly, "yyyy-MM-dd") || "";
        eventDateFilter = `event_date >= '${dateStr}'`;
      } else {
        const startOfToday = new Date();
        startOfToday.setHours(0, 0, 0, 0);
        eventTimeStart = DateTimeExtension.toYYYYMMddHHmmss(startOfToday);
        eventDateFilter = `event_date = today()`;
      }

      const columns: ColumnDef[] = [
        // {
        //   name: "normalized_query_hash",
        //   title: "Query Hash",
        //   sortable: true,
        //   align: "left",
        // },
        {
          name: "query_kind",
          title: "Query Kind",
          sortable: false,
          align: "center",
        },
        {
          name: "last_execution_time",
          title: "Last Execution Time",
          sortable: false,
          align: "center",
          format: "MMddHHmmssSSS",
        },
        {
          name: "OSCPUVirtualTimeMicroseconds",
          title: "CPU Time (μs)",
          sortable: true,
          align: "right",
          format: "comma_number",
        },
        {
          name: "read_rows",
          title: "Read Rows",
          sortable: true,
          align: "right",
          format: "comma_number",
        },
        {
          name: "written_rows",
          title: "Written Rows",
          sortable: true,
          align: "right",
          format: "comma_number",
        },
        {
          name: "query_count",
          title: "Query Count",
          sortable: true,
          align: "right",
          format: "comma_number",
        },
        {
          name: "query",
          title: "Query",
          sortable: false,
          align: "left",
          format: "sql",
        },
      ];

      const timeFilter = eventTimeEnd 
        ? `event_time >= '${eventTimeStart}' AND event_time <= '${eventTimeEnd}'`
        : `event_time >= '${eventTimeStart}'`;

      const sql = `
SELECT
    -- pick the most recent query text for this hash
    max(event_time) AS last_execution_time,
    argMax(query, event_time) AS query,
    argMax(query_kind, event_time) as query_kind,
    sum(ProfileEvents['OSCPUVirtualTimeMicroseconds']) AS OSCPUVirtualTimeMicroseconds,
    sum(read_rows) AS read_rows,
    sum(written_rows) AS written_rows,
    count() query_count
FROM system.query_log
WHERE ${eventDateFilter}
  AND ${timeFilter}
  AND type <> 'QueryStart'
  AND has(databases, '${database}')
  AND has(tables, '${database}.${table}')
GROUP BY normalized_query_hash
ORDER BY OSCPUVirtualTimeMicroseconds DESC
LIMIT 10`;

      return {
        type: "table",
        id: `query-log-${database}-${table}`,
        titleOption: {
          title: "Top 10 Queries by CPU Time",
          align: "left",
        },
        isCollapsed: false,
        width: 100,
        query: {
          sql: sql,
          headers: {
            "Content-Type": "text/plain",
          },
          params: {
            default_format: "JSON",
          },
        },
        columns: columns,
        initialSort: {
          column: "OSCPUVirtualTimeMicroseconds",
          direction: "desc",
        },
        serverSideSorting: true,
      };
    }, [database, table, selectedTimeSpan]);

    useEffect(() => {
      isMountedRef.current = true;
      if (autoLoad || (refreshTrigger !== undefined && refreshTrigger > 0)) {
        // Force refresh by passing a unique timestamp to bypass the parameter change check
        const refreshParam = { inputFilter: `refresh_${Date.now()}_${refreshTrigger}` };
        tableComponentRef.current?.refresh(refreshParam);
      }

      return () => {
        isMountedRef.current = false;
      };
    }, [autoLoad, refreshTrigger]);

    return <RefreshableTableComponent ref={tableComponentRef} descriptor={tableDescriptor} />;
  }
);

QueryLogView.displayName = "QueryLogView";
