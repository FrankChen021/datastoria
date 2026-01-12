"use client";

import { HighlightableCommandItem } from "@/components/shared/cmdk/cmdk-extension";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Command,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
} from "@/components/ui/command";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { FloatingLabelInput } from "@/components/ui/floating-label-input";
import { Popover, PopoverAnchor, PopoverContent } from "@/components/ui/popover";
import { Separator } from "@/components/ui/separator";
import { ComparatorManager, QueryPattern, type Comparator } from "@/lib/query-utils";
import { cn } from "@/lib/utils";
import NumberFlow from "@number-flow/react";
import { ReloadIcon } from "@radix-ui/react-icons";
import { Command as CommandPrimitive, useCommandState } from "cmdk";
import { Check, ChevronsDown, X } from "lucide-react";
import * as React from "react";
import { useCallback, useEffect, useState } from "react";

interface SelectorItem {
  value: string;
  label: string;
  tag?: React.ReactNode;
}

interface SelectorProps {
  className?: string;
  placeholder: string;

  // If not provided, all comparators will be supported
  supportedComparators?: string[];

  defaultPattern?: QueryPattern;
  defaultItems: SelectorItem[];
  beforeLoadItem: () => boolean;
  onLoadItem: () => Promise<SelectorItem[]>;
  afterLoadItem: () => void;
  onItemSelected: (matcher: QueryPattern) => void;
}

export interface SelectorRef {
  setPattern: (pattern: QueryPattern | null) => void;
}

function filter(value: string, search: string): number {
  return value.toLowerCase().indexOf(search.toLowerCase()) >= 0 ? 1 : 0;
}

const CommandItemCount: React.FC<React.PropsWithChildren> = ({ children }) => {
  const filterCount = useCommandState((state) => state.filtered.count);

  return (
    <>
      {/* The style is from CommandItem */}
      {/* No set pb-1 because we want remove space between this component and the CommandItems below this component */}
      <div className="relative flex cursor-default select-none items-center rounded-sm px-2 pt-1 text-sm outline-none data-[disabled=true]:pointer-events-none data-[selected=true]:bg-accent data-[selected=true]:text-accent-foreground data-[disabled=true]:opacity-50 text-center text-xs text-muted-foreground">
        <NumberFlow value={filterCount} />
        &nbsp;item(s) found
        {children}
      </div>
    </>
  );
};

function getSelectionDisplayText(selectedValue: Set<string>): string {
  if (selectedValue.size === 0) {
    return "";
  } else {
    return Array.from(selectedValue).join(",");
  }
}

interface PatternSelectorProps {
  selectedComparator: Comparator;
  selectedValue: Set<string>;

  comparatorGroup: Comparator[][];
  listItems: SelectorItem[];
}

interface PatternSelectorState {
  selectedComparator: Comparator;
  selectedPatterns: Set<string>;
  listItems: SelectorItem[];
}

/**
 * The drop down content for selecting comparator and patterns
 */
class PatternSelector extends React.Component<PatternSelectorProps, PatternSelectorState> {
  public getSelectedPatterns(): Set<string> {
    return this.state.selectedPatterns;
  }

  public getSelectedComparator(): Comparator {
    return this.state.selectedComparator;
  }

  constructor(props: PatternSelectorProps) {
    super(props);

    const newItems = [...this.props.listItems];
    const patterns = new Set<string>(this.props.selectedValue);
    this.state = {
      selectedComparator: this.props.selectedComparator,
      selectedPatterns: patterns,
      listItems: this.addSelectedToItems(newItems, patterns),
    };

    this.onPatternSelected = this.onPatternSelected.bind(this);
    this.onSearchPatternKeyDown = this.onSearchPatternKeyDown.bind(this);
    this.onComparatorSelected = this.onComparatorSelected.bind(this);
  }

