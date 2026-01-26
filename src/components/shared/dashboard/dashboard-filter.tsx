"use client";

import { Button } from "@/components/ui/button";
import { FloatingLabel } from "@/components/ui/floating-label-input";
import { ComparatorManager, QueryPattern } from "@/lib/query-utils";
import { escapeSqlString } from "@/lib/string-utils";
import { cn } from "@/lib/utils";
import { RefreshCcw } from "lucide-react";
import React, { Component } from "react";
import Selector, { type SelectorRef } from "../selector";
import type {
  DateTimeFilterSpec,
  FilterSpec,
  SelectorFilterSpec,
  SQLQuery,
} from "./dashboard-model";
import { SQLQueryBuilder } from "./sql-query-builder";
import TimeSpanSelector, {
  DisplayTimeSpan,
  getDisplayTimeSpanByLabel,
  type TimeSpan,
} from "./timespan-selector";

export interface SelectedFilter {
  expr: string;
  values: Map<string, QueryPattern>;
}

interface FilterProps {
  className?: string;
  filterSpecs: FilterSpec[];
  defaultTimeSpan?: string;
  showTimeSpanSelector?: boolean;
  showRefresh?: boolean;
  showAutoRefresh?: boolean;
  onFilterChange?: (filter: SelectedFilter) => void;
  onTimeSpanChange?: (range: TimeSpan) => void;
  timezone?: string;

  // Callback to load items for a filter selector
  onLoadSourceData?: (query: SQLQuery) => Promise<string[]>;

  children?: React.ReactNode;
}

type FilterState = Record<string, never>;

class DashboardFilterComponent extends Component<FilterProps, FilterState> {
  //
  // These variables are NOT UI state, we don't define them in the react.state which would cause re-rendering when updating these states
  //
  // Track the selected filter and its values
  private selectedFilters: Map<string, QueryPattern>;

  // Track if one selector needs to re-load items
  private reloadingRequiredState: Map<number, boolean>;

  // Track the selected time span
  private defaultTimeSpan: DisplayTimeSpan;
  private timeSpanSelectorRef = React.createRef<TimeSpanSelector>();

  private selectorContainerRef = React.createRef<HTMLDivElement>();
  private scrollLeftButtonRef = React.createRef<HTMLButtonElement>();
  private scrollRightButtonRef = React.createRef<HTMLButtonElement>();

  // Store refs to Selector components by filter name
  private selectorRefs = new Map<string, React.RefObject<SelectorRef | null>>();

  private nameConverts: Map<string, (name: string) => string>;
  private timeFilterSpec: DateTimeFilterSpec | undefined;
  private filterSpecByName: Map<string, SelectorFilterSpec>;

  constructor(props: FilterProps) {
    super(props);

    this.timeFilterSpec = props.filterSpecs.find(
      (f): f is DateTimeFilterSpec => f.filterType === "date_time"
    );
    const defaultTimeSpanLabel =
      this.timeFilterSpec?.defaultTimeSpan || props.defaultTimeSpan || "Last 15 Mins";
    this.defaultTimeSpan = getDisplayTimeSpanByLabel(defaultTimeSpanLabel);

    this.reloadingRequiredState = new Map();

    this.selectedFilters = new Map<string, QueryPattern>();

    this.nameConverts = new Map();
    this.filterSpecByName = new Map();
    props.filterSpecs.forEach((filter) => {
      if (filter.filterType !== "select") {
        return;
      }
      this.filterSpecByName.set(filter.name, filter);
      if (filter.nameConverter) {
        this.nameConverts.set(filter.name, filter.nameConverter);
      } else {
        this.nameConverts.set(filter.name, (name) => name);
      }

      // Initialize defaultPattern if provided
      if (filter.defaultPattern) {
        const comparator = ComparatorManager.parseComparator(filter.defaultPattern.comparator);
        const isMultiValue = comparator.allowMultiValue ?? false;
        const pattern = new QueryPattern(
          isMultiValue,
          filter.defaultPattern.comparator,
          filter.defaultPattern.values
        );
        this.selectedFilters.set(filter.name, pattern);
      }
    });

    this.onTimeSpanChangeCallback = this.onTimeSpanChangeCallback.bind(this);
    this.onItemSelectedCallback = this.onItemSelectedCallback.bind(this);
    this.beforeLoadItemCallback = this.beforeLoadItemCallback.bind(this);
    this.afterLoadItemCallback = this.afterLoadItemCallback.bind(this);
    this.onLoadItemCallback = this.onLoadItemCallback.bind(this);
  }

