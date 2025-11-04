"use client";

import { Api, type ApiCanceller, type ApiErrorResponse, type ApiResponse } from "@/lib/api";
import { useConnection } from "@/lib/connection/ConnectionContext";
import { cn } from "@/lib/utils";
import { ChevronRight } from "lucide-react";
import React, { forwardRef, useCallback, useEffect, useImperativeHandle, useRef, useState } from "react";
import FloatingProgressBar from "../floating-progress-bar";
import { Card, CardContent, CardDescription, CardHeader } from "../ui/card";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "../ui/collapsible";
import { Skeleton } from "../ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "../ui/table";
import type { SQLQuery, TransposeTableDescriptor } from "./chart-utils";
import type { RefreshableComponent, RefreshParameter } from "./refreshable-component";
import type { TimeSpan } from "./timespan-selector";
import { useRefreshable } from "./use-refreshable";

interface RefreshableTransposedTableComponentProps {
  // The transposed table descriptor configuration
  descriptor: TransposeTableDescriptor;

  // Runtime
  selectedTimeSpan?: TimeSpan;

  // Used for generating links
  searchParams?: URLSearchParams;
}

const RefreshableTransposedTableComponent = forwardRef<RefreshableComponent, RefreshableTransposedTableComponentProps>(
  function RefreshableTransposedTableComponent(props, ref) {
    const { descriptor } = props;
    const { selectedConnection } = useConnection();

    // State
    const [data, setData] = useState<Record<string, unknown> | null>(null);
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState("");

    // Refs
    const apiCancellerRef = useRef<ApiCanceller | null>(null);

    // Load data from API
    const loadData = useCallback(
      async (param: RefreshParameter) => {
        if (!selectedConnection) {
          setError("No connection selected");
          return;
        }

        if (!descriptor.query) {
          setError("No query defined for this transposed table component.");
          return;
        }

        console.trace(
          `Loading data for transposed table [${descriptor.id}], queryType: ${(descriptor.query as SQLQuery & { type?: string })?.type}`
        );

        setIsLoading(true);
        setError("");

        try {
          // Cancel previous request if any
          if (apiCancellerRef.current) {
            apiCancellerRef.current.cancel();
            apiCancellerRef.current = null;
          }

          // Build query from descriptor
          const query = Object.assign({}, descriptor.query) as SQLQuery;

          // If query has interval (time series), we might need to update it with selectedTimeSpan
          if (param.selectedTimeSpan && query.interval) {
            query.interval = {
              ...query.interval,
              startISO8601: param.selectedTimeSpan.startISO8601,
              endISO8601: param.selectedTimeSpan.endISO8601,
            };
          }

          const api = Api.create(selectedConnection);
          const canceller = api.executeSQL(
            {
              sql: query.sql,
              headers: query.headers,
              params: {
                default_format: "JSON",
                output_format_json_quote_64bit_integers: 0,
                ...query.params,
              },
            },
            (response: ApiResponse) => {
              try {
                const responseData = response.data;

                // JSON format returns { meta: [...], data: [...], rows: number, statistics: {...} }
                const rows = responseData.data || [];

                // For transposed table, we expect a single object (first row)
                if (rows.length > 0) {
                  setData(rows[0] as Record<string, unknown>);
                } else {
                  setData(null);
                }
                setError("");
              } catch (err) {
                console.error("Error processing transposed table response:", err);
                const errorMessage = err instanceof Error ? err.message : String(err);
                setError(errorMessage);
              } finally {
                setIsLoading(false);
              }
            },
            (error: ApiErrorResponse) => {
              const errorMessage = error.errorMessage || "Unknown error occurred";
              const lowerErrorMessage = errorMessage.toLowerCase();
              if (lowerErrorMessage.includes("cancel") || lowerErrorMessage.includes("abort")) {
                setIsLoading(false);
                return;
              }

              console.error("API Error:", error);
              setError(errorMessage);
              setIsLoading(false);
            },
            () => {
              setIsLoading(false);
            }
          );

          apiCancellerRef.current = canceller;
        } catch (error) {
          const errorMessage = (error as Error).message || "Unknown error occurred";
          setError(errorMessage);
          setIsLoading(false);
          console.error(error);
        }
      },
      [descriptor, selectedConnection]
    );

    // Internal refresh function
    const refreshInternal = useCallback(
      (param: RefreshParameter) => {
        console.trace(`Refreshing transposed table [${descriptor.id}]...`);

        if (!descriptor.query) {
          console.error(`No query defined for transposed table [${descriptor.id}]`);
          setError("No query defined for this transposed table component.");
          return;
        }

        loadData(param);
      },
      [descriptor, loadData]
    );

    // Use shared refreshable hook
    const { componentRef, isCollapsed, setIsCollapsed, refresh, getLastRefreshParameter } = useRefreshable({
      componentId: descriptor.id,
      initialCollapsed: descriptor.isCollapsed ?? false,
      refreshInternal,
    });

    // Expose methods via ref
    useImperativeHandle(ref, () => ({
      refresh,
      getLastRefreshParameter,
    }));

    // Cleanup API canceller on unmount
    useEffect(() => {
      return () => {
        if (apiCancellerRef.current) {
          apiCancellerRef.current.cancel();
          apiCancellerRef.current = null;
        }
      };
    }, []);

    // Format cell value based on descriptor renderers
    const formatCellValue = useCallback(
      (key: string, value: unknown): React.ReactNode => {
        // Handle empty values
        if (value === null || value === undefined || (typeof value === "string" && value.trim() === "")) {
          return <span className="text-muted-foreground">-</span>;
        }

        // Check if there's a custom renderer for this key
        const renderers = descriptor.valueRenderers;
        if (renderers) {
          // Handle both Map and Record types
          const renderer =
            renderers instanceof Map
              ? renderers.get(key)
              : (renderers as Record<string, (key: string, value: unknown) => React.ReactNode>)[key];

          if (renderer) {
            const rendered = renderer(key, value);
            // If renderer returns empty string, show '-'
            if (rendered === "" || (typeof rendered === "string" && rendered.trim() === "")) {
              return <span className="text-muted-foreground">-</span>;
            }
            return rendered;
          }
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
      [descriptor.valueRenderers]
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
      if (!isLoading || data !== null) return null;
      return (
        <>
          {Array.from({ length: 3 }).map((_, index) => (
            <TableRow key={index}>
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
    }, [isLoading, data]);

    const renderNoData = useCallback(() => {
      if (error || isLoading || data !== null) return null;
      return (
        <TableRow>
          <TableCell colSpan={2} className="text-center text-muted-foreground p-8">
            <div className="flex items-center justify-center h-[72px]">No data found</div>
          </TableCell>
        </TableRow>
      );
    }, [error, isLoading, data]);

    const renderData = useCallback(() => {
      // Don't hide data during refresh - keep showing existing data until new data arrives
      if (error || !data) return null;
      return (
        <>
          {Object.entries(data).map(([key, value]) => (
            <TableRow key={key} className="hover:bg-muted/50">
              <TableCell className="p-2 whitespace-nowrap font-medium">{key}</TableCell>
              <TableCell className="p-2">{formatCellValue(key, value)}</TableCell>
            </TableRow>
          ))}
        </>
      );
    }, [error, data, formatCellValue]);

    const hasTitle = !!descriptor.titleOption?.title;

    return (
      <Card ref={componentRef} className="@container/card relative">
        <FloatingProgressBar show={isLoading} />
        <Collapsible open={!isCollapsed} onOpenChange={(open) => setIsCollapsed(!open)}>
          {hasTitle && descriptor.titleOption && (
            <CardHeader className="p-0">
              <CollapsibleTrigger className="w-full">
                <div className={cn("flex items-center p-3 bg-muted/50 transition-colors gap-2 hover:bg-muted")}>
                  <ChevronRight
                    className={cn("h-4 w-4 transition-transform duration-200 shrink-0", !isCollapsed && "rotate-90")}
                  />
                  <div className="flex-1 text-left">
                    <CardDescription
                      className={cn(
                        descriptor.titleOption.align ? "text-" + descriptor.titleOption.align : "text-left",
                        "font-semibold text-foreground m-0"
                      )}
                    >
                      {descriptor.titleOption.title}
                    </CardDescription>
                    {descriptor.titleOption.description && (
                      <CardDescription className="text-xs mt-1 m-0">
                        {descriptor.titleOption.description}
                      </CardDescription>
                    )}
                  </div>
                </div>
              </CollapsibleTrigger>
            </CardHeader>
          )}
          {!hasTitle && descriptor.titleOption && (
            <CardHeader className="pt-5 pb-3">
              {descriptor.titleOption.description && (
                <CardDescription className="text-xs">{descriptor.titleOption.description}</CardDescription>
              )}
            </CardHeader>
          )}
          <CollapsibleContent>
            <CardContent className="px-0 pb-0 overflow-auto">
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
          </CollapsibleContent>
        </Collapsible>
      </Card>
    );
  }
);

RefreshableTransposedTableComponent.displayName = "RefreshableTransposedTableComponent";

export default RefreshableTransposedTableComponent;
export type { RefreshableTransposedTableComponentProps };