  componentDidUpdate(prevProps: PatternSelectorProps) {
    if (prevProps.selectedComparator.name !== this.props.selectedComparator.name) {
      this.setState({ selectedComparator: this.props.selectedComparator });
    }

    let shouldUpdateItems = false;

    // Update selectedPatterns if the selectedValue prop has changed
    if (prevProps.selectedValue !== this.props.selectedValue) {
      this.setState({
        selectedPatterns: new Set<string>(this.props.selectedValue),
      });
      shouldUpdateItems = true;
    }

    // Update listItems if the listItems prop has changed
    if (prevProps.listItems !== this.props.listItems) {
      this.setState({
        listItems: [...this.props.listItems],
      });
      shouldUpdateItems = true;
    }

    if (shouldUpdateItems) {
      this.setState((prevState) => {
        return {
          listItems: this.addSelectedToItems(prevState.listItems, prevState.selectedPatterns),
        };
      });
    }
  }

  private getUserInputBadge() {
    return (
      <Badge variant="outline" className="font-normal px-1">
        user input
      </Badge>
    );
  }

  private addSelectedToItems(items: SelectorItem[], selectedPatterns: Set<string>) {
    // Find values in selectedPatterns that are not in items
    const selectedValuesNotInItems = Array.from(selectedPatterns)
      .filter((pattern) => !items.some((item) => item.value === pattern))
      .map(
        (value) =>
          ({
            value: value,
            label: value,
            tag: this.getUserInputBadge(),
          }) as SelectorItem
      );

    // Return the combined array with new items at the beginning
    return selectedValuesNotInItems.length > 0 ? [...selectedValuesNotInItems, ...items] : items;
  }

  private onSearchPatternKeyDown(event: React.KeyboardEvent) {
    if (event.key === "Enter") {
      const val = (event.target as HTMLInputElement).value;
      const index = this.state.listItems.findIndex((item) => item.value === val);
      if (index == -1) {
        // Add a new element to the list
        this.setState({
          listItems: [
            {
              value: val,
              label: val,
              tag: this.getUserInputBadge(),
            },
            ...this.state.listItems,
          ],
        });
      }

      // Select the newly added element
      this.setState({ selectedPatterns: new Set<string>([val]) });

      event.preventDefault();
      event.stopPropagation();
      return;
    }
  }

  private onComparatorSelected(newComparator: Comparator) {
    this.setState({ selectedComparator: newComparator });

    if (!newComparator.allowMultiValue) {
      // Reset to single selection (only first item or empty)
      this.setState((prev) => {
        if (prev.selectedPatterns.size > 0) {
          // Select the first item
          return { selectedPatterns: new Set([Array.from(prev.selectedPatterns)[0]]) };
        }
        return { selectedPatterns: new Set<string>() };
      });
    }
  }

  /**
   * Handle user selection, keep states in a temporary
   * Since we support multiple selection on patterns, the deselect logic is applied here which is different from the comparator
   */
  private onPatternSelected(newPattern: string) {
    this.setState((prevState) => {
      const prevPatterns = prevState.selectedPatterns;

      if (this.state.selectedComparator.allowMultiValue) {
        // Multiple selection
        const newSet = new Set(prevPatterns);
        if (newSet.has(newPattern)) {
          // Deselect
          newSet.delete(newPattern);
        } else {
          newSet.add(newPattern);
        }
        return { selectedPatterns: newSet };
      } else {
        // Single selection, apply a deselection logic
        return {
          selectedPatterns: prevPatterns.has(newPattern)
            ? new Set<string>()
            : new Set<string>([newPattern]),
        };
      }
    });
  }