  componentDidMount(): void {
    // Init the scroll button visibility
    this.handleSelectorContainerScroll();

    // const initialTimeSpan = this.getSelectedTimeSpan();
    // if (this.props.onTimeSpanChange && initialTimeSpan) {
    //   this.props.onTimeSpanChange(initialTimeSpan);
    // }
  }

  componentDidUpdate(prevProps: FilterProps): void {
    // Emit filter changes when filterSpecs change and defaultPatterns are initialized
    if (this.props.filterSpecs !== prevProps.filterSpecs && this.props.onFilterChange) {
      this.props.onFilterChange(this.getSelectedFilter());
    }
  }

  shouldComponentUpdate(nextProps: FilterProps): boolean {
    // Update the selected variables before rendering
    if (this.props.filterSpecs !== nextProps.filterSpecs) {
      this.selectedFilters = new Map<string, QueryPattern>();

      this.timeFilterSpec = nextProps.filterSpecs.find(
        (f): f is DateTimeFilterSpec => f.filterType === "date_time"
      );
      this.nameConverts = new Map();
      this.filterSpecByName = new Map();
      nextProps.filterSpecs.forEach((filter) => {
        if (filter.filterType !== "select") {
          return;
        }
        this.filterSpecByName.set(filter.name, filter);
        if (filter.nameConverter) {
          this.nameConverts.set(filter.name, filter.nameConverter);
        } else {
          this.nameConverts.set(filter.name, (name) => name);
        }

        // Initialize defaultPattern if provided
        if (filter.defaultPattern) {
          const comparator = ComparatorManager.parseComparator(filter.defaultPattern.comparator);
          const isMultiValue = comparator.allowMultiValue ?? false;
          const pattern = new QueryPattern(
            isMultiValue,
            filter.defaultPattern.comparator,
            filter.defaultPattern.values
          );
          this.selectedFilters.set(filter.name, pattern);
        }
      });
    }

    // The default implementation
    return true;
  }

  onTimeSpanChangeCallback(newSelected: DisplayTimeSpan) {
    // Reset all selectors to allow re-loading
    this.reloadingRequiredState.clear();

    // Broadcast the change to the parent component
    if (this.props.onTimeSpanChange) {
      this.props.onTimeSpanChange(newSelected.getTimeSpan());
    }
  }

  onItemSelectedCallback = (
    index: number,
    filterSpec: SelectorFilterSpec,
    pattern: QueryPattern
  ) => {
    const { filterSpecs, onFilterChange } = this.props;

    // Treat null or patterns with empty values as clearing the filter
    if (pattern === null || pattern.values.length === 0) {
      this.selectedFilters.delete(filterSpec.name);
    } else {
      this.selectedFilters.set(filterSpec.name, pattern);
    }

    // Clear other filter states so that they will be reloaded
    for (let i = index + 1; i < filterSpecs.length; i++) {
      this.reloadingRequiredState.set(i, true);
    }

    // Notification
    if (onFilterChange) {
      let queryExpression = "";
      this.selectedFilters.forEach((pattern, alias) => {
        if (queryExpression.length > 0) {
          queryExpression += " AND ";
        }
        queryExpression += this.toFilterExpression(alias, pattern);
      });

      onFilterChange({ expr: queryExpression, values: this.selectedFilters });
    }
  };

  beforeLoadItemCallback(index: number): boolean {
    const isReloadingRequired = this.reloadingRequiredState.get(index);
    return isReloadingRequired === undefined ? true : isReloadingRequired;
  }

  afterLoadItemCallback(index: number) {
    this.reloadingRequiredState.set(index, false);
  }

  async onLoadItemCallback(filterIndex: number) {
    const { filterSpecs, onLoadSourceData } = this.props;
    const thisFilterSpec = filterSpecs[filterIndex];
    if (thisFilterSpec.filterType !== "select") {
      return [];
    }

    // Handle inline data source
    if (thisFilterSpec.datasource.type === "inline") {
      return thisFilterSpec.datasource.values;
    }

    // Handle SQL data source
    const filterExpressionList = [];

    // Apply other selectors' values as filter
    if (thisFilterSpec.onPreviousFilters === undefined || thisFilterSpec.onPreviousFilters) {
      for (let p = 0; p < filterIndex; p++) {
        const otherFilterSpec = filterSpecs[p];
        if (otherFilterSpec.filterType !== "select") {
          continue;
        }
        const pattern = this.selectedFilters.get(otherFilterSpec.name);
        if (pattern !== undefined && pattern !== null && pattern.values.length > 0) {
          filterExpressionList.push(this.toFilterExpression(otherFilterSpec.name, pattern));
        }
      }
    }

    if (!onLoadSourceData) {
      return [];
    }

    // Use SQLQueryBuilder for clean SQL transformation
    const sql = new SQLQueryBuilder(thisFilterSpec.datasource.sql)
      .timeSpan(this.getSelectedTimeSpan(), this.props.timezone ?? "UTC")
      .filterExpression(filterExpressionList.join(" AND "))
      .build();

    const dimensions = await onLoadSourceData({
      sql,
    });

    return dimensions.map((dim) => ({
      value: dim,
      label: dim,
    }));
  }

