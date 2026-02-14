import { CollapsibleSection } from "@/components/shared/collapsible-section";
import type { FieldOption } from "@/components/shared/dashboard/dashboard-model";
import { DataTable } from "@/components/shared/dashboard/data-table";
import { useMemo } from "react";

export const formatQueryLogType = (value: unknown) => {
  return (
    <span
      className={`text-xs px-2 py-1 rounded whitespace-nowrap ${
        value === "QueryFinish"
          ? "bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300"
          : value === "QueryStart"
            ? "bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300"
            : "bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-300"
      }`}
    >
      {String(value)}
    </span>
  );
};

interface QueryLogInspectorTableViewProps {
  queryLogs: any[];
  meta?: { name: string; type?: string }[];
}

export function QueryLogInspectorTableView({ queryLogs, meta }: QueryLogInspectorTableViewProps) {
  // Define field options for specific formatting
  const fieldOptions: FieldOption[] = useMemo(() => {
    return [
      // Event Time, internal column
      {
        name: "start_time_microseconds",
        position: -1,
      },
      // is
      {
        name: "is_initial_query",
        // 2nd column
        position: 2,
        align: "center",
      },
      // Type
      {
        name: "type",
        align: "center",
        format: formatQueryLogType,
      },
      // Host
      {
        name: "host",
        format: "shortHostName",
      },
      // IDs
      {
        name: "query_id",
        align: "center",
        format: (v: any) => (
          <div className="truncate max-w-[200px]" title={String(v)}>
            {v}
          </div>
        ),
      },
      {
        name: "initial_query_id",
        align: "center",
        format: (v: any) => (
          <div className="truncate max-w-[200px]" title={String(v)}>
            {v}
          </div>
        ),
      },
      // Metrics
      { name: "query_duration_ms", align: "center", format: "millisecond" },
      { name: "read_rows", align: "center", format: "comma_number" },
      { name: "read_bytes", align: "center", format: "binary_size" },
      { name: "written_rows", align: "center", format: "comma_number" },
      { name: "written_bytes", align: "center", format: "binary_size" },
      { name: "result_rows", align: "center", format: "comma_number" },
      { name: "result_bytes", align: "center", format: "binary_size" },
      { name: "memory_usage", align: "center", format: "binary_size" },
      // Exception Code
      {
        name: "exception_code",
        align: "center",
        format: (value: any) => {
          if (value !== undefined && value !== 0) {
            return <span className="text-red-600 dark:text-red-400">{value}</span>;
          }
          return "N/A";
        },
      },
      // Query
      {
        name: "query",
        align: "center",
        format: "sql",
      },
    ];
  }, []);

  // 1. Collect all unique ProfileEvents keys
  const profileEventKeys = useMemo(() => {
    const keys = new Set<string>();
    queryLogs.forEach((log) => {
      if (log.ProfileEvents) {
        Object.keys(log.ProfileEvents).forEach((key) => keys.add(key));
      }
    });
    return Array.from(keys).sort();
  }, [queryLogs]);

  // 2. Prepare data with flattened structure for the detailed table
  const detailedTableData = useMemo(() => {
    return queryLogs.map((log) => {
      const flatData: any = {
        ...log,
      };

      // Flatten ProfileEvents
      if (log.ProfileEvents) {
        Object.entries(log.ProfileEvents).forEach(([key, value]) => {
          flatData[`pe_${key}`] = value;
        });
      }

      return flatData;
    });
  }, [queryLogs]);

  // 3. Define field options for the detailed table
  const detailedFieldOptions: FieldOption[] = useMemo(() => {
    const options: FieldOption[] = [
      {
        name: "host",
        format: "shortHostName",
      },
      { name: "start_time_microseconds", align: "center" },
      { name: "written_rows", align: "center", format: "comma_number" },
      { name: "written_bytes", align: "center", format: "binary_size" },
      { name: "read_rows", align: "center", format: "comma_number" },
      { name: "read_bytes", align: "center", format: "binary_size" },
      { name: "result_rows", align: "center", format: "comma_number" },
      { name: "result_bytes", align: "center", format: "binary_size" },
    ];

    // Add ProfileEvents columns
    profileEventKeys.forEach((key) => {
      options.push({
        name: `pe_${key}`,
        title: key,
        align: "center",
        format: "comma_number",
      });
    });

    return options;
  }, [profileEventKeys]);

  // 4. Construct meta for the detailed table to ensure columns are rendered
  const detailedMeta = useMemo(() => {
    return detailedFieldOptions
      .map((option) => ({
        name: option.name || "",
        type: "String",
      }))
      .filter((m) => m.name !== "");
  }, [detailedFieldOptions]);

  return (
    <div className="w-full flex flex-col gap-6">
      <CollapsibleSection title="Query Logs by Host">
        <DataTable
          enableIndexColumn
          data={queryLogs}
          meta={meta || []}
          fieldOptions={fieldOptions}
          defaultSort={{ column: "event_timestamp", direction: "desc" }}
        />
      </CollapsibleSection>

      <CollapsibleSection title="Detailed Metrics & Profile Events">
        <DataTable
          enableClientSorting
          data={detailedTableData}
          meta={detailedMeta}
          fieldOptions={detailedFieldOptions}
          defaultSort={{ column: "start_time_microseconds", direction: "desc" }}
        />
      </CollapsibleSection>

      <div className="pb-12"></div>
    </div>
  );
}
