"use client";

import { useConnection } from "@/components/connection/connection-context";
import TimeSpanSelector, {
  DisplayTimeSpan,
  getDisplayTimeSpanByLabel,
  type TimeSpan,
} from "@/components/shared/dashboard/timespan-selector";
import { Button } from "@/components/ui/button";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import type { JSONCompactFormatResponse } from "@/lib/connection/connection";
import { cn } from "@/lib/utils";
import { Check, ChevronDown, Database, RefreshCcw } from "lucide-react";
import { memo, useCallback, useEffect, useRef, useState } from "react";

interface SimpleDashboardFilterProps {
  onDatabaseChange: (database: string | null) => void;
  onTimeSpanChange: (timeSpan: TimeSpan) => void;
  onRefresh: () => void;
  defaultDatabase?: string;
  defaultTimeSpan?: string;
  children?: React.ReactNode;
}

const SimpleDashboardFilterComponent = ({
  onDatabaseChange,
  onTimeSpanChange,
  onRefresh,
  defaultDatabase,
  defaultTimeSpan = "Last 15 Mins",
  children,
}: SimpleDashboardFilterProps) => {
  const { connection } = useConnection();
  const [databases, setDatabases] = useState<string[]>([]);
  const [selectedDatabase, setSelectedDatabase] = useState<string | null>(defaultDatabase ?? null);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const timeSpanRef = useRef<TimeSpanSelector>(null);

  // Load databases on mount
  useEffect(() => {
    if (!connection) return;

    const loadDatabases = async () => {
      setLoading(true);
      try {
        const { response } = connection.queryOnNode(
          "SELECT name FROM system.databases ORDER BY name",
          { default_format: "JSONCompact" }
        );
        const apiResponse = await response;
        const data = apiResponse.data.json<JSONCompactFormatResponse>();
        const dbNames = data.data.map((row: unknown[]) => String(row[0]));
        setDatabases(dbNames);
      } catch (error) {
        console.error("Failed to load databases:", error);
        setDatabases([]);
      } finally {
        setLoading(false);
      }
    };

    loadDatabases();
  }, [connection]);

  const handleDatabaseSelect = useCallback(
    (database: string) => {
      const newValue = database === selectedDatabase ? null : database;
      setSelectedDatabase(newValue);
      setOpen(false);
      onDatabaseChange(newValue);
    },
    [selectedDatabase, onDatabaseChange]
  );

  const handleTimeSpanChange = useCallback(
    (span: DisplayTimeSpan) => {
      onTimeSpanChange(span.getTimeSpan());
    },
    [onTimeSpanChange]
  );

  const handleRefresh = useCallback(() => {
    // Recalculate time span and trigger refresh
    const currentSpan = timeSpanRef.current?.getSelectedTimeSpan();
    if (currentSpan) {
      currentSpan.reCalculateTimeSpan();
      onTimeSpanChange(currentSpan.getTimeSpan());
    }
    onRefresh();
  }, [onTimeSpanChange, onRefresh]);

  return (
    <div className="flex items-center justify-between gap-2 px-2 py-1 border-b">
      <div className="flex items-center gap-2">
        {/* Database dropdown */}
        <Popover open={open} onOpenChange={setOpen}>
          <PopoverTrigger asChild>
            <Button
              variant="outline"
              size="sm"
              role="combobox"
              aria-expanded={open}
              className="h-8 justify-between min-w-[160px]"
            >
              <Database className="mr-2 h-4 w-4 shrink-0 opacity-50" />
              <span className="truncate">
                {selectedDatabase ?? "All databases"}
              </span>
              <ChevronDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-[200px] p-0" align="start">
            <Command>
              <CommandInput placeholder="Search database..." className="h-9" />
              <CommandList>
                <CommandEmpty>
                  {loading ? "Loading..." : "No database found."}
                </CommandEmpty>
                <CommandGroup>
                  <CommandItem
                    value=""
                    onSelect={() => handleDatabaseSelect("")}
                  >
                    <Check
                      className={cn(
                        "mr-2 h-4 w-4",
                        selectedDatabase === null ? "opacity-100" : "opacity-0"
                      )}
                    />
                    All databases
                  </CommandItem>
                  {databases.map((db) => (
                    <CommandItem
                      key={db}
                      value={db}
                      onSelect={() => handleDatabaseSelect(db)}
                    >
                      <Check
                        className={cn(
                          "mr-2 h-4 w-4",
                          selectedDatabase === db ? "opacity-100" : "opacity-0"
                        )}
                      />
                      {db}
                    </CommandItem>
                  ))}
                </CommandGroup>
              </CommandList>
            </Command>
          </PopoverContent>
        </Popover>

        {/* Time span selector */}
        <TimeSpanSelector
          ref={timeSpanRef}
          defaultTimeSpan={getDisplayTimeSpanByLabel(defaultTimeSpan)}
          showTimeSpanSelector={true}
          showRefresh={false}
          showAutoRefresh={false}
          size="sm"
          onSelectedSpanChanged={handleTimeSpanChange}
        />

        {/* Refresh button */}
        <Button
          variant="outline"
          size="sm"
          className="h-8 w-8 p-0"
          onClick={handleRefresh}
          title="Refresh"
        >
          <RefreshCcw className="h-4 w-4" />
        </Button>
      </div>

      {/* Right side actions (children) */}
      {children && <div className="flex items-center gap-2">{children}</div>}
    </div>
  );
};

SimpleDashboardFilterComponent.displayName = "SimpleDashboardFilter";

export const SimpleDashboardFilter = memo(SimpleDashboardFilterComponent);