  public getSelectedFilter(): SelectedFilter {
    let expr = "";
    this.selectedFilters.forEach((pattern, alias) => {
      if (expr.length > 0) {
        expr += " AND ";
      }
      expr += this.toFilterExpression(alias, pattern);
    });
    return { expr: expr, values: this.selectedFilters };
  }

  private asSqlString(value: string): string {
    return `'${escapeSqlString(value)}'`;
  }

  private replaceAllLiteral(input: string, token: string, value: string): string {
    // Avoid regex replacement; tokens are literals like "{value}".
    return input.split(token).join(value);
  }

  private buildExpressionFromTemplate(
    template: string,
    name: string,
    pattern: QueryPattern
  ): string {
    const values = pattern.values ?? [];
    const value = this.asSqlString(values[0] ?? "");
    const valuesList = values.map((v) => this.asSqlString(v)).join(",");
    const valuesArray = `[${valuesList}]`;

    let result = template;
    result = this.replaceAllLiteral(result, "{name}", name);
    result = this.replaceAllLiteral(result, "{value}", value);
    result = this.replaceAllLiteral(result, "{values}", valuesList);
    result = this.replaceAllLiteral(result, "{valuesArray}", valuesArray);
    return result;
  }

  private toFilterExpression(alias: string, pattern: QueryPattern): string {
    const converter = this.nameConverts.get(alias) ?? ((name: string) => name);
    const name = converter(alias);

    const spec = this.filterSpecByName.get(alias);
    const template = spec?.expressionTemplate?.[pattern.comparator];
    if (template && template.length > 0) {
      return this.buildExpressionFromTemplate(template, name, pattern);
    }

    return pattern.toQueryString(name);
  }

  public getSelectedTimeSpan(): TimeSpan {
    // If all time span components are disabled, return a default time span
    if (
      this.props.showTimeSpanSelector === false &&
      this.props.showRefresh === false &&
      this.props.showAutoRefresh === false
    ) {
      // Return a default 1 hour timespan from now
      const now = new Date();
      const oneHourAgo = new Date(now.getTime() - 60 * 60 * 1000);
      return {
        startISO8601: oneHourAgo.toISOString(),
        endISO8601: now.toISOString(),
      };
    }

    // If time span selector specifically is disabled but others are enabled, still return default
    if (this.props.showTimeSpanSelector === false || !this.timeSpanSelectorRef.current) {
      const now = new Date();
      const oneHourAgo = new Date(now.getTime() - 60 * 60 * 1000);
      return {
        startISO8601: oneHourAgo.toISOString(),
        endISO8601: now.toISOString(),
      };
    }

    return this.timeSpanSelectorRef.current?.getSelectedTimeSpan().getTimeSpan();
  }

  public setSelectedTimeSpan(timeSpan: TimeSpan) {
    if (this.props.showTimeSpanSelector === false || !this.timeSpanSelectorRef.current) {
      return; // Do nothing if time span selector is disabled
    }
    const label = `${timeSpan.startISO8601} - ${timeSpan.endISO8601}`;

    this.timeSpanSelectorRef.current?.setSelectedTimeSpan(getDisplayTimeSpanByLabel(label));
  }

  public setFilter(filterName: string, value: string) {
    const filterSpec = this.filterSpecByName.get(filterName);
    if (!filterSpec) {
      return; // Filter not found
    }

    // Create a QueryPattern with the value
    const comparator = ComparatorManager.parseComparator("=");
    const pattern = new QueryPattern(false, comparator.name, [value]);

    // Update UI state directly via ref
    const selectorRef = this.selectorRefs.get(filterName);
    if (selectorRef?.current) {
      selectorRef.current.setPattern(pattern);
    }

    // Find the index of this filter in the filterSpecs array
    const filterIndex = this.props.filterSpecs.findIndex((f) => f === filterSpec);
    if (filterIndex !== -1) {
      // Trigger the callback to notify parent component
      this.onItemSelectedCallback(filterIndex, filterSpec, pattern);
    }
  }

