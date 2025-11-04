import type { ColumnDef, TableDescriptor, TransposeTableDescriptor } from "@/components/dashboard/chart-utils";
import type { RefreshableComponent } from "@/components/dashboard/refreshable-component";
import RefreshableTableComponent from "@/components/dashboard/refreshable-table-component";
import RefreshableTransposedTableComponent from "@/components/dashboard/refreshable-transposed-table-component";
import type { TimeSpan } from "@/components/dashboard/timespan-selector";
import { ThemedSyntaxHighlighter } from "@/components/themed-syntax-highlighter";
import { StringUtils } from "@/lib/string-utils";
import { forwardRef, useEffect, useImperativeHandle, useMemo, useRef, useState } from "react";
import type { RefreshableTabViewRef } from "./table-tab";

export interface TableMetadataViewProps {
  database: string;
  table: string;
  autoLoad?: boolean;
}

function TableDDLView({
  database,
  table,
  refreshTrigger,
  autoLoad = false,
}: TableMetadataViewProps & { refreshTrigger?: number; autoLoad?: boolean }) {
  const tableComponentRef = useRef<RefreshableComponent>(null);
  const isMountedRef = useRef(true);

  // Create transposed table descriptor
  const tableDescriptor = useMemo<TransposeTableDescriptor>(() => {
    // Define custom renderers for SQL fields
    const valueRenderers: Record<string, (key: string, value: unknown) => React.ReactNode> = {
      create_table_query: (_key: string, value: unknown) => {
        if (value === null || value === undefined) {
          return <span className="text-muted-foreground">-</span>;
        }
        const valueStr = StringUtils.prettyFormatQuery(value as string);
        if (valueStr.length === 0) {
          return <span className="text-muted-foreground">-</span>;
        }
        return (
          <div className="overflow-x-auto">
            <ThemedSyntaxHighlighter language="sql" customStyle={{ fontSize: "14px", margin: 0 }} showLineNumbers={false}>
              {valueStr}
            </ThemedSyntaxHighlighter>
          </div>
        );
      },
      as_select: (_key: string, value: unknown) => {
        if (value === null || value === undefined) {
          return <span className="text-muted-foreground">-</span>;
        }
        const valueStr = StringUtils.prettyFormatQuery(value as string);
        if (valueStr.length === 0) {
          return <span className="text-muted-foreground">-</span>;
        }
        return (
          <div className="overflow-x-auto">
            <ThemedSyntaxHighlighter language="sql" customStyle={{ fontSize: "14px", margin: 0 }} showLineNumbers={false}>
              {valueStr}
            </ThemedSyntaxHighlighter>
          </div>
        );
      },
    };

    const sql = `SELECT * FROM system.tables WHERE database = '${database}' AND name = '${table}'`;

    return {
      type: "transpose-table",
      id: `table-ddl-${database}-${table}`,
      titleOption: {
        title: "Table Metadata",
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
      valueRenderers: valueRenderers,
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
}

function TableStructureView({
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
    const columns: ColumnDef[] = [
      {
        name: "name",
        title: "Name",
        sortable: true,
        align: "left",
      },
      {
        name: "type",
        title: "Type",
        sortable: true,
        align: "center",
      },
      {
        name: "default_type",
        title: "Default Type",
        sortable: true,
        align: "center",
      },
      {
        name: "default_expression",
        title: "Default Expression",
        sortable: true,
        align: "center",
      },
      {
        name: "comment",
        title: "Comment",
        sortable: true,
        align: "center",
      },
      {
        name: "codec_expression",
        title: "Codec Expression",
        sortable: true,
        align: "center",
      },
      {
        name: "ttl_expression",
        title: "TTL Expression",
        sortable: true,
        align: "center",
      },
    ];

    const sql = `DESCRIBE TABLE ${fullTableName}`;

    return {
      type: "table",
      id: `table-structure-${database}-${table}`,
      titleOption: {
        title: "Table Structure",
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
}

export const TableMetadataView = forwardRef<RefreshableTabViewRef, TableMetadataViewProps>(
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

TableMetadataView.displayName = "TableMetadataView";
