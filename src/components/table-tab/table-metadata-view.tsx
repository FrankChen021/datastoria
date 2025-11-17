import type { FieldOption, TableDescriptor, TransposeTableDescriptor } from "@/components/dashboard/dashboard-model";
import type { RefreshableComponent } from "@/components/dashboard/dashboard-panel-common";
import RefreshableTableComponent from "@/components/dashboard/dashboard-panel-table";
import RefreshableTransposedTableComponent from "@/components/dashboard/dashboard-panel-tranposd-table";
import type { TimeSpan } from "@/components/dashboard/timespan-selector";
import { ThemedSyntaxHighlighter } from "@/components/themed-syntax-highlighter";
import { StringUtils } from "@/lib/string-utils";
import { forwardRef, memo, useEffect, useImperativeHandle, useMemo, useRef, useState } from "react";
import type { RefreshableTabViewRef } from "./table-tab";

export interface TableMetadataViewProps {
  database: string;
  table: string;
  autoLoad?: boolean;
}

const TableDDLView = memo(function TableDDLView({
  database,
  table,
  refreshTrigger,
  autoLoad = false,
}: TableMetadataViewProps & { refreshTrigger?: number; autoLoad?: boolean }) {
  const tableComponentRef = useRef<RefreshableComponent>(null);
  const isMountedRef = useRef(true);

  // Create transposed table descriptor
  const tableDescriptor = useMemo<TransposeTableDescriptor>(() => {
    // Custom SQL renderer that renders SQL inline instead of using dialog
    const sqlInlineRenderer: FieldOption["format"] = (value: unknown) => {
      if (value === null || value === undefined || (typeof value === "string" && value.trim() === "")) {
        return <span className="text-muted-foreground">-</span>;
      }

      const sqlString = String(value);
      const formattedSql = StringUtils.prettyFormatQuery(sqlString);

      return (
        <div className="overflow-auto">
          <ThemedSyntaxHighlighter language="sql" customStyle={{ fontSize: "12px", margin: 0, padding: 8 }}>
            {formattedSql}
          </ThemedSyntaxHighlighter>
        </div>
      );
    };

    const sql = `SELECT * FROM system.tables WHERE database = '${database}' AND name = '${table}'`;

    return {
      type: "transpose-table",
      id: `table-ddl-${database}-${table}`,
      titleOption: {
        title: "Table Metadata",
        align: "left",
      },
      collapsed: false,
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
      fieldOptions: {
        create_table_query: { name: "create_table_query", format: sqlInlineRenderer },
        as_select: { name: "as_select", format: sqlInlineRenderer },
      },
    };
  }, [database, table]);

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

  return <RefreshableTransposedTableComponent ref={tableComponentRef} descriptor={tableDescriptor} />;
});

const TableStructureView = memo(function TableStructureView({
  database,
  table,
  refreshTrigger,
  autoLoad = false,
}: TableMetadataViewProps & { refreshTrigger?: number; autoLoad?: boolean }) {
  const tableComponentRef = useRef<RefreshableComponent>(null);
  const isMountedRef = useRef(true);

  // Create table descriptor
  const tableDescriptor = useMemo<TableDescriptor>(() => {
    const fullTableName = `${database}.${table}`;
    const fieldOptions: Record<string, FieldOption> = {
      name: {
        title: "Name",
        sortable: true,
        align: "left",
      },
      type: {
        title: "Type",
        sortable: true,
        align: "left",
      },
      default_type: {
        title: "Default Type",
        sortable: true,
        align: "center",
      },
      default_expression: {
        title: "Default Expression",
        sortable: true,
        align: "center",
      },
      comment: {
        title: "Comment",
        align: "left",
      },
      codec_expression: {
        title: "Codec Expression",
        sortable: true,
        align: "center",
      },
      ttl_expression: {
        title: "TTL Expression",
        sortable: true,
        align: "center",
      },
    };

    const sql = `DESCRIBE TABLE ${fullTableName}`;

    return {
      type: "table",
      id: `table-structure-${database}-${table}`,
      titleOption: {
        title: "Table Structure",
        align: "left",
      },
      collapsed: false,
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
      fieldOptions: fieldOptions,
    };
  }, [database, table]);

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
});

const TableMetadataViewComponent = forwardRef<RefreshableTabViewRef, TableMetadataViewProps>(
  ({ database, table, autoLoad = false }, ref) => {
    const [refreshTrigger, setRefreshTrigger] = useState(0);

    useImperativeHandle(ref, () => ({
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      refresh: (_timeSpan?: TimeSpan) => {
        setRefreshTrigger((prev) => prev + 1);
      },
    }));

    return (
      <div className="space-y-2">
        <TableDDLView database={database} table={table} refreshTrigger={refreshTrigger} autoLoad={autoLoad} />
        <TableStructureView database={database} table={table} refreshTrigger={refreshTrigger} autoLoad={autoLoad} />
      </div>
    );
  }
);

TableMetadataViewComponent.displayName = "TableMetadataView";

export const TableMetadataView = memo(TableMetadataViewComponent);
