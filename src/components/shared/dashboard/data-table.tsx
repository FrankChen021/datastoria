import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Formatter, type FormatName } from "@/lib/formatter";
import { cn } from "@/lib/utils";
import { useVirtualizer } from "@tanstack/react-virtual";
import { ArrowDown, ArrowUp, ArrowUpDown } from "lucide-react";
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { SKELETON_FADE_DURATION, SKELETON_MIN_DISPLAY_TIME } from "./constants";
import type { ActionColumn, FieldOption } from "./dashboard-model";
import { inferFormatFromMetaType } from "./format-inference";

export interface DataTableProps {
    // Data to display
    data: Record<string, unknown>[];
    // Server metadata for column inference
    meta: { name: string; type?: string }[];
    // Field options configuration
    fieldOptions: FieldOption[];
    // Action columns configuration (optional)
    actions?: ActionColumn | ActionColumn[];
    // Loading state
    isLoading?: boolean;
    // Error message
    error?: string;
    // Show index column
    showIndexColumn?: boolean;
    // Current sort state (controlled)
    sort?: { column: string | null; direction: "asc" | "desc" | null };
    // Default sort state (uncontrolled)
    defaultSort?: { column: string | null; direction: "asc" | "desc" | null };
    // Callback when sort changes
    onSortChange?: (column: string, direction: "asc" | "desc" | null) => void;
    // Class name for the container
    className?: string;
    // Row click handler
    onRowClick?: (row: Record<string, unknown>) => void;
    // Enable client-side sorting (default: true)
    enableClientSorting?: boolean;
    // Enable sticky header (default: false)
    stickyHeader?: boolean;
}

