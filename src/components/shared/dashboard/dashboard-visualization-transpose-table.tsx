"use client";

import { CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Formatter, type FormatName } from "@/lib/formatter";
import React, { useCallback, useEffect, useRef, useState } from "react";
import { SKELETON_FADE_DURATION, SKELETON_MIN_DISPLAY_TIME } from "./constants";
import type { FieldOption, TransposeTableDescriptor } from "./dashboard-model";
import { inferFieldFormat } from "./format-inference";

export interface TransposeTableVisualizationProps {
  // Data from facade
  data: Record<string, unknown> | null;
  descriptor: TransposeTableDescriptor;
  isLoading: boolean;
  error: string;
}

export interface TransposeTableVisualizationRef {
  getDropdownItems: () => React.ReactNode;
}

/**
 * Pure transpose-table visualization component.
 * Receives data as props and handles only rendering and UI interactions.
 * No data fetching, no useConnection, no useRefreshable.
 */
export const TransposeTableVisualization = React.forwardRef<
  TransposeTableVisualizationRef,
  TransposeTableVisualizationProps
>(function TransposeTableVisualization(props, ref) {
  const { data, descriptor, isLoading, error } = props;

  // Store inferred formats for fields that don't have explicit formats
  const [inferredFormats, setInferredFormats] = useState<Map<string, FormatName>>(new Map());
  // Skeleton timing state for smooth transitions
  const [shouldShowSkeleton, setShouldShowSkeleton] = useState(false);
  const [skeletonOpacity, setSkeletonOpacity] = useState(1);

  // Refs for skeleton timing
  const skeletonStartTimeRef = useRef<number | null>(null);
  const skeletonTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

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
    if (!data) {
      setInferredFormats(new Map());
      return;
    }

    const formats = new Map<string, FormatName>();
    const sampleRows = [data]; // Single row for transpose table

    Object.keys(data).forEach((key) => {
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
  }, [data, getFieldOption]);

  // Skeleton timing logic: minimum display time + fade transition
  useEffect(() => {
    const shouldShow = isLoading && data === null;

    if (shouldShow) {
      // Start showing skeleton
      if (skeletonStartTimeRef.current === null) {
        skeletonStartTimeRef.current = Date.now();
        setShouldShowSkeleton(true);
        setSkeletonOpacity(1);
      }
    } else {
      // Data loaded or loading stopped
      if (skeletonStartTimeRef.current !== null) {
        const elapsed = Date.now() - skeletonStartTimeRef.current;

        if (elapsed < SKELETON_MIN_DISPLAY_TIME) {
          // Wait for minimum display time, then fade out
          const remainingTime = SKELETON_MIN_DISPLAY_TIME - elapsed;
          skeletonTimeoutRef.current = setTimeout(() => {
            // Start fade out
            setSkeletonOpacity(0);
            // After fade completes, hide skeleton
            setTimeout(() => {
              setShouldShowSkeleton(false);
              skeletonStartTimeRef.current = null;
            }, SKELETON_FADE_DURATION);
          }, remainingTime);
        } else {
          // Already shown long enough, fade out immediately
          setSkeletonOpacity(0);
          setTimeout(() => {
            setShouldShowSkeleton(false);
            skeletonStartTimeRef.current = null;
          }, SKELETON_FADE_DURATION);
        }
      }
    }

    return () => {
      if (skeletonTimeoutRef.current) {
        clearTimeout(skeletonTimeoutRef.current);
        skeletonTimeoutRef.current = null;
      }
    };
  }, [isLoading, data]);

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
  const renderError = useCallback(() => {
    if (!error) return null;
    return (
      <TableRow>
        <TableCell colSpan={2} className="text-center text-destructive p-8">
          <div className="flex flex-col items-center justify-center h-[72px] gap-2">
            <p className="font-semibold">Error loading transposed table data:</p>
            <p className="text-sm">{error}</p>
          </div>
        </TableCell>
      </TableRow>
    );
  }, [error]);

  const renderLoading = useCallback(() => {
    // Only show skeleton when shouldShowSkeleton is true (with timing logic)
    if (!shouldShowSkeleton) return null;
    return (
      <>
        {Array.from({ length: 3 }).map((_, index) => (
          <TableRow
            key={index}
            className="transition-opacity duration-150"
            style={{ opacity: skeletonOpacity }}
          >
            <TableCell className="whitespace-nowrap !p-2">
              <Skeleton className="h-5 w-32" />
            </TableCell>
            <TableCell className="whitespace-nowrap !p-2">
              <Skeleton className="h-5 w-full" />
            </TableCell>
          </TableRow>
        ))}
      </>
    );
  }, [shouldShowSkeleton, skeletonOpacity]);

  const renderNoData = useCallback(() => {
    if (error || shouldShowSkeleton || data !== null) return null;
    return (
      <TableRow>
        <TableCell colSpan={2} className="text-center text-muted-foreground p-8">
          <div className="flex items-center justify-center h-[72px]">No data found</div>
        </TableCell>
      </TableRow>
    );
  }, [error, shouldShowSkeleton, data]);

  const renderData = useCallback(() => {
    // Don't show data while skeleton is visible (during minimum display time)
    if (error || !data || shouldShowSkeleton) return null;

    // Get all field entries and preserve natural order
    // Track original index to maintain natural order for fields without position
    const fieldEntries = Object.entries(data).map(([key, value], originalIndex) => {
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
  }, [error, data, shouldShowSkeleton, formatCellValue, getFieldOption]);

  // Expose methods via ref
  React.useImperativeHandle(ref, () => ({
    getDropdownItems: () => null, // No visualization-specific dropdown items for transpose-table
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
          {renderError()}
          {renderLoading()}
          {renderNoData()}
          {renderData()}
        </TableBody>
      </Table>
    </CardContent>
  );
});

TransposeTableVisualization.displayName = "TransposeTableVisualization";
