import { DataTable } from "@/components/shared/dashboard/data-table";
import type { JSONFormatResponse } from "@/lib/connection/connection";
import { memo } from "react";
import type { QueryResponseViewModel } from "../query-view-model";

interface QueryResponseTableViewProps {
  queryResponse: QueryResponseViewModel;
  enableCompactMode?: boolean;
}

export const QueryResponseTableView = memo(function QueryResponseTableView({
  queryResponse,
  enableCompactMode = true,
}: QueryResponseTableViewProps) {
  // Parse JSON response for table view
  let parsedTableData: {
    meta: { name: string; type?: string }[];
    data: Record<string, unknown>[];
  } | null = null;

  try {
    // Try to parse as JSON if it's a string
    let jsonData: JSONFormatResponse | null = null;
    if (typeof queryResponse.data === "string") {
      jsonData = JSON.parse(queryResponse.data) as JSONFormatResponse;
    } else if (typeof queryResponse.data === "object" && queryResponse.data !== null) {
      jsonData = queryResponse.data as JSONFormatResponse;
    }

    // Validate structure
    if (jsonData && jsonData.meta && Array.isArray(jsonData.data)) {
      parsedTableData = {
        meta: jsonData.meta,
        data: jsonData.data as Record<string, unknown>[],
      };
    }
  } catch {
    parsedTableData = null;
  }

  if (!parsedTableData) {
    return (
      <div className="pb-4 text-sm text-muted-foreground">
        Unable to parse table data. Please ensure the query returns JSON format.
      </div>
    );
  }

  if (parsedTableData.data.length === 0) {
    return (
      <div className="pb-4 text-sm text-muted-foreground">
        Query was executed successfully. No data is returned to show.
      </div>
    );
  }

  return (
    <div className="h-full w-full border-b">
      <DataTable
        data={parsedTableData.data}
        meta={parsedTableData.meta}
        fieldOptions={[]}
        enableIndexColumn={true}
        enableCompactMode={enableCompactMode}
        enableCellExpansion={true}
      />
    </div>
  );
});
