import { CollapsibleSection } from "@/components/collapsible-section";
import { ThemedSyntaxHighlighter } from "@/components/themed-syntax-highlighter";
import { Button } from "@/components/ui/button";
import { Formatter } from "@/lib/formatter";
import { StringUtils } from "@/lib/string-utils";
import { ArrowDown, ArrowUp, ArrowUpDown, X } from "lucide-react";
import React, { memo, useCallback, useMemo, useState } from "react";
import { Panel } from "react-resizable-panels";

// Reusable table component with sticky header and sorting
interface SortableKeyValueTableProps {
  data: Array<[string, unknown]>;
  firstColumnHeader: string;
  secondColumnHeader: string;
  formatValue?: (value: unknown) => string | React.ReactNode;
  emptyMessage?: string;
  maxHeight?: string;
}

// Default format function - moved outside component to avoid recreation
const defaultFormatValue = (value: unknown): string | React.ReactNode => {
  if (value === null) {
    return "null";
  } else if (typeof value === "object") {
    return JSON.stringify(value, null, 2);
  } else {
    return String(value);
  }
};

function SortableKeyValueTable({
  data,
  firstColumnHeader,
  secondColumnHeader,
  formatValue,
  emptyMessage = "No data available",
  maxHeight = "300px",
}: SortableKeyValueTableProps) {
  const [sort, setSort] = useState<{ column: "key" | "value" | null; direction: "asc" | "desc" | null }>({
    column: null,
    direction: null,
  });

  const handleSort = useCallback((column: "key" | "value") => {
    setSort((prevSort) => {
      if (prevSort.column === column) {
        // Cycle through: asc -> desc -> null
        if (prevSort.direction === "asc") {
          return { column, direction: "desc" };
        } else if (prevSort.direction === "desc") {
          return { column: null, direction: null };
        } else {
          return { column, direction: "asc" };
        }
      } else {
        return { column, direction: "asc" };
      }
    });
  }, []);

  const getSortIcon = useCallback(
    (column: "key" | "value") => {
      if (sort.column !== column) {
        return <ArrowUpDown className="inline-block w-4 h-4 ml-1 opacity-50" />;
      }
      if (sort.direction === "asc") {
        return <ArrowUp className="inline-block w-4 h-4 ml-1" />;
      }
      if (sort.direction === "desc") {
        return <ArrowDown className="inline-block w-4 h-4 ml-1" />;
      }
      return <ArrowUpDown className="inline-block w-4 h-4 ml-1 opacity-50" />;
    },
    [sort]
  );

  const sortedData = useMemo(() => {
    if (!sort.column || !sort.direction) {
      return data;
    }

    return [...data].sort((a, b) => {
      const aValue = sort.column === "key" ? a[0] : a[1];
      const bValue = sort.column === "key" ? b[0] : b[1];

      // Handle null/undefined values
      const aVal = aValue == null ? "" : aValue;
      const bVal = bValue == null ? "" : bValue;

      // Compare values
      let comparison = 0;
      if (typeof aVal === "number" && typeof bVal === "number") {
        comparison = aVal - bVal;
      } else {
        comparison = String(aVal).localeCompare(String(bVal));
      }

      return sort.direction === "asc" ? comparison : -comparison;
    });
  }, [data, sort]);

  const formatCellValue = formatValue || defaultFormatValue;

  if (sortedData.length === 0) {
    return <div className="text-sm text-muted-foreground">{emptyMessage}</div>;
  }

  return (
    <div className={`max-h-[${maxHeight}] overflow-auto border rounded-md`} style={{ maxHeight }}>
      <table className="w-full caption-bottom text-sm">
        <thead className="[&_tr]:border-b sticky top-0 z-10 bg-background">
          <tr className="border-b transition-colors hover:bg-muted/50 data-[state=selected]:bg-muted">
            <th
              className="px-4 text-left align-middle font-medium text-muted-foreground whitespace-nowrap h-10 cursor-pointer hover:bg-muted/50 select-none bg-background w-[200px]"
              onClick={() => handleSort("key")}
            >
              {firstColumnHeader}
              {getSortIcon("key")}
            </th>
            <th
              className="px-4 text-left align-middle font-medium text-muted-foreground [&:has([role=checkbox])]:pr-0 whitespace-nowrap h-10 cursor-pointer hover:bg-muted/50 select-none bg-background"
              onClick={() => handleSort("value")}
            >
              {secondColumnHeader}
              {getSortIcon("value")}
            </th>
          </tr>
        </thead>
        <tbody className="[&_tr:last-child]:border-0">
          {sortedData.map(([key, value]) => (
            <tr key={key} className="border-b transition-colors hover:bg-muted/50 data-[state=selected]:bg-muted">
              <td className="p-4 align-middle font-medium !p-2">{key}</td>
              <td className="p-4 align-middle break-words !p-2">{formatCellValue(value)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// Helper function to get comma number formatter
function getCommaNumberFormatter() {
  const formatter = Formatter.getInstance();
  return formatter.getFormatter("comma_number");
}

// Format function for settings table
function formatSettingsValue(value: unknown): string | React.ReactNode {
  if (value === null) {
    return "null";
  } else if (typeof value === "object") {
    return JSON.stringify(value, null, 2);
  } else if (typeof value === "number") {
    return getCommaNumberFormatter()(value);
  } else {
    return String(value);
  }
}

// Format function for profile events table - always uses comma_number format
function formatProfileEventsValue(value: unknown): string | React.ReactNode {
  if (value === null) {
    return "null";
  } else if (typeof value === "object") {
    return JSON.stringify(value, null, 2);
  } else {
    // Always use comma_number format for ProfileEvents values
    // Try to parse as number first, if it's a number, format it
    const numValue = typeof value === "number" ? value : Number(value);
    if (!isNaN(numValue) && isFinite(numValue)) {
      return getCommaNumberFormatter()(numValue);
    } else {
      // If not a valid number, just convert to string
      return String(value);
    }
  }
}

// Component: Query Log Detail Pane
interface QueryLogDetailPaneProps {
  selectedQueryLog: any;
  onClose: () => void;
  sourceNode?: string;
  targetNode?: string;
}

export const QueryLogDetailPane = memo(function QueryLogDetailPane({
  selectedQueryLog,
  onClose,
  sourceNode,
  targetNode,
}: QueryLogDetailPaneProps) {
  // Render main query log table
  const renderMainQueryLogTable = useMemo(() => {
    if (!selectedQueryLog) {
      return null;
    }

    // Filter out excluded fields for main query log table
    const excludedFields = new Set([
      "query",
      "ProfileEvents",
      "Settings",
      "settings",
      "host_id", // Internal field we added
      "read_rows", // Moved to Overview section
      "read_bytes", // Moved to Overview section
      "written_rows", // Moved to Overview section
      "written_bytes", // Moved to Overview section
    ]);

    // Get all fields from queryLog and filter - combine filters for better performance
    const mainFields = Object.keys(selectedQueryLog)
      .filter((key) => {
        // Exclude specific fields
        if (excludedFields.has(key)) {
          return false;
        }
        const value = selectedQueryLog[key];
        // Exclude empty strings, empty arrays, and undefined values
        if (value === "" || value === undefined) {
          return false;
        }
        if (Array.isArray(value) && value.length === 0) {
          return false;
        }
        return true;
      })
      .map((key) => [key, selectedQueryLog[key]] as [string, unknown]);

    return (
      <SortableKeyValueTable
        data={mainFields}
        firstColumnHeader="Field"
        secondColumnHeader="Value"
        maxHeight="400px"
        emptyMessage="No data available"
      />
    );
  }, [selectedQueryLog]);

  // Render settings table
  const renderSettingsTable = useMemo(() => {
    if (!selectedQueryLog) {
      return null;
    }

    const settings = selectedQueryLog.settings || selectedQueryLog.Settings || {};
    const settingsEntries = Object.entries(settings).sort(([a], [b]) => a.localeCompare(b));

    return (
      <SortableKeyValueTable
        data={settingsEntries}
        firstColumnHeader="Setting"
        secondColumnHeader="Value"
        formatValue={formatSettingsValue}
        emptyMessage="No settings available"
      />
    );
  }, [selectedQueryLog]);

  // Render profile events table
  const renderProfileEventsTable = useMemo(() => {
    if (!selectedQueryLog) {
      return null;
    }

    const profileEvents = selectedQueryLog.ProfileEvents || {};
    const profileEventsEntries = Object.entries(profileEvents).sort(([a], [b]) => a.localeCompare(b));

    return (
      <SortableKeyValueTable
        data={profileEventsEntries}
        firstColumnHeader="Event"
        secondColumnHeader="Value"
        formatValue={formatProfileEventsValue}
        maxHeight="400px"
        emptyMessage="No profile events available"
      />
    );
  }, [selectedQueryLog]);

  // Memoize formatters to avoid recreating on every render
  const milliFormatter = useMemo(() => {
    const formatter = Formatter.getInstance();
    return formatter.getFormatter("millisecond");
  }, []);

  // Memoize comma number formatter to avoid recreating on every render
  const commaNumberFormatter = useMemo(() => {
    return getCommaNumberFormatter();
  }, []);

  // Format time and duration for Overview table
  const overviewData = useMemo(() => {
    if (!selectedQueryLog) {
      return [];
    }

    const data: Array<[string, unknown]> = [];

    // Source and Target
    if (sourceNode) {
      data.push(["Query Sent From", sourceNode]);
    }
    if (targetNode) {
      data.push(["Query Executed On", targetNode]);
    }

    // Start Time from query_start_time_microseconds
    const startTime = selectedQueryLog.query_start_time_microseconds;
    if (startTime !== undefined && startTime !== null) {
      data.push(["Start Time", String(startTime)]);
    }

    // Duration
    const duration = selectedQueryLog.query_duration_ms;
    if (duration !== undefined && duration !== null) {
      const formatted = milliFormatter(duration);
      const formattedDuration = typeof formatted === "string" ? formatted : String(formatted);
      data.push(["Duration", formattedDuration]);
    }

    // Read rows and bytes
    const readRows = selectedQueryLog.read_rows;
    if (readRows !== undefined && readRows !== null) {
      data.push(["Read Rows", commaNumberFormatter(readRows)]);
    }

    const readBytes = selectedQueryLog.read_bytes;
    if (readBytes !== undefined && readBytes !== null) {
      data.push(["Read Bytes", commaNumberFormatter(readBytes)]);
    }

    // Written rows and bytes
    const writtenRows = selectedQueryLog.written_rows;
    if (writtenRows !== undefined && writtenRows !== null) {
      data.push(["Written Rows", commaNumberFormatter(writtenRows)]);
    }

    const writtenBytes = selectedQueryLog.written_bytes;
    if (writtenBytes !== undefined && writtenBytes !== null) {
      data.push(["Written Bytes", commaNumberFormatter(writtenBytes)]);
    }

    return data;
  }, [selectedQueryLog, sourceNode, targetNode, milliFormatter, commaNumberFormatter]);

  if (!selectedQueryLog) return null;

  return (
    <Panel defaultSize={40} minSize={5} maxSize={70} className="bg-background border-l shadow-lg flex flex-col">
      {/* Header with close button */}
      <div className="flex items-center justify-between px-3 py-2 border-b flex-shrink-0 h-10">
        <h4 className="truncate font-semibold text-sm">Query Id: {selectedQueryLog.query_id}</h4>
        <Button variant="ghost" size="icon" onClick={onClose} className="h-8 w-8">
          <X className="h-4 w-4" />
        </Button>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-auto space-y-2">
        {/* Overview Section */}
        <CollapsibleSection title="Overview" className="border-0" defaultOpen={true}>
          <div className="px-3 py-1">
            {overviewData.length > 0 ? (
              <SortableKeyValueTable
                data={overviewData}
                firstColumnHeader="Field"
                secondColumnHeader="Value"
                emptyMessage="No overview data available"
                maxHeight="350px"
              />
            ) : (
              <div className="text-sm text-muted-foreground">No overview data available</div>
            )}
          </div>
        </CollapsibleSection>

        {/* Query Section */}
        <CollapsibleSection title="Query" className="border-0" defaultOpen={true}>
          <div className="px-3 py-1">
            <div className="overflow-x-auto border rounded-md">
              <ThemedSyntaxHighlighter
                customStyle={{ fontSize: "14px", margin: 0 }}
                language="sql"
                showLineNumbers={true}
              >
                {StringUtils.prettyFormatQuery(selectedQueryLog.query || "")}
              </ThemedSyntaxHighlighter>
            </div>
          </div>
        </CollapsibleSection>

        {/* Query Log Section */}
        <CollapsibleSection title="Query Log" className="border-0" defaultOpen={true}>
          <div className="px-3 py-1">{renderMainQueryLogTable}</div>
        </CollapsibleSection>

        {/* Profile Events Section */}
        <CollapsibleSection title="Profile Events" className="border-0" defaultOpen={true}>
          <div className="px-3 py-1">{renderProfileEventsTable}</div>
        </CollapsibleSection>

        {/* Settings Section */}
        <CollapsibleSection title="Settings" className="border-0" defaultOpen={false}>
          <div className="px-3 py-1">{renderSettingsTable}</div>
        </CollapsibleSection>
      </div>
    </Panel>
  );
});