  private handleSelectorContainerScroll = () => {
    if (this.selectorContainerRef.current) {
      const { scrollLeft, scrollWidth, clientWidth } = this.selectorContainerRef.current;

      // Show left button if scrolled
      // Directly control the DOM to avoid re-rendering
      this.scrollLeftButtonRef.current?.classList.toggle("hidden", scrollLeft <= 0);

      // Show right button if not fully scrolled to the right
      // Directly control the DOM to avoid re-rendering
      this.scrollRightButtonRef.current?.classList.toggle(
        "hidden",
        scrollLeft + clientWidth >= scrollWidth
      );
    }
  };

  private scrollLeft = () => {
    if (this.selectorContainerRef.current) {
      this.selectorContainerRef.current.scrollBy({ left: -200, behavior: "smooth" });
    }
  };

  private scrollRight = () => {
    if (this.selectorContainerRef.current) {
      this.selectorContainerRef.current.scrollBy({ left: 200, behavior: "smooth" });
    }
  };

  private handleRefreshTimeSpan = () => {
    const selected = this.timeSpanSelectorRef.current?.getSelectedTimeSpan();
    if (!selected) {
      return;
    }
    // Recalculate "last N mins/hours" spans and emit to parent.
    selected.reCalculateTimeSpan();
    this.onTimeSpanChangeCallback(selected);
  };

  render() {
    // Logger.trace("Rendering DashboardFilterComponent");

    const { className, filterSpecs } = this.props;
    const hasTimeFilterSpec = filterSpecs.some((f) => f.filterType === "date_time");

    return (
      <div className={cn("flex items-center justify-between gap-2", className)}>
        <div
          ref={this.selectorContainerRef}
          onScroll={this.handleSelectorContainerScroll}
          className="relative flex items-center overflow-x-auto whitespace-nowrap flex-1"
        >
          {filterSpecs.map((filter, index) => {
            if (filter.filterType === "date_time") {
              const timeFilterInputId = `time-filter-${filter.alias}`;
              return (
                <div key={filter.alias} className="shrink-0">
                  <div className="relative">
                    <FloatingLabel
                      htmlFor={timeFilterInputId}
                      className="pointer-events-none bg-transparent dark:bg-transparent"
                    >
                      {filter.timeColumn}
                    </FloatingLabel>
                    <TimeSpanSelector
                      ref={this.timeSpanSelectorRef}
                      defaultTimeSpan={this.defaultTimeSpan}
                      showTimeSpanSelector={true}
                      showRefresh={false}
                      showAutoRefresh={false}
                      size="sm"
                      buttonClassName="h-8 rounded-r-none"
                      onSelectedSpanChanged={this.onTimeSpanChangeCallback}
                    />
                  </div>
                </div>
              );
            }

            // Get or create ref for this selector
            if (!this.selectorRefs.has(filter.name)) {
              this.selectorRefs.set(filter.name, React.createRef<SelectorRef>());
            }
            const selectorRef = this.selectorRefs.get(filter.name)!;

            return (
              <Selector
                ref={selectorRef}
                className={cn("h-8", {
                  "rounded-l": index === 0,
                  "rounded-r": index === filterSpecs.length - 1,
                  "rounded-l rounded-r": index === 0 && index === filterSpecs.length - 1,
                })}
                placeholder={filter.displayText ? filter.displayText : filter.name}
                key={filter.name}
                defaultItems={[]}
                defaultPattern={this.selectedFilters.get(filter.name)}
                supportedComparators={filter.supportedComparators}
                beforeLoadItem={() => this.beforeLoadItemCallback(index)}
                onLoadItem={() => this.onLoadItemCallback(index)}
                afterLoadItem={() => this.afterLoadItemCallback(index)}
                onItemSelected={(pattern) => this.onItemSelectedCallback(index, filter, pattern)}
              />
            );
          })}
        </div>

        <div className="flex items-center gap-1 right-0">
          {this.props.children}

          {hasTimeFilterSpec && (
            <Button
              type="button"
              variant="outline"
              className="h-8 w-8 p-0"
              aria-label="Refresh"
              title="Refresh"
              onClick={this.handleRefreshTimeSpan}
            >
              <RefreshCcw className="h-4 w-4" />
            </Button>
          )}

          {!hasTimeFilterSpec &&
            (this.props.showTimeSpanSelector !== false ||
              this.props.showRefresh !== false ||
              this.props.showAutoRefresh !== false) && (
              <TimeSpanSelector
                ref={this.timeSpanSelectorRef}
                defaultTimeSpan={this.defaultTimeSpan}
                size="sm"
                showTimeSpanSelector={this.props.showTimeSpanSelector}
                showRefresh={this.props.showRefresh}
                showAutoRefresh={this.props.showAutoRefresh}
                onSelectedSpanChanged={this.onTimeSpanChangeCallback}
              />
            )}
        </div>
      </div>
    );
  }
}

export default DashboardFilterComponent;