export function DataTable({
    data,
    meta,
    fieldOptions,
    actions,
    isLoading = false,
    error,
    showIndexColumn = false,
    sort: controlledSort,
    defaultSort,
    onSortChange,
    className,
    onRowClick,
    enableClientSorting = true,
    stickyHeader = false,
}: DataTableProps) {
    // Virtualization constants
    const VIRTUALIZATION_THRESHOLD = 500;
    const ESTIMATED_ROW_HEIGHT = 33; // Height of a table row in pixels
    const OVERSCAN_COUNT = 50; // Render extra rows above/below viewport for smoother scrolling

    // Skeleton timing state
    const [shouldShowSkeleton, setShouldShowSkeleton] = useState(false);
    const [skeletonOpacity, setSkeletonOpacity] = useState(1);
    const skeletonStartTimeRef = useRef<number | null>(null);
    const skeletonTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

    // Internal sort state for uncontrolled mode
    const [internalSort, setInternalSort] = useState<{ column: string | null; direction: "asc" | "desc" | null }>(
        defaultSort || { column: null, direction: null }
    );

    // Use controlled sort if provided, otherwise internal sort
    const sort = controlledSort !== undefined ? controlledSort : internalSort;

    // Ref for virtualization scroll container
    const scrollContainerRef = useRef<HTMLDivElement>(null);

    // Calculate columns based on props
    const columns = useMemo(() => {
        // If no meta provided, we can't infer columns (unless data has keys, but let's rely on meta for now as per requirement)
        if (!meta || meta.length === 0) {
            return [];
        }

        // Normalize fieldOptions
        const fieldOptionsMap = new Map<string, FieldOption>();
        fieldOptions.forEach((option) => {
            if (option.name) {
                fieldOptionsMap.set(option.name, option);
            }
        });

        // Normalize actions
        const actionColumns = actions ? (Array.isArray(actions) ? actions : [actions]) : [];

        // Strategy:
        // 1. Start with all server columns in their natural order
        // 2. Apply field options overrides from descriptor where they match
        // 3. Only reorder columns that have a position property
        // 4. Columns without position maintain their natural order from server response
        const finalColumns: FieldOption[] = [];

        // First, build columns from server response in natural order, applying field options
        meta.forEach((colMeta: { name: string; type?: string }, originalIndex: number) => {
            const fieldOption = fieldOptionsMap.get(colMeta.name);
            const column: FieldOption = fieldOption
                ? { ...fieldOption, name: colMeta.name }
                : ({ name: colMeta.name } as FieldOption);

            // Store original index to preserve natural order for fields without position
            (column as FieldOption & { originalIndex: number }).originalIndex = originalIndex;
            finalColumns.push(column);
        });

        // Only reorder if there are fields with position property
        const hasPositionedFields = finalColumns.some((col) => col.position !== undefined && col.position >= 0);
        if (hasPositionedFields) {
            // Separate columns with position from those without
            // Note: columns with negative positions are excluded from positioning logic
            const positionedColumns: (FieldOption & { originalIndex: number })[] = [];
            const nonPositionedColumns: (FieldOption & { originalIndex: number })[] = [];

            finalColumns.forEach((col) => {
                const colWithIndex = col as FieldOption & { originalIndex: number };
                // Only include columns with non-negative positions in positioning logic
                if (col.position !== undefined && col.position >= 0) {
                    positionedColumns.push(colWithIndex);
                } else if (col.position === undefined) {
                    // Only include columns without position (not negative positions)
                    nonPositionedColumns.push(colWithIndex);
                }
                // Columns with negative positions are excluded from both arrays
            });

            // Sort positioned columns by position value, then by original index if positions are equal
            positionedColumns.sort((a, b) => {
                const posA = a.position ?? Number.MAX_SAFE_INTEGER;
                const posB = b.position ?? Number.MAX_SAFE_INTEGER;
                if (posA !== posB) {
                    return posA - posB;
                }
                // If positions are equal, maintain natural order
                return a.originalIndex - b.originalIndex;
            });

            // Sort non-positioned columns by their original index to maintain natural order
            nonPositionedColumns.sort((a, b) => a.originalIndex - b.originalIndex);

            // Build final column order: position means "desired column number" (1-indexed)
            // Convert to 0-indexed for array operations: position 2 = index 1
            const result: (FieldOption & { originalIndex: number })[] = [];

            // Create a map of position (1-indexed) -> column(s) for quick lookup
            const positionMap = new Map<number, (FieldOption & { originalIndex: number })[]>();
            positionedColumns.forEach((col) => {
                const pos = col.position!;
                if (!positionMap.has(pos)) {
                    positionMap.set(pos, []);
                }
                positionMap.get(pos)!.push(col);
            });

            // Track which non-positioned columns we've used
            const usedNonPositioned = new Set<FieldOption & { originalIndex: number }>();

            // Determine the maximum position we need to consider
            const maxPosition =
                positionedColumns.length > 0 ? Math.max(...positionedColumns.map((c) => c.position!)) : 0;
            const totalNeeded = Math.max(maxPosition, finalColumns.length);

            // Build result array: for each position from 1 to totalNeeded (1-indexed),
            // check if there's a positioned column, otherwise use the next non-positioned column
            for (let pos = 1; pos <= totalNeeded && result.length < finalColumns.length; pos++) {
                const positionedCols = positionMap.get(pos);
                if (positionedCols && positionedCols.length > 0) {
                    // Place positioned column(s) at this position (1-indexed)
                    result.push(...positionedCols);
                } else {
                    // Find the next unused non-positioned column in order
                    const nextNonPositioned = nonPositionedColumns.find((col) => !usedNonPositioned.has(col));
                    if (nextNonPositioned) {
                        result.push(nextNonPositioned);
                        usedNonPositioned.add(nextNonPositioned);
                    }
                }
            }

            // Add any remaining positioned columns that had positions beyond what we processed
            positionedColumns.forEach((col) => {
                if (!result.includes(col)) {
                    result.push(col);
                }
            });

            // Add any remaining non-positioned columns that weren't placed
            nonPositionedColumns.forEach((col) => {
                if (!usedNonPositioned.has(col)) {
                    result.push(col);
                }
            });

            finalColumns.length = 0;
            finalColumns.push(...result);
        }

        // Apply type inference to columns without format based on meta information
        // Create a map of column name to meta type for quick lookup
        const metaTypeMap = new Map<string, string>();
        meta.forEach((colMeta: { name: string; type?: string }) => {
            if (colMeta.type) {
                metaTypeMap.set(colMeta.name, colMeta.type);
            }
        });

        finalColumns.forEach((fieldOption) => {
            if (!fieldOption.format && fieldOption.name) {
                const typeString = metaTypeMap.get(fieldOption.name);
                const inferredFormat = inferFormatFromMetaType(typeString, fieldOption.name);
                if (inferredFormat) {
                    fieldOption.format = inferredFormat as FormatName;
                }
            }
        });

        // Add action columns at the end
        actionColumns.forEach((actionColumn, index) => {
            const actionFieldOption: FieldOption = {
                name: `__action_${index}__`, // Special name to identify action columns
                title: actionColumn.title || "Action",
                align: actionColumn.align || "center",
                sortable: false,
                renderAction: actionColumn.renderAction,
            };
            finalColumns.push(actionFieldOption);
        });

        // Filter out columns with negative positions (these should be hidden)
        const visibleColumns = finalColumns.filter((col) => col.position === undefined || col.position >= 0);

        return visibleColumns;
        return visibleColumns;
    }, [meta, fieldOptions, actions]);

    // Process data (sorting)
    const processedData = useMemo(() => {
        if (!enableClientSorting || !sort?.column || !sort.direction) {
            return data;
        }

        return [...data].sort((a, b) => {
            let aValue: any = a[sort.column!];
            let bValue: any = b[sort.column!];

            // Handle null/undefined
            if (aValue == null) aValue = "";
            if (bValue == null) bValue = "";

            let comparison = 0;
            if (typeof aValue === "number" && typeof bValue === "number") {
                comparison = aValue - bValue;
            } else {
                comparison = String(aValue).localeCompare(String(bValue));
            }

            return sort.direction === "asc" ? comparison : -comparison;
        });
    }, [data, sort, enableClientSorting]);

    // Skeleton timing logic
    useEffect(() => {
        const shouldShow = isLoading && processedData.length === 0;

        if (shouldShow) {
            if (skeletonStartTimeRef.current === null) {
                skeletonStartTimeRef.current = Date.now();
                setShouldShowSkeleton(true);
                setSkeletonOpacity(1);
            }
        } else {
            if (skeletonStartTimeRef.current !== null) {
                if (skeletonTimeoutRef.current) {
                    clearTimeout(skeletonTimeoutRef.current);
                    skeletonTimeoutRef.current = null;
                }

                const elapsed = Date.now() - skeletonStartTimeRef.current;

                if (elapsed < SKELETON_MIN_DISPLAY_TIME) {
                    const remainingTime = SKELETON_MIN_DISPLAY_TIME - elapsed;
                    skeletonTimeoutRef.current = setTimeout(() => {
                        setSkeletonOpacity(0);
                        setTimeout(() => {
                            setShouldShowSkeleton(false);
                            skeletonStartTimeRef.current = null;
                        }, SKELETON_FADE_DURATION);
                    }, remainingTime);
                } else {
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
    }, [isLoading, processedData.length]);

    // Handle column sorting
    const handleSort = useCallback(
        (fieldName: string) => {
            // Skip action columns
            if (fieldName.startsWith("__action_")) return;

            const fieldOption = columns.find((col) => col.name === fieldName);
            if (!fieldOption || fieldOption.sortable === false) return;

            let newDirection: "asc" | "desc" | null = "asc";

            if (sort?.column === fieldName) {
                if (sort.direction === "asc") {
                    newDirection = "desc";
                } else if (sort.direction === "desc") {
                    newDirection = null;
                }
            }

            // Update internal state if uncontrolled
            if (controlledSort === undefined) {
                setInternalSort({ column: fieldName, direction: newDirection });
            }

            // Notify parent
            onSortChange?.(fieldName, newDirection);
        },
        [columns, sort, onSortChange, controlledSort]
    );

    // Get sort icon
    const getSortIcon = useCallback(
        (fieldName: string) => {
            const fieldOption = columns.find((col) => col.name === fieldName);
            if (!fieldOption || fieldOption.sortable === false) return null;

            if (sort?.column !== fieldName) {
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
        [columns, sort]
    );

    // Format cell value
    const formatCellValue = useCallback(
        (value: unknown, fieldOption: FieldOption, context?: Record<string, unknown>): React.ReactNode => {
            if (value === null || value === undefined || (typeof value === "string" && value.trim() === "")) {
                return <span className="text-muted-foreground">-</span>;
            }

            if (fieldOption.format) {
                let formatted: string | React.ReactNode;
                if (typeof fieldOption.format === "function") {
                    formatted = fieldOption.format(value, fieldOption.formatArgs, context);
                } else {
                    const formatter = Formatter.getInstance().getFormatter(fieldOption.format);
                    formatted = formatter(value, fieldOption.formatArgs);
                }

                if (formatted === "" || (typeof formatted === "string" && formatted.trim() === "")) {
                    return <span className="text-muted-foreground">-</span>;
                }
                return formatted;
            }

            if (typeof value === "object") {
                return <span className="font-mono text-xs">{JSON.stringify(value)}</span>;
            }

            const stringValue = String(value);
            if (stringValue.trim() === "") {
                return <span className="text-muted-foreground">-</span>;
            }

            return <span>{stringValue}</span>;
        },
        []
    );

    // Get cell alignment class
    const getCellAlignmentClass = useCallback((fieldOption: FieldOption): string => {
        switch (fieldOption.align) {
            case "left": return "text-left";
            case "right": return "text-right";
            case "center": return "text-center";
            default: return "text-left";
        }
    }, []);

    // Virtualization setup
    const useVirtualization = processedData.length > VIRTUALIZATION_THRESHOLD;
    const rowVirtualizer = useVirtualizer({
        count: processedData.length,
        getScrollElement: () => scrollContainerRef.current,
        estimateSize: () => ESTIMATED_ROW_HEIGHT,
        overscan: OVERSCAN_COUNT,
        enabled: useVirtualization,
        measureElement: typeof window !== "undefined" && navigator.userAgent.includes("Firefox")
            ? undefined
            : (element) => element.getBoundingClientRect().height,
    });

    // Render helpers
    const renderError = () => {
        if (!error) return null;
        const colSpan = columns.length + (showIndexColumn ? 1 : 0);
        return (
            <TableRow>
                <TableCell colSpan={colSpan} className="text-center text-destructive p-8">
                    <div className="flex flex-col items-center justify-center h-[72px] gap-2">
                        <p className="font-semibold">Error loading table data:</p>
                        <p className="text-sm">{error}</p>
                    </div>
                </TableCell>
            </TableRow>
        );
    };

    const renderLoading = () => {
        if (!shouldShowSkeleton) return null;
        return (
            <>
                {Array.from({ length: 10 }).map((_, index) => (
                    <TableRow key={index} className="transition-opacity duration-150" style={{ opacity: skeletonOpacity }}>
                        {showIndexColumn && (
                            <TableCell className="text-center whitespace-nowrap !p-2">
                                <Skeleton className="h-5 w-full" />
                            </TableCell>
                        )}
                        {columns.map((fieldOption) => (
                            <TableCell
                                key={fieldOption.name}
                                className={cn(getCellAlignmentClass(fieldOption), "whitespace-nowrap !p-2")}
                            >
                                <Skeleton className="h-5 w-full" />
                            </TableCell>
                        ))}
                    </TableRow>
                ))}
            </>
        );
    };

    const renderNoData = () => {
        if (error || shouldShowSkeleton || processedData.length > 0) return null;
        const colSpan = columns.length + (showIndexColumn ? 1 : 0);
        return (
            <TableRow>
                <TableCell colSpan={colSpan} className="text-center text-muted-foreground p-8">
                    <div className="flex items-center justify-center h-[72px]">No data found</div>
                </TableCell>
            </TableRow>
        );
    };

    const renderData = () => {
        if (error || processedData.length === 0 || shouldShowSkeleton) return null;

        if (useVirtualization) {
            const virtualItems = rowVirtualizer.getVirtualItems();
            const paddingTop = virtualItems.length > 0 ? virtualItems[0].start : 0;
            const paddingBottom = virtualItems.length > 0
                ? rowVirtualizer.getTotalSize() - virtualItems[virtualItems.length - 1].end
                : 0;

            return (
                <>
                    {paddingTop > 0 && (
                        <TableRow style={{ height: `${paddingTop}px` }}>
                            <TableCell colSpan={columns.length + (showIndexColumn ? 1 : 0)} className="!p-0 !border-0" />
                        </TableRow>
                    )}
                    {virtualItems.map((virtualRow) => {
                        const rowIndex = virtualRow.index;
                        const row = processedData[rowIndex];
                        if (!row) return null;

                        return (
                            <TableRow
                                key={virtualRow.key}
                                data-index={virtualRow.index}
                                className={cn(onRowClick && "cursor-pointer hover:bg-muted/50")}
                                onClick={() => onRowClick?.(row)}
                                style={{
                                    contain: "layout style paint",
                                    contentVisibility: "auto",
                                }}
                            >
                                {showIndexColumn && (
                                    <TableCell className="text-center whitespace-nowrap !p-2">{rowIndex + 1}</TableCell>
                                )}
                                {columns.map((fieldOption) => {
                                    if (!fieldOption.name) return null;

                                    if (fieldOption.renderAction) {
                                        return (
                                            <TableCell
                                                key={fieldOption.name}
                                                className={cn(getCellAlignmentClass(fieldOption), "whitespace-nowrap !p-2")}
                                            >
                                                {fieldOption.renderAction(row, rowIndex)}
                                            </TableCell>
                                        );
                                    }

                                    return (
                                        <TableCell
                                            key={fieldOption.name}
                                            className={cn(getCellAlignmentClass(fieldOption), "whitespace-nowrap !p-2")}
                                        >
                                            {formatCellValue(row[fieldOption.name], fieldOption, row)}
                                        </TableCell>
                                    );
                                })}
                            </TableRow>
                        );
                    })}
                    {paddingBottom > 0 && (
                        <TableRow style={{ height: `${paddingBottom}px` }}>
                            <TableCell colSpan={columns.length + (showIndexColumn ? 1 : 0)} className="!p-0 !border-0" />
                        </TableRow>
                    )}
                </>
            );
        }

        return processedData.map((row, rowIndex) => (
            <TableRow
                key={rowIndex}
                className={cn(onRowClick && "cursor-pointer hover:bg-muted/50")}
                onClick={() => onRowClick?.(row)}
            >
                {showIndexColumn && (
                    <TableCell className="text-center whitespace-nowrap !p-2">{rowIndex + 1}</TableCell>
                )}
                {columns.map((fieldOption) => {
                    if (!fieldOption.name) return null;

                    if (fieldOption.renderAction) {
                        return (
                            <TableCell
                                key={fieldOption.name}
                                className={cn(getCellAlignmentClass(fieldOption), "whitespace-nowrap !p-2")}
                            >
                                {fieldOption.renderAction(row, rowIndex)}
                            </TableCell>
                        );
                    }

                    return (
                        <TableCell
                            key={fieldOption.name}
                            className={cn(getCellAlignmentClass(fieldOption), "whitespace-nowrap !p-2")}
                        >
                            {formatCellValue(row[fieldOption.name], fieldOption, row)}
                        </TableCell>
                    );
                })}
            </TableRow>
        ));
    };

    return (
        <div ref={scrollContainerRef} className={cn("w-full overflow-auto", className)}>
            <Table>
                <TableHeader className={cn(stickyHeader && "sticky top-0 z-10")}>
                    <TableRow className="hover:bg-muted/50 select-none h-10">
                        {showIndexColumn && <TableHead className={cn("w-[50px] text-center p-2", stickyHeader && "bg-background")}>#</TableHead>}
                        {columns.map((fieldOption) => (
                            <TableHead
                                key={fieldOption.name}
                                className={cn(
                                    "whitespace-nowrap p-2",
                                    getCellAlignmentClass(fieldOption),
                                    fieldOption.sortable !== false && "cursor-pointer hover:bg-muted/50"
                                )}
                                style={{
                                    width: fieldOption.width,
                                    minWidth: fieldOption.minWidth,
                                }}
                                onClick={() => fieldOption.name && handleSort(fieldOption.name)}
                            >
                                {fieldOption.title || fieldOption.name}
                                {fieldOption.name && getSortIcon(fieldOption.name)}
                            </TableHead>
                        ))}
                    </TableRow>
                </TableHeader>
                <TableBody>
                    {renderError()}
                    {renderLoading()}
                    {renderNoData()}
                    {renderData()}
                </TableBody>
            </Table>
        </div>
    );
}
