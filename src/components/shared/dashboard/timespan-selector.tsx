"use client";

import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { DateTimeExtension } from "@/lib/datetime-utils";
import { cn } from "@/lib/utils";
import { isValid, parse, startOfDay, sub, subDays } from "date-fns";
import { Check, ChevronDown, RefreshCcw } from "lucide-react";
import React, { useEffect, useRef, useState } from "react";
import type { DateRange } from "react-day-picker";

type AutoRefreshProps = {
  onRefresh: () => void;
  size?: "default" | "sm" | "lg" | "icon";
};

const AutoRefresher: React.FC<AutoRefreshProps> = ({ onRefresh, size = "icon" }) => {
  const [refreshInterval, setRefreshInterval] = useState<number | null>(null);
  const [countDown, setCountDown] = useState(0);
  const [isRunning, setIsRunning] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (refreshInterval !== null) {
      setCountDown(refreshInterval);
      setIsRunning(true);

      timerRef.current = setInterval(() => {
        // The hook below on the countDown will trigger the refresh
        setCountDown((prev) => prev - 1);
      }, 1000);
    }

    return () => {
      if (timerRef.current) {
        clearInterval(timerRef.current);
      }
    };
  }, [refreshInterval, onRefresh]);

  const handleMenuItemClick = (interval: number) => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
    }
    setRefreshInterval(interval);
    setCountDown(interval);
    setIsRunning(interval !== null);
  };

  useEffect(() => {
    if (countDown <= 0 && isRunning) {
      onRefresh();
      setCountDown(refreshInterval!);
    }
  }, [countDown, isRunning, onRefresh, refreshInterval]);

  const stopTimer = () => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
    }
    setRefreshInterval(null);
    setCountDown(0);
    setIsRunning(false);
  };

  // For "sm" size, we need to make it square like icon but with sm height
  // We'll use a custom className to override the size
  const buttonSize = size === "sm" ? undefined : size;
  const buttonClassName = cn(size === "sm" ? "h-9 w-9" : "", "rounded-none rounded-r");

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" size={buttonSize} className={buttonClassName}>
          {isRunning ? countDown + "s" : <ChevronDown className="h-4 w-4" />}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent className="w-12 rounded-none" align="end" side="bottom" sideOffset={0}>
        <DropdownMenuItem className="cursor-pointer" onClick={stopTimer}>
          Off
        </DropdownMenuItem>
        <DropdownMenuItem className="cursor-pointer" onClick={() => handleMenuItemClick(10)}>
          10s
        </DropdownMenuItem>
        <DropdownMenuItem className="cursor-pointer" onClick={() => handleMenuItemClick(30)}>
          30s
        </DropdownMenuItem>
        <DropdownMenuItem className="cursor-pointer" onClick={() => handleMenuItemClick(60)}>
          60s
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
};

export interface TimeSpan {
  startISO8601: string;
  endISO8601: string;
}

export class DisplayTimeSpan {
  label: string;
  value: number | "today" | "yesterday" | "all" | "user";
  unit?: string;

  // When 'value' is 'user', these two are ISO8601 format strings
  start?: string;
  end?: string;

  enabled: boolean;

  // A runtime flag
  initial?: boolean;

  // A runtime property to store the absolute time span
  absoluteTimeSpan?: TimeSpan;

  constructor(
    label: string,
    value: number | "today" | "yesterday" | "all" | "user",
    unit: string,
    enabled: boolean,
    start?: string,
    end?: string
  ) {
    this.label = label;
    this.value = value;
    this.unit = unit;
    this.enabled = enabled;
    this.start = start;
    this.end = end;
  }

  public isUserDefined(): boolean {
    return this.value === "user";
  }

  public getURLParameterValue(): string {
    if (this.value === "user") {
      // For user, the label is not ISO8601 format
      // We use ISO8601 in the start and end variable as parameter values
      return `${this.start} - ${this.end}`;
    } else {
      return this.label;
    }
  }

  public getTimeSpan(): TimeSpan {
    if (this.absoluteTimeSpan === undefined) {
      this.absoluteTimeSpan = this.calculateAbsoluteTimeSpan();
    }
    return this.absoluteTimeSpan;
  }

