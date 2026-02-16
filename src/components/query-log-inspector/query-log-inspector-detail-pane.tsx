import { CollapsibleSection } from "@/components/shared/collapsible-section";
import type { FieldOption } from "@/components/shared/dashboard/dashboard-model";
import { DataTable } from "@/components/shared/dashboard/data-table";
import { ThemedSyntaxHighlighter } from "@/components/shared/themed-syntax-highlighter";
import { Button } from "@/components/ui/button";
import { Formatter, type ObjectFormatter } from "@/lib/formatter";
import { SqlUtils } from "@/lib/sql-utils";
import { ChevronLeft, ChevronRight, X } from "lucide-react";
import React, { memo, useEffect, useMemo, useState } from "react";
import { Panel } from "react-resizable-panels";

// Helper function to get comma number formatter
function getCommaNumberFormatter() {
  const formatter = Formatter.getInstance();
  return formatter.getFormatter("comma_number");
}

// Component: Query Log Detail Pane

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
  queryLogs: Record<string, unknown>[];
  onClose: () => void;
  sourceNode?: string;
  targetNode?: string;
  className?: string;
}

export const QueryLogDetailPane = memo(function QueryLogDetailPane({
  queryLogs,
  onClose,
  sourceNode,
  targetNode,
  className,
}: QueryLogDetailPaneProps) {
  const [currentIndex, setCurrentIndex] = useState(0);

  // Reset index when the set of query logs changes (new edge clicked).
  useEffect(() => {
    setCurrentIndex(0);
  }, [queryLogs]);

  const selectedQueryLog = queryLogs[currentIndex];
  const totalCount = queryLogs.length;
  const hasMultiple = totalCount > 1;

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
    const data = Object.keys(selectedQueryLog)
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
      .map((key) => ({ field: key, value: selectedQueryLog[key] }));

    const meta = [{ name: "field" }, { name: "value" }];
    const fieldOptions: FieldOption[] = [
      {
        name: "value",

        // The table is a transposed table (only field and value columns)
        // So we can't use 'shortHostName' formatter name directly
        format: (v: unknown, _args?: unknown[], context?: Record<string, unknown>) => {
          if (context?.field === "host") {
            return Formatter.getInstance().getFormatter("shortHostName")(v);
          }
          // Handle object values to prevent "Objects are not valid as a React child" error
          if (v !== null && typeof v === "object") {
            return JSON.stringify(v, null, 2);
          }
          return v as string | React.ReactNode;
        },
      },
    ];

    return <DataTable data={data} meta={meta} fieldOptions={fieldOptions} className="h-auto" />;
  }, [selectedQueryLog]);

  // Render settings table
  const renderSettingsTable = useMemo(() => {
    if (!selectedQueryLog) {
      return null;
    }

    const settings = selectedQueryLog.settings || selectedQueryLog.Settings || {};
    const data = Object.entries(settings)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, value]) => ({ setting: key, value }));

    const meta = [{ name: "setting" }, { name: "value" }];
    const fieldOptions: FieldOption[] = [
      { name: "value", format: formatSettingsValue as ObjectFormatter },
    ];

    return <DataTable data={data} meta={meta} fieldOptions={fieldOptions} className="h-auto" />;
  }, [selectedQueryLog]);

  // Render profile events table
  const renderProfileEventsTable = useMemo(() => {
    if (!selectedQueryLog) {
      return null;
    }

    const profileEvents = selectedQueryLog.ProfileEvents || {};
    const data = Object.entries(profileEvents)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, value]) => ({ event: key, value }));

    const meta = [{ name: "event" }, { name: "value" }];
    const fieldOptions: FieldOption[] = [
      { name: "value", format: formatProfileEventsValue as ObjectFormatter },
    ];

    return <DataTable data={data} meta={meta} fieldOptions={fieldOptions} className="h-auto" />;
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
    const startTime = selectedQueryLog.start_time_microseconds;
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
    <Panel
      defaultSize={40}
      minSize={5}
      maxSize={70}
      className={`bg-background shadow-lg flex flex-col h-full border-t ${className ?? ""}`}
    >
      {/* Header with sub-query navigator and close button */}
      <div className="flex items-center justify-between px-2 border-b flex-shrink-0 h-8">
        <h4 className="truncate font-semibold text-sm min-w-0">
          Query Id: {String(selectedQueryLog.query_id)}
        </h4>
        <div className="flex items-center gap-1 flex-shrink-0">
          {hasMultiple && (
            <>
              <Button
                variant="ghost"
                size="icon"
                className="h-6 w-6"
                disabled={currentIndex === 0}
                onClick={() => setCurrentIndex(currentIndex - 1)}
              >
                <ChevronLeft className="!h-3 !w-3" />
              </Button>
              <span className="text-xs text-muted-foreground whitespace-nowrap">
                {currentIndex + 1} / {totalCount}
              </span>
              <Button
                variant="ghost"
                size="icon"
                className="h-6 w-6"
                disabled={currentIndex === totalCount - 1}
                onClick={() => setCurrentIndex(currentIndex + 1)}
              >
                <ChevronRight className="!h-3 !w-3" />
              </Button>
            </>
          )}
          <Button variant="ghost" size="icon" onClick={onClose} className="h-6 w-6">
            <X className="!h-3 !w-3" />
          </Button>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 min-h-0 overflow-y-auto space-y-2 pb-32">
        {/* Overview Section */}
        <CollapsibleSection title="Overview" className="border-0 rounded-none" defaultOpen={true}>
          <div className="px-3 py-1">
            {overviewData.length > 0 ? (
              <DataTable
                data={overviewData.map(([key, value]) => ({ field: key, value }))}
                meta={[{ name: "field" }, { name: "value" }]}
                fieldOptions={[
                  {
                    name: "value",
                    format: (v: unknown, _args?: unknown[], context?: Record<string, unknown>) => {
                      if (
                        context?.field === "Query Sent From" ||
                        context?.field === "Query Executed On"
                      ) {
                        return Formatter.getInstance().getFormatter("shortHostName")(v);
                      }
                      // Handle object values to prevent "Objects are not valid as a React child" error
                      if (v !== null && typeof v === "object") {
                        return JSON.stringify(v, null, 2);
                      }
                      return v as string | React.ReactNode;
                    },
                  },
                ]}
                className="h-auto"
              />
            ) : (
              <div className="text-sm text-muted-foreground">No overview data available</div>
            )}
          </div>
        </CollapsibleSection>

        {/* Query Section */}
        <CollapsibleSection title="Query" className="border-0 rounded-none" defaultOpen={true}>
          <div className="px-3 py-1">
            <div className="overflow-x-auto border rounded-md">
              <ThemedSyntaxHighlighter
                customStyle={{ fontSize: "14px", margin: 0 }}
                language="sql"
                showLineNumbers={true}
              >
                {SqlUtils.prettyFormatQuery(String(selectedQueryLog.query || ""))}
              </ThemedSyntaxHighlighter>
            </div>
          </div>
        </CollapsibleSection>

        {/* Query Log Section */}
        <CollapsibleSection title="Query Log" className="border-0 rounded-none" defaultOpen={true}>
          <div className="px-3 py-1">{renderMainQueryLogTable}</div>
        </CollapsibleSection>

        {/* Profile Events Section */}
        <CollapsibleSection
          title="Profile Events"
          className="border-0 rounded-none"
          defaultOpen={true}
        >
          <div className="px-3 py-1">{renderProfileEventsTable}</div>
        </CollapsibleSection>

        {/* Settings Section */}
        <CollapsibleSection title="Settings" className="border-0 rounded-none" defaultOpen={false}>
          <div className="px-3 py-1">{renderSettingsTable}</div>
        </CollapsibleSection>
      </div>
    </Panel>
  );
});