  render() {
    const { selectedPatterns, listItems } = this.state;

    return (
      <div className="flex">
        {/* Comparator */}
        <Command disablePointerSelection className="rounded-none w-[150px]">
          <div className="relative flex items-center rounded-none px-2 py-2 text-center text-sm border-b">
            <b>Comparators</b>
          </div>
          <CommandList className="min-h-[200px] max-h-[300px]">
            <CommandGroup>
              {this.props.comparatorGroup.map((comparators, index) => (
                <React.Fragment key={index}>
                  {comparators.map((comparator) => (
                    <CommandItem
                      key={comparator.name}
                      value={comparator.name}
                      onSelect={() => this.onComparatorSelected(comparator)}
                      className={cn(
                        "cursor-pointer rounded-none",
                        this.state.selectedComparator.name === comparator.name
                          ? "!bg-accent !text-accent-foreground"
                          : ""
                      )}
                    >
                      <Check
                        className={cn(
                          "mr-2 h-4 w-4",
                          this.state.selectedComparator.name === comparator.name
                            ? "opacity-100"
                            : "opacity-0"
                        )}
                      />
                      {comparator.name}
                    </CommandItem>
                  ))}
                  {index < this.props.comparatorGroup.length - 1 && (
                    <CommandSeparator className="my-1" />
                  )}
                </React.Fragment>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>

        <div>
          <Separator orientation="vertical" />
        </div>

        <Command
          disablePointerSelection
          filter={filter}
          defaultValue={selectedPatterns.size > 0 ? Array.from(selectedPatterns)[0] : ""}
          className="rounded-none flex-1"
        >
          <div className="relative flex cursor-default select-none items-center rounded-none px-2 py-2 text-sm outline-none data-[disabled=true]:pointer-events-none data-[selected=true]:bg-accent data-[selected=true]:text-accent-foreground data-[disabled=true]:opacity-50 text-center text-sm border-b">
            <b>Patterns</b>
          </div>

          <CommandInput
            autoFocus
            className="h-8" //Override the default h-10
            placeholder={"Search or use ENTER to input..."}
            onKeyDown={this.onSearchPatternKeyDown}
          />

          <CommandItemCount>
            <NumberFlow className="ml-2" value={selectedPatterns.size} />
            &nbsp;item(s) selected
          </CommandItemCount>

          <CommandList
            // The CommandList has a default height even if its children are empty, we have to hide it when there is no item
            hidden={listItems.length === 0}
            className="max-h-[437px]"
          >
            <CommandGroup>
              {listItems.map((item) => (
                <CommandItem
                  key={item.value}
                  value={item.value}
                  onSelect={this.onPatternSelected}
                  className={cn(
                    "cursor-pointer rounded-none flex items-center justify-between",
                    // Set the selected style by ourselves
                    selectedPatterns.has(item.value) ? "!bg-accent !text-accent-foreground" : ""
                  )}
                >
                  <div className="flex">
                    <Check
                      className={cn(
                        "mr-2 h-4 w-4",
                        selectedPatterns.has(item.value) ? "opacity-100" : "opacity-0"
                      )}
                    />
                    <HighlightableCommandItem text={item.label} />
                  </div>
                  <div>{item.tag}</div>
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </div>
    );
  }
}

const Selector = React.forwardRef<SelectorRef, SelectorProps>(
  (
    {
      className,
      placeholder,
      supportedComparators,
      defaultItems,
      defaultPattern,
      beforeLoadItem,
      onLoadItem,
      afterLoadItem,
      onItemSelected,
    },
    ref
  ) => {
    const comparatorGroups = React.useMemo(() => {
      return ComparatorManager.getComparatorGroups(supportedComparators);
    }, [supportedComparators]);

    const [isOpen, setIsOpen] = useState(false);
    const [selectedComparator, setSelectedComparator] = useState(
      ComparatorManager.parseComparator(defaultPattern?.comparator)
    );

    const [selectedValue, setSelectedValue] = useState(
      new Set<string>(defaultPattern ? defaultPattern.values : [])
    );
    const [listItems, setListItems] = useState<SelectorItem[]>(defaultItems);
    const [isLoading, setIsLoading] = useState(false);
    const textInputRef = React.useRef<HTMLInputElement>(null);
    const searchInputRef = React.useRef<HTMLInputElement>(null);
    const patternSelectorRef = React.useRef<PatternSelector>(null);

    // Sync with defaultPattern changes (e.g., when setFilter is called)
    useEffect(() => {
      if (defaultPattern) {
        const newComparator = ComparatorManager.parseComparator(defaultPattern.comparator);
        setSelectedComparator(newComparator);
        const newValue = new Set<string>(defaultPattern.values);
        setSelectedValue(newValue);
        // Update the input field
        if (textInputRef.current) {
          textInputRef.current.value =
            defaultPattern.values.length === 0 ? "" : defaultPattern.values.join(",");
        }
      } else {
        // Clear selection if defaultPattern is undefined/null
        setSelectedValue(new Set<string>());
        setSelectedComparator(ComparatorManager.parseComparator("="));
        if (textInputRef.current) {
          textInputRef.current.value = "";
        }
      }
    }, [defaultPattern]);

    useEffect(() => {
      if (!isOpen) {
        return;
      }

      // Focus on the CommandInput when the dropdown list is open
      setTimeout(() => {
        searchInputRef.current?.focus(); // Focus the input when the popover opens
      }, 0);

      if (beforeLoadItem && beforeLoadItem()) {
        setIsLoading(true);
        onLoadItem().then((newItems) => {
          setListItems(newItems);
          setIsLoading(false);
          afterLoadItem();
        });
      }
    }, [isOpen]);

    const onInputKeyDown = React.useCallback(
      (event: React.KeyboardEvent) => {
        if (event.key === "ArrowDown") {
          setIsOpen(true);

          event.preventDefault();
          event.stopPropagation();
          return;
        }

        if (event.key === "Enter") {
          const inputText = (event.target as HTMLInputElement).value.trim();

          if (inputText.length > 0) {
            const inputValues = selectedComparator.allowMultiValue
              ? inputText.split(",").map((v) => v.trim())
              : [inputText];

            setSelectedValue(new Set<string>(inputValues));

            // Notification of change
            onItemSelected(
              new QueryPattern(
                selectedComparator.allowMultiValue,
                selectedComparator.name,
                inputValues
              )
            );
          } else {
            // Reset to empty selection

            setSelectedValue(new Set<string>());
            onItemSelected(null);
          }

          event.preventDefault();
          event.stopPropagation();
        }
      },
      [selectedComparator]
    );

    const onComparatorSelected = React.useCallback(
      (comparator: Comparator) => {
        setSelectedComparator(comparator);

        if (selectedValue.size > 0) {
          // Notification of change only when there're selected patterns
          onItemSelected(
            new QueryPattern(comparator.allowMultiValue, comparator.name, Array.from(selectedValue))
          );
        }
      },
      [selectedValue]
    );

    const onApplyFilterClicked = useCallback(() => {
      setIsOpen(false);

      const selectedPatterns = patternSelectorRef.current.getSelectedPatterns();
      const selectedComparator = patternSelectorRef.current.getSelectedComparator();

      setSelectedValue(selectedPatterns);
      setSelectedComparator(selectedComparator);

      const isMultiValue = selectedComparator.allowMultiValue;
      const selectedValues = Array.from(selectedPatterns);

      // Update the INPUT when selected value changes
      if (textInputRef.current) {
        textInputRef.current.value = selectedValues.length === 0 ? "" : selectedValues.join(",");

        // Focus on the INPUT after selection,
        // So that users can use TAB to switch to next selector more easily
        textInputRef.current.focus();
      }

      // Notification
      if (selectedValues.length === 0) {
        onItemSelected(null);
      } else {
        onItemSelected(
          new QueryPattern(isMultiValue, selectedComparator.name, Array.from(selectedPatterns))
        );
      }
    }, []);

    const onClearSelection = React.useCallback(
      (event: React.MouseEvent) => {
        event.preventDefault();
        event.stopPropagation();
        if (textInputRef.current) {
          textInputRef.current.value = "";
        }

        setIsOpen(false);
        setSelectedValue(new Set<string>());
        setSelectedComparator(ComparatorManager.parseComparator("=")); // Reset to the default comparator
        onItemSelected(null);
      },
      [onItemSelected]
    );

    // Expose setPattern method via ref
    React.useImperativeHandle(
      ref,
      () => ({
        setPattern: (pattern: QueryPattern | null) => {
          if (pattern) {
            const newComparator = ComparatorManager.parseComparator(pattern.comparator);
            setSelectedComparator(newComparator);
            const newValue = new Set<string>(pattern.values);
            setSelectedValue(newValue);
            // Update the input field
            if (textInputRef.current) {
              textInputRef.current.value =
                pattern.values.length === 0 ? "" : pattern.values.join(",");
            }
          } else {
            // Clear selection
            setSelectedValue(new Set<string>());
            setSelectedComparator(ComparatorManager.parseComparator("="));
            if (textInputRef.current) {
              textInputRef.current.value = "";
            }
          }
        },
      }),
      []
    );

    // Logger.trace(`Rendering selector [${placeholder}]...`);

    return (
      <div className="relative flex">
        <Popover open={isOpen} onOpenChange={setIsOpen}>
          <PopoverAnchor asChild>
            <FloatingLabelInput
              id={placeholder}
              autoFocus={false}
              ref={textInputRef}
              className={cn("rounded-none text-ellipsis", "pl-6 pr-8", className)}
              defaultValue={getSelectionDisplayText(selectedValue)}
              onKeyDown={onInputKeyDown}
              label={placeholder}
            >
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <span
                    className={cn(
                      "h-5 text-xs absolute left-2 top-1/2 transform -translate-y-1/3 cursor-pointer",
                      selectedValue.size > 0 ? "" : "text-gray-500"
                    )}
                    title={selectedComparator.name}
                  >
                    {selectedComparator.display}
                  </span>
                </DropdownMenuTrigger>
                <DropdownMenuContent
                  className="w-40 rounded-none"
                  align="start"
                  side="bottom"
                  sideOffset={0}
                >
                  {comparatorGroups.map((comparators, index) => (
                    <React.Fragment key={index}>
                      {comparators.map((comparator) => (
                        <DropdownMenuItem
                          key={comparator.name}
                          onSelect={() => onComparatorSelected(comparator)}
                          className={cn(
                            "cursor-pointer rounded-none",
                            selectedComparator.name === comparator.name
                              ? "!bg-accent !text-accent-foreground"
                              : ""
                          )}
                        >
                          <Check
                            className={cn(
                              "mr-2 h-4 w-4",
                              selectedComparator.name === comparator.name
                                ? "opacity-100"
                                : "opacity-0"
                            )}
                          />
                          {comparator.name}
                        </DropdownMenuItem>
                      ))}
                      {index < comparatorGroups.length - 1 && (
                        <DropdownMenuSeparator className="my-1" />
                      )}
                    </React.Fragment>
                  ))}
                </DropdownMenuContent>
              </DropdownMenu>
            </FloatingLabelInput>
          </PopoverAnchor>
          <PopoverContent
            className="p-0 rounded-none dark:border-gray-700 bg-white dark:bg-gray-800 !w-auto min-w-[240px] max-h-[600px]"
            align="start"
            side="bottom"
            sideOffset={-1}
          >
            {isLoading && (
              <CommandPrimitive.Loading className="relative flex justify-center cursor-default select-none items-center rounded-sm px-2 py-2 mt-1 mb-1 text-sm outline-none data-[disabled=true]:pointer-events-none data-[selected=true]:bg-accent data-[selected=true]:text-accent-foreground data-[disabled=true]:opacity-50 text-center text-sm">
                <ReloadIcon className="h-4 w-4 mr-1 animate-spin opacity-50" />
              </CommandPrimitive.Loading>
            )}
            {!isLoading && (
              <>
                <PatternSelector
                  ref={patternSelectorRef}
                  selectedComparator={selectedComparator}
                  selectedValue={selectedValue}
                  comparatorGroup={comparatorGroups}
                  listItems={listItems}
                />
                <div className="flex justify-end p-2 gap-1 border-t">
                  <Button
                    variant="outline"
                    className="px-3 py-1 h-8 text-xs"
                    onClick={onClearSelection}
                  >
                    Reset
                  </Button>
                  <Button
                    variant="outline"
                    className="px-2 h-8 text-xs"
                    onClick={() => setIsOpen(false)}
                  >
                    Cancel
                  </Button>
                  <Button
                    variant="outline"
                    className="px-3 h-8 text-xs"
                    onClick={onApplyFilterClicked}
                  >
                    Apply
                  </Button>
                </div>
              </>
            )}
          </PopoverContent>
        </Popover>

        <div className="flex absolute right-1 top-1/2 transform -translate-y-1/2 ">
          {selectedValue.size > 0 && (
            <span title="clear selection">
              <X
                className="h-4 w-4 shrink-0 opacity-50 cursor-pointer"
                onClick={onClearSelection}
              />
            </span>
          )}
          <ChevronsDown
            className="h-4 w-4 shrink-0 opacity-50 text-gray-500 cursor-pointer"
            onClick={() => {
              if (!isOpen) setIsOpen(true);
            }}
          />
        </div>
      </div>
    );
  }
);

const SelectorWithMemo = React.memo(Selector, (prevProps, nextProps) => {
  //console.log(prevProps);
  //console.log(nextProps);
  // TODO: Fix the comparison logic
  return prevProps == nextProps;
});

SelectorWithMemo.displayName = "Selector";
export default SelectorWithMemo;