  public reCalculateTimeSpan(): TimeSpan {
    this.absoluteTimeSpan = this.calculateAbsoluteTimeSpan();
    return this.absoluteTimeSpan;
  }

  public calculateAbsoluteTimeSpan(): TimeSpan {
    const val = this.value;
    if (val === "today") {
      const e = new Date();
      const s = startOfDay(e);
      return {
        startISO8601: DateTimeExtension.formatISO8601(s) || "",
        endISO8601: DateTimeExtension.formatISO8601(e) || "",
      };
    } else if (val === "yesterday") {
      const e = startOfDay(new Date());
      const s = subDays(e, 1);
      return {
        startISO8601: DateTimeExtension.formatISO8601(s) || "",
        endISO8601: DateTimeExtension.formatISO8601(e) || "",
      };
    } else if (this.unit === "m") {
      const e = new Date();
      const s = sub(e, { minutes: this.value as number });
      return {
        startISO8601: DateTimeExtension.formatISO8601(s) || "",
        endISO8601: DateTimeExtension.formatISO8601(e) || "",
      };
    } else if (this.unit === "h") {
      const e = new Date();
      const s = sub(e, { hours: this.value as number });
      return {
        startISO8601: DateTimeExtension.formatISO8601(s) || "",
        endISO8601: DateTimeExtension.formatISO8601(e) || "",
      };
    } else if (this.unit === "d") {
      const e = new Date();
      const s = sub(e, { days: this.value as number });
      return {
        startISO8601: DateTimeExtension.formatISO8601(s) || "",
        endISO8601: DateTimeExtension.formatISO8601(e) || "",
      };
    } else if (this.value === "user") {
      return { startISO8601: this.start || "", endISO8601: this.end || "" };
    } else if (this.value === "all") {
      return {
        startISO8601: this.start || "",
        endISO8601: this.end || "",
      };
    }
    // Default fallback
    const e = new Date();
    const s = startOfDay(e);
    return {
      startISO8601: DateTimeExtension.formatISO8601(s) || "",
      endISO8601: DateTimeExtension.formatISO8601(e) || "",
    };
  }
}

export const BUILT_IN_TIME_SPAN_LIST: DisplayTimeSpan[] = [
  new DisplayTimeSpan("Last 1 Mins", 1, "m", true),
  new DisplayTimeSpan("Last 5 Mins", 5, "m", true),
  new DisplayTimeSpan("Last 15 Mins", 15, "m", true),
  new DisplayTimeSpan("Last 30 Mins", 30, "m", true),
  new DisplayTimeSpan("Last 1 Hour", 1, "h", true),
  new DisplayTimeSpan("Last 3 Hour", 3, "h", true),
  new DisplayTimeSpan("Last 6 Hours", 6, "h", true),
  new DisplayTimeSpan("Last 12 Hours", 12, "h", true),
  new DisplayTimeSpan("Last 1 Days", 1, "d", true),
  new DisplayTimeSpan("Last 3 Days", 3, "d", true),
  new DisplayTimeSpan("Last 5 Days", 5, "d", true),
  new DisplayTimeSpan("Last 7 Days", 7, "d", true),
  new DisplayTimeSpan("Today", "today", "d", true),
  new DisplayTimeSpan("Yesterday", "yesterday", "d", true),

  // Disabled by default
  new DisplayTimeSpan("All", "all", "unit", false, "2000-01-01T00:00:00.000Z", "2099-12-31T23:59:59.000Z"),
];

export function getDisplayTimeSpanByLabel(label: string): DisplayTimeSpan {
  const index = BUILT_IN_TIME_SPAN_LIST.findIndex((span) => span.label === label);
  if (index >= 0) {
    return BUILT_IN_TIME_SPAN_LIST[index];
  }

  // Try to parse it user defined interval in the format of "yyyy-MM-dd HH:mm:ss - yyyy-MM-dd HH:mm:ss"
  const parts = label.split(" - ");
  const start = parse(parts[0], "yyyy-MM-dd'T'HH:mm:ssXXX", new Date());
  const end = parse(parts[1], "yyyy-MM-dd'T'HH:mm:ssXXX", new Date());

  if (isValid(start) && isValid(end)) {
    return new DisplayTimeSpan(
      `${DateTimeExtension.toYYYYMMddHHmmss(start)} - ${DateTimeExtension.toYYYYMMddHHmmss(end)}`,
      "user",
      "unit",
      true,
      DateTimeExtension.formatISO8601(start),
      DateTimeExtension.formatISO8601(end)
    );
  }

  // Returns default time span in Last 15 Mins
  return BUILT_IN_TIME_SPAN_LIST[3];
}

