import type { FieldOption } from "@/components/shared/dashboard/dashboard-model";
import { DataTable } from "@/components/shared/dashboard/data-table";
import { useMemo } from "react";

interface SpanLogInspectorTableViewProps {
  spanLogs: Record<string, unknown>[];
}

export function SpanLogInspectorTableView({ spanLogs }: SpanLogInspectorTableViewProps) {
  const fieldOptions: FieldOption[] = useMemo(() => {
    return [
      {
        name: "start_time_us",
        format: "yyyyMMddHHmmssSSS",
        formatArgs: [1000],
        align: "center",
      } as FieldOption,
      {
        name: "finish_time_us",
        format: "yyyyMMddHHmmssSSS",
        formatArgs: [1000],
        align: "center",
      } as FieldOption,
    ];
  }, []);

  const meta = useMemo(() => {
    if (spanLogs.length === 0) {
      return [];
    }
    return Object.keys(spanLogs[0]).map((name) => ({ name, type: "String" }));
  }, [spanLogs]);

  return (
    <div className="w-full flex flex-col gap-6">
      <DataTable
        className="border-t border-b"
        enableIndexColumn
        enableShowRowDetail
        enableCompactMode
        data={spanLogs}
        meta={meta}
        fieldOptions={fieldOptions}
        defaultSort={{ column: "start_time_us", direction: "desc" }}
      />
      <div className="pb-12"></div>
    </div>
  );
}
