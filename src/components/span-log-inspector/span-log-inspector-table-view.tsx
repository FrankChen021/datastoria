import { CollapsibleSection } from "@/components/shared/collapsible-section";
import type { FieldOption } from "@/components/shared/dashboard/dashboard-model";
import { DataTable } from "@/components/shared/dashboard/data-table";
import { useMemo } from "react";

interface SpanLogInspectorTableViewProps {
  traceLogs: Record<string, unknown>[];
}

export function SpanLogInspectorTableView({ traceLogs }: SpanLogInspectorTableViewProps) {
  const fieldOptions: FieldOption[] = useMemo(() => {
    return [
      { name: "service_name" },
      { name: "operation_name" },
      { name: "span_kind" },
      { name: "status_code", align: "center" },
      { name: "start_time_us", format: "microsecond", align: "center" },
      { name: "duration_us", format: "microsecond", align: "center" },
      { name: "trace_id" },
      { name: "span_id" },
      { name: "parent_span_id" },
    ];
  }, []);

  const meta = useMemo(() => {
    const names = new Set<string>();
    for (const row of traceLogs) {
      for (const key of Object.keys(row)) {
        names.add(key);
      }
    }
    return Array.from(names).map((name) => ({ name, type: "String" }));
  }, [traceLogs]);

  return (
    <div className="w-full flex flex-col gap-6 py-2">
      <CollapsibleSection title="Trace Spans">
        <DataTable
          enableIndexColumn
          enableShowRowDetail
          enableCompactMode
          data={traceLogs}
          meta={meta}
          fieldOptions={fieldOptions}
          defaultSort={{ column: "start_time_us", direction: "desc" }}
        />
      </CollapsibleSection>
      <div className="pb-12"></div>
    </div>
  );
}