interface TimeSpanSelectorProps {
  defaultTimeSpan: DisplayTimeSpan;

  // Control visibility of sub-components
  showTimeSpanSelector?: boolean;
  showRefresh?: boolean;
  showAutoRefresh?: boolean;

  // Button size
  size?: "default" | "sm" | "lg" | "icon";

  // Callback prop to notify the caller
  onSelectedSpanChanged: (span: DisplayTimeSpan) => void;

  // Custom class for the trigger button
  buttonClassName?: string;
}

interface TimeSpanSelectorState {
  isSelectorOpen: boolean;
  isCalendarOpen: boolean;
  selectedTimeSpan: DisplayTimeSpan;
  userTimeSpans: DisplayTimeSpan[];

  // For Calendar or user input
  inputDateRange?: DateRange;
  startDateInput: string;
  endDateInput: string;
  error: string;
}

class TimeSpanSelector extends React.Component<TimeSpanSelectorProps, TimeSpanSelectorState> {
  constructor(props: TimeSpanSelectorProps) {
    super(props);

    this.state = {
      isSelectorOpen: false,
      selectedTimeSpan: props.defaultTimeSpan,
      inputDateRange: undefined,
      userTimeSpans: props.defaultTimeSpan.isUserDefined() ? [props.defaultTimeSpan] : [],
      isCalendarOpen: false,
      startDateInput: "",
      endDateInput: "",
      error: "",
    };
  }

  componentDidUpdate(_prevProps: TimeSpanSelectorProps, prevState: TimeSpanSelectorState) {
    if (prevState.selectedTimeSpan !== this.state.selectedTimeSpan) {
      this.state.selectedTimeSpan.reCalculateTimeSpan();

      const timeSpan = this.state.selectedTimeSpan;

      //UrlUtils.setQueryParameter("_interval", timeSpan.getURLParameterValue());
      this.props.onSelectedSpanChanged(timeSpan);
    }
  }

  onStartDateInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const startDateInput = e.target.value;
    const parsedDate = parse(startDateInput, "yyyy-MM-dd HH:mm:ss", new Date());
    if (isValid(parsedDate)) {
      this.setState((prevState) => ({
        startDateInput,
        inputDateRange: { ...prevState.inputDateRange, from: parsedDate },
        error: "",
      }));
    } else {
      this.setState({ startDateInput, error: "Invalid value of start date. Please use yyyy-MM-dd HH:mm:ss" });
    }
  };

  onEndDateInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const endDateInput = e.target.value;
    const parsedDate = parse(endDateInput, "yyyy-MM-dd HH:mm:ss", new Date());
    if (isValid(parsedDate)) {
      this.setState((prevState) => ({
        endDateInput,
        inputDateRange: { from: prevState.inputDateRange?.from || parsedDate, to: parsedDate },
        error: "",
      }));
    } else {
      this.setState({ endDateInput, error: "Invalid value of end date. Please use yyyy-MM-dd HH:mm:ss" });
    }
  };

  onApplyUserInputClicked = () => {
    const { startDateInput, endDateInput } = this.state;
    const startDate = parse(startDateInput, "yyyy-MM-dd HH:mm:ss", new Date());
    const endDate = parse(endDateInput, "yyyy-MM-dd HH:mm:ss", new Date());

    if (!isValid(startDate)) {
      this.setState({ error: "Invalid value of start date. Please use yyyy-MM-dd HH:mm:ss" });
      return;
    }

    if (!isValid(endDate)) {
      this.setState({ error: "Invalid value of end date. Please use yyyy-MM-dd HH:mm:ss" });
      return;
    }

    if (startDate >= endDate) {
      this.setState({ error: "Start date must be before end date" });
      return;
    }

    this.updateSelectedTimeSpan(
      new DisplayTimeSpan(
        `${DateTimeExtension.toYYYYMMddHHmmss(startDate)} - ${DateTimeExtension.toYYYYMMddHHmmss(endDate)}`,
        "user",
        "unit",
        true,
        DateTimeExtension.formatISO8601(startDate),
        DateTimeExtension.formatISO8601(endDate)
      )
    );
  };

  onRefershButtonClicked = (e: React.MouseEvent) => {
    // prevent event propagation to parent if this component is ebmedded in a FORM component
    e.preventDefault();
    e.stopPropagation();

    this.state.selectedTimeSpan.reCalculateTimeSpan();
    this.props.onSelectedSpanChanged(this.state.selectedTimeSpan);
  };

  onAutoRefreshTriggered = () => {
    this.state.selectedTimeSpan.reCalculateTimeSpan();
    this.props.onSelectedSpanChanged(this.state.selectedTimeSpan);
  };

  public getSelectedTimeSpan(): DisplayTimeSpan {
    return this.state.selectedTimeSpan;
  }

  public setSelectedTimeSpan(span: DisplayTimeSpan) {
    this.updateSelectedTimeSpan(span);
  }

  private updateSelectedTimeSpan(newTimeSpan: DisplayTimeSpan) {
    if (newTimeSpan.label === this.state.selectedTimeSpan.label) {
      return;
    }

    this.setState({ selectedTimeSpan: newTimeSpan });
    if (!newTimeSpan.isUserDefined()) {
      return;
    }

    if (this.state.userTimeSpans.some((span) => span.label === newTimeSpan.label)) {
      // Found duplicate user defined time span
      return;
    }

    this.setState((prev) => {
      return {
        ...prev,
        isSelectorOpen: false,
        userTimeSpans: [
          // We only store 5 user defined time spans
          ...(prev.userTimeSpans.length >= 5 ? prev.userTimeSpans.slice(1) : prev.userTimeSpans),
          newTimeSpan,
        ],
      };
    });
  }

  render() {
    const {
      isSelectorOpen,
      isCalendarOpen,
      inputDateRange,
      startDateInput,
      endDateInput,
      error,
      selectedTimeSpan,
      userTimeSpans,
    } = this.state;

    const {
      showTimeSpanSelector = true,
      showRefresh = true,
      showAutoRefresh = true,
      size = "default",
      buttonClassName,
    } = this.props;

    // If no components are visible, render nothing
    if (!showTimeSpanSelector && !showRefresh && !showAutoRefresh) {
      return null;
    }

    return (
      <div className="flex">
        {showTimeSpanSelector && (
          <Popover
            open={isSelectorOpen}
            onOpenChange={(open) => {
              this.setState({ isSelectorOpen: open });
              if (!open) {
                this.setState({ isCalendarOpen: false });
              }
            }}
          >
            <PopoverTrigger asChild>
              <Button
                variant="outline"
                size={size}
                className={cn(
                  "rounded-none",
                  showRefresh || showAutoRefresh ? "rounded-l" : "rounded",
                  buttonClassName
                )}
              >
                {selectedTimeSpan.label} {/* Display the label of the selected range */}
              </Button>
            </PopoverTrigger>
            <PopoverContent
              className="w-auto max-h-[180vh] overflow-y-auto bg-popover p-2 rounded-none"
              align="end"
              side="bottom"
              sideOffset={0}
            >
              <div className="flex">
                {/* Calendar selector*/}
                <div className="p-2 flex border-r">
                  <div className="mr-2">
                    {isCalendarOpen && (
                      <Calendar
                        initialFocus
                        mode="range"
                        defaultMonth={inputDateRange?.from || new Date()}
                        selected={inputDateRange}
                        onSelect={(date) => {
                          this.setState({
                            startDateInput: date?.from
                              ? DateTimeExtension.formatDateTime(date.from, "yyyy-MM-dd HH:mm:ss") || ""
                              : "",
                            endDateInput: date?.to
                              ? DateTimeExtension.formatDateTime(date.to, "yyyy-MM-dd HH:mm:ss") || ""
                              : "",
                            inputDateRange: date,
                            error: "",
                          });
                        }}
                        numberOfMonths={2}
                        className="rounded-none"
                        classNames={{
                          day_selected: "bg-primary text-primary-foreground hover:bg-primary/90 rounded-none",
                          day_range_middle: "bg-primary/20",
                          day_range_end: "bg-primary text-primary-foreground hover:bg-primary/90",
                          day_range_start: "bg-primary text-primary-foreground hover:bg-primary/90",
                        }}
                      />
                    )}
                  </div>
                  <div className="flex flex-col w-[350px] gap-2">
                    <Input
                      onClick={() => {
                        if (!isCalendarOpen) {
                          this.setState({ isCalendarOpen: true });
                        }
                      }}
                      value={startDateInput}
                      onChange={this.onStartDateInputChange}
                      placeholder="Start time in yyyy-MM-dd HH:mm:ss format"
                      className="rounded-none"
                    />
                    <Input
                      onClick={() => {
                        if (!isCalendarOpen) this.setState({ isCalendarOpen: true });
                      }}
                      value={endDateInput}
                      onChange={this.onEndDateInputChange}
                      placeholder="End time in yyyy-MM-dd HH:mm:ss format"
                      className="rounded-none"
                    />
                    <Button
                      onClick={this.onApplyUserInputClicked}
                      className="rounded-none"
                      disabled={!inputDateRange?.from || !inputDateRange?.to}
                    >
                      Apply
                    </Button>
                    {error && (
                      <Alert variant="destructive" className="rounded-none">
                        <AlertDescription className="break-words whitespace-normal overflow-wrap-anywhere w-full max-w-full">
                          {error}
                        </AlertDescription>
                      </Alert>
                    )}

                    {userTimeSpans.map((timeSpan) => (
                      <Button
                        key={timeSpan.label}
                        variant="outline"
                        className={cn(
                          "col-span-2 w-full justify-center rounded-none",
                          selectedTimeSpan.label === timeSpan.label ? "bg-muted text-primary" : ""
                        )}
                        onClick={() => {
                          this.setState({
                            selectedTimeSpan: timeSpan,
                            isSelectorOpen: false,
                            error: "",
                          });
                        }}
                      >
                        {selectedTimeSpan.label === timeSpan.label && <Check className="h-4 w-4" />}
                        {timeSpan.label}
                      </Button>
                    ))}
                  </div>
                </div>

                {/* Time Span Labels */}
                <div className="p-2 w-[300px]">
                  <div className="grid grid-cols-2 gap-2">
                    {BUILT_IN_TIME_SPAN_LIST.filter((timeSpan) => timeSpan.enabled).map((timeSpan) => (
                      <Button
                        key={timeSpan.label}
                        variant="outline"
                        className={cn(
                          "rounded-none",
                          selectedTimeSpan.label === timeSpan.label ? "bg-muted text-primary" : ""
                        )}
                        onClick={() => {
                          this.setState({
                            selectedTimeSpan: timeSpan,
                            isSelectorOpen: false,
                            error: "",
                          });
                        }}
                      >
                        {selectedTimeSpan.label === timeSpan.label && <Check className="mr-2 h-4 w-4" />}
                        {timeSpan.label}
                      </Button>
                    ))}
                  </div>
                </div>
              </div>
            </PopoverContent>
          </Popover>
        )}

        {/* Refresh Button */}
        {showRefresh && (
          <Button
            variant="outline"
            size={size}
            className={cn(
              "rounded-none",
              !showTimeSpanSelector && showAutoRefresh ? "rounded-l" : "",
              !showAutoRefresh && showTimeSpanSelector ? "rounded-r" : "",
              !showTimeSpanSelector && !showAutoRefresh ? "rounded" : ""
            )}
            onClick={this.onRefershButtonClicked}
          >
            <RefreshCcw className="h-4 w-4" />
          </Button>
        )}

        {/* Auto Refresh Controller */}
        {showAutoRefresh && (
          <div className={cn(!showTimeSpanSelector && !showRefresh ? "rounded" : "")}>
            <AutoRefresher onRefresh={this.onAutoRefreshTriggered} size={size} />
          </div>
        )}
      </div>
    );
  }
}

export default TimeSpanSelector;
