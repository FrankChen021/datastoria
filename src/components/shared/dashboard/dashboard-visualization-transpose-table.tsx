"use client";

import { CardContent } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Formatter, type FormatName } from "@/lib/formatter";
import React, { useCallback, useEffect, useState } from "react";
import type { FieldOption, TransposeTableDescriptor } from "./dashboard-model";
import type { VisualizationRef } from "./dashboard-visualization-layout";
import { inferFieldFormat } from "./format-inference";

export interface TransposeTableVisualizationProps {
  // Data from facade
  data: Record<string, unknown>[];
  descriptor: TransposeTableDescriptor;
}

export type TransposeTableVisualizationRef = VisualizationRef;

/**
 * Pure transpose-table visualization component.
 * Receives data as props and handles only rendering and UI interactions.
 * No data fetching, no useConnection, no useRefreshable.
 */
export const TransposeTableVisualization = React.forwardRef<
  TransposeTableVisualizationRef,
  TransposeTableVisualizationProps
>(function TransposeTableVisualization(props, ref) {
  const { data, descriptor } = props;

  // Extract single row from data array
  const singleRowData = data.length > 0 ? data[0] : null;

  // Store inferred formats for fields that don't have explicit formats
  const [inferredFormats, setInferredFormats] = useState<Map<string, FormatName>>(new Map());

  // Get field option for a given key
  const getFieldOption = useCallback(
    (key: string): FieldOption | undefined => {
      if (!descriptor.fieldOptions) {
        return undefined;
      }

      // Handle both Map and Record types
      if (descriptor.fieldOptions instanceof Map) {
        return descriptor.fieldOptions.get(key);
      } else {
        return descriptor.fieldOptions[key];
      }
    },
    [descriptor.fieldOptions]
  );

  // Infer formats when data changes
  useEffect(() => {
    if (!singleRowData) {
      setInferredFormats(new Map());
      return;
    }

    const formats = new Map<string, FormatName>();
    const sampleRows = [singleRowData]; // Single row for transpose table

    Object.keys(singleRowData).forEach((key) => {
      const fieldOption = getFieldOption(key);
      // Only infer if no format is specified in the descriptor
      if (!fieldOption?.format) {
        const inferredFormat = inferFieldFormat(key, sampleRows);
        if (inferredFormat) {
          formats.set(key, inferredFormat);
        }
      }
    });

    setInferredFormats(formats);
  }, [singleRowData, getFieldOption]);

  // Format cell value based on field options
  const formatCellValue = useCallback(
    (key: string, value: unknown): React.ReactNode => {
      // Handle empty values
      if (
        value === null ||
        value === undefined ||
        (typeof value === "string" && value.trim() === "")
      ) {
        return <span className="text-muted-foreground">-</span>;
      }

      // Check if there's a field option for this key
      const fieldOption = getFieldOption(key);
      // Use explicit format from field option, or inferred format, or no format
      const format = fieldOption?.format || inferredFormats.get(key);

      if (format) {
        let formatted: string | React.ReactNode;

        // Check if format is a function (ObjectFormatter) or a string (FormatName)
        if (typeof format === "function") {
          // It's an ObjectFormatter function - call it directly
          formatted = format(value, fieldOption?.formatArgs);
        } else {
          // It's a FormatName string - use Formatter.getInstance()
          const formatter = Formatter.getInstance().getFormatter(format);
          formatted = formatter(value, fieldOption?.formatArgs);
        }

        // If formatter returns empty string, show '-'
        if (formatted === "" || (typeof formatted === "string" && formatted.trim() === "")) {
          return <span className="text-muted-foreground">-</span>;
        }
        return formatted;
      }

      // Default formatting
      // Handle arrays - render each element on one line
      if (Array.isArray(value)) {
        if (value.length === 0) {
          return <span className="text-muted-foreground">[]</span>;
        }
        return (
          <div className="flex flex-col gap-1">
            {value.map((item, index) => (
              <span key={index} className="whitespace-nowrap">
                {String(item)}
              </span>
            ))}
          </div>
        );
      }

      // Handle objects (non-array)
      if (typeof value === "object") {
        return <span className="font-mono text-xs">{JSON.stringify(value)}</span>;
      }

      const stringValue = String(value);
      // If string conversion results in empty, show '-'
      if (stringValue.trim() === "") {
        return <span className="text-muted-foreground">-</span>;
      }

      return <span className="whitespace-nowrap">{stringValue}</span>;
    },
    [getFieldOption, inferredFormats]
  );

  // Render functions for TableBody
  const renderNoData = useCallback(() => {
    if (singleRowData !== null) return null;
    return (
      <TableRow>
        <TableCell colSpan={2} className="text-center text-muted-foreground p-8">
          <div className="flex items-center justify-center h-[72px]">No data</div>
        </TableCell>
      </TableRow>
    );
  }, [singleRowData]);

  const renderData = useCallback(() => {
    if (!singleRowData) return null;

    // Get all field entries and preserve natural order
    // Track original index to maintain natural order for fields without position
    const fieldEntries = Object.entries(singleRowData).map(([key, value], originalIndex) => {
      const fieldOption = getFieldOption(key);
      return {
        key,
        value,
        fieldOption,
        position: fieldOption?.position ?? Number.MAX_SAFE_INTEGER,
        originalIndex, // Preserve natural order
      };
    });

    // Sort by position if available, otherwise maintain natural order
    fieldEntries.sort((a, b) => {
      // If both have positions (not MAX_SAFE_INTEGER), sort by position
      const aHasPosition = a.position !== Number.MAX_SAFE_INTEGER;
      const bHasPosition = b.position !== Number.MAX_SAFE_INTEGER;

      if (aHasPosition && bHasPosition) {
        // Both have positions: sort by position
        if (a.position !== b.position) {
          return a.position - b.position;
        }
        // Same position: maintain natural order
        return a.originalIndex - b.originalIndex;
      } else if (aHasPosition && !bHasPosition) {
        // Only a has position: a comes first
        return -1;
      } else if (!aHasPosition && bHasPosition) {
        // Only b has position: b comes first
        return 1;
      } else {
        // Neither has position: maintain natural order
        return a.originalIndex - b.originalIndex;
      }
    });

    return (
      <>
        {fieldEntries.map(({ key, value }) => {
          const fieldOption = getFieldOption(key);
          const displayName = fieldOption?.title || key;
          return (
            <TableRow key={key} className="hover:bg-muted/50">
              <TableCell className="p-2 whitespace-nowrap font-medium">{displayName}</TableCell>
              <TableCell className="p-2">{formatCellValue(key, value)}</TableCell>
            </TableRow>
          );
        })}
      </>
    );
  }, [singleRowData, formatCellValue, getFieldOption]);

  // Expose methods via ref
  React.useImperativeHandle(ref, () => ({
    getDropdownItems: () => null, // No visualization-specific dropdown items for transpose-table
    prepareDataFetchSql: (sql: string, _pageNumber?: number) => sql,
  }));

  return (
    <CardContent className="px-0 pb-0 h-full overflow-auto">
      <Table>
        <TableHeader>
          <TableRow className="hover:bg-muted/50 select-none h-10">
            <TableHead className="text-left whitespace-nowrap p-2">Name</TableHead>
            <TableHead className="text-left whitespace-nowrap p-2">Value</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {renderNoData()}
          {renderData()}
        </TableBody>
      </Table>
    </CardContent>
  );
});
