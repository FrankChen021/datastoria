"use client";

import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent } from "@/components/ui/popover";
import { TextHighlighter } from "@/lib/text-highlighter";
import * as PopoverPrimitive from "@radix-ui/react-popover";
import { useCommandState, useCommandStore } from "cmdk";
import * as React from "react";
import ReactMarkdown from "react-markdown";

export interface SuggestionItem {
  name: string;
  descriptionMarkdown: string;
  tag?: React.ReactNode;
}

interface SuggestionListProps {
  items: SuggestionItem[];
  onSelect: (item: SuggestionItem) => void;
  /** Custom renderer for description. If not provided, uses default markdown (no admonition support). */
  descriptionRender?: (descriptionMarkdown: string) => React.ReactNode;
  initialValue?: string;
  onValueChange?: (value: string) => void;
  onCancel?: () => void;
  placeholder?: string;
  className?: string;
}

// Filter function for cmdk
function filterItems(value: string, search: string): number {
  if (!search.trim()) {
    return 1; // Show all items when search is empty
  }

  const searchLower = search.toLowerCase();
  const valueLower = value.toLowerCase();

  // Check if name includes search
  if (valueLower.includes(searchLower)) {
    // Prioritize items that start with search
    return valueLower.startsWith(searchLower) ? 2 : 1;
  }

  return 0; // Hide item
}

/** Default markdown render (no admonition support). Used when descriptionRender is not provided. */
function DefaultDescriptionRender({ descriptionMarkdown }: { descriptionMarkdown: string }) {
  return (
    <div className="text-sm text-foreground [&_p]:mb-2 [&_p:last-child]:mb-0 [&_ul]:list-disc [&_ul]:ml-4 [&_ul]:mb-2 [&_ol]:list-decimal [&_ol]:ml-4 [&_ol]:mb-2 [&_code]:bg-muted [&_code]:px-1 [&_code]:py-0.5 [&_code]:rounded [&_code]:text-xs [&_code]:font-mono [&_pre]:bg-muted [&_pre]:p-2 [&_pre]:rounded [&_pre]:overflow-x-auto [&_pre]:mb-2 [&_pre_code]:block [&_pre_code]:p-0 [&_pre_code]:bg-transparent [&_pre_code]:m-0 [&_strong]:font-semibold [&_em]:italic">
      <ReactMarkdown
        components={{
          a: ({ ...props }) => (
            <a
              {...props}
              style={{
                color: "#0070f3",
                textDecoration: "underline",
              }}
              target="_blank"
              rel="noopener noreferrer"
            />
          ),
        }}
      >
        {descriptionMarkdown || "No description available."}
      </ReactMarkdown>
    </div>
  );
}

/**
 * InputControl component that integrates with cmdk
 * Similar to expression-input.tsx's InputControl but for regular Input
 * This must be rendered inside a Command component
 */
const InputControl = React.forwardRef<
  HTMLInputElement,
  React.ComponentProps<typeof Input> & {
    initialValue?: string;
    onValueChange?: (value: string) => void;
  }
>((props, forwardedRef) => {
  const { onChange, initialValue, onValueChange, ...rest } = props;
  const search = useCommandState((state: any) => state.search);
  const store = useCommandStore();

  // Initialize cmdk's search state with initialValue (only once)
  const initializedRef = React.useRef(false);
  const onValueChangeRef = React.useRef(onValueChange);
  React.useEffect(() => {
    onValueChangeRef.current = onValueChange;
  }, [onValueChange]);

  React.useEffect(() => {
    if (initialValue != null && !initializedRef.current) {
      store.setState("search", initialValue);
      initializedRef.current = true;
    }
  }, [initialValue, store]);

  // Track search state changes and notify parent
  const prevSearchRef = React.useRef<string>("");
  React.useEffect(() => {
    if (search !== prevSearchRef.current) {
      prevSearchRef.current = search;
      onValueChangeRef.current?.(search);
    }
  }, [search]);

  return (
    <Input
      ref={forwardedRef}
      {...rest}
      cmdk-input=""
      autoComplete="off"
      autoCorrect="off"
      spellCheck={false}
      aria-autocomplete="list"
      role="combobox"
      aria-expanded={true}
      value={search}
      onChange={(e) => {
        store.setState("search", e.target.value);
        onChange?.(e);
      }}
    />
  );
});
InputControl.displayName = "InputControl";

/**
 * Component to render items with search highlighting (must be inside Command context)
 */
function ItemList({
  items,
  onSelect,
  onSelectItem,
}: {
  items: SuggestionItem[];
  onSelect: (value: string) => void;
  onSelectItem: (item: SuggestionItem) => void;
}) {
  const search = useCommandState((state: any) => state.search);
  const handleSelect = React.useCallback(
    (value: string) => {
      onSelect(value);
      const item = items.find((item) => item.name === value);
      if (item) {
        onSelectItem(item);
      }
    },
    [items, onSelect, onSelectItem]
  );

  return (
    <>
      <CommandEmpty>No settings found.</CommandEmpty>
      <CommandGroup>
        {items.map((item) => (
          <CommandItem
            key={item.name}
            value={item.name}
            onSelect={handleSelect}
            className="cursor-pointer"
          >
            <span className="font-medium text-sm flex-1 min-w-0 truncate">
              {TextHighlighter.highlight(item.name, search, "text-yellow-500 dark:text-yellow-400")}
            </span>
            {item.tag}
          </CommandItem>
        ))}
      </CommandGroup>
    </>
  );
}

export const SuggestionList: React.FC<SuggestionListProps> = ({
  items,
  onSelect,
  descriptionRender,
  initialValue,
  onValueChange,
  onCancel,
  placeholder = "Type to search settings...",
  className,
}) => {
  const [isOpen, setIsOpen] = React.useState(false);
  const [selectedValue, setSelectedValue] = React.useState<string>("");
  const inputRef = React.useRef<HTMLInputElement>(null);
  const rightPanelRef = React.useRef<HTMLDivElement>(null);
  const leftPanelRef = React.useRef<HTMLDivElement>(null);

  // Find selected item based on selectedValue
  const selectedItem = React.useMemo(() => {
    if (selectedValue) {
      return items.find((item) => item.name === selectedValue) || null;
    }
    return null;
  }, [selectedValue, items]);

  // Focus input when popover opens
  React.useEffect(() => {
    if (isOpen && items.length > 0) {
      // Use requestAnimationFrame to ensure the popover is fully rendered
      const rafId = requestAnimationFrame(() => {
        // Use a small delay after RAF to ensure focus works
        setTimeout(() => {
          if (inputRef.current) {
            inputRef.current.focus();
            // Try to focus again if it didn't work the first time
            if (document.activeElement !== inputRef.current) {
              setTimeout(() => {
                inputRef.current?.focus();
              }, 50);
            }
          }
        }, 50);
      });
      return () => cancelAnimationFrame(rafId);
    }
  }, [isOpen, items.length]);

  // Open popover when input is focused
  const onFocus = React.useCallback(() => {
    setIsOpen((prev) => {
      return prev ? prev : true;
    });
  }, []);

  const handleSelectItem = React.useCallback(
    (item: SuggestionItem) => {
      onSelect(item);
      setIsOpen(false);
    },
    [onSelect]
  );

  return (
    <Popover open={isOpen} onOpenChange={setIsOpen}>
      <Command filter={filterItems} value={selectedValue} onValueChange={setSelectedValue}>
        <PopoverPrimitive.Anchor asChild>
          <InputControl
            ref={inputRef}
            initialValue={initialValue}
            onValueChange={onValueChange}
            placeholder={placeholder}
            className={className}
            autoFocus
            onFocus={onFocus}
            onKeyDown={(e) => {
              if (e.key === "Escape") {
                setIsOpen(false);
                // Call onCancel callback if provided (e.g., to exit edit mode)
                if (onCancel) {
                  onCancel();
                }
                e.preventDefault();
                e.stopPropagation();
              }
            }}
          />
        </PopoverPrimitive.Anchor>

        {/* cmdk requires CommandList element, so we need to provide one if the Popover is not open */}
        {!isOpen && <CommandList aria-hidden="true" className="hidden" />}

        <PopoverContent
          align="start"
          autoFocus={false}
          onInteractOutside={(e) => {
            // Prevent closing when clicking on the input
            if (e.target instanceof Element && e.target.hasAttribute("cmdk-input")) {
              e.preventDefault();
              return;
            }
            setIsOpen(false);
            if (onCancel) {
              onCancel();
            }
          }}
          onMouseUp={(e) => {
            const target = e.target as Element;
            // Check if the click is inside the left panel (CommandList) or right panel
            const isInLeftPanel = target.closest('[data-panel="left"]') !== null;
            const isInRightPanel = target.closest('[data-panel="right"]') !== null;

            // Only prevent default if clicked outside both panels (in the PopoverContent gap)
            if (!isInLeftPanel && !isInRightPanel) {
              setIsOpen(false);
              if (onCancel) {
                onCancel();
              }
              e.preventDefault();
              e.stopPropagation();
            }
          }}
          className="p-0 w-auto flex items-start z-[10000] bg-transparent border-0"
        >
          <CommandList
            ref={leftPanelRef}
            data-panel="left"
            className="max-h-[300px] w-[400px] border bg-popover"
          >
            <ItemList items={items} onSelect={setSelectedValue} onSelectItem={handleSelectItem} />
          </CommandList>

          {/* Right: Description panel - only show when an item is selected */}
          {selectedItem && (
            <div
              ref={rightPanelRef}
              data-panel="right"
              className="w-[400px] max-h-[300px] overflow-y-auto p-3 bg-popover border self-start"
            >
              {descriptionRender ? (
                descriptionRender(selectedItem.descriptionMarkdown)
              ) : (
                <DefaultDescriptionRender descriptionMarkdown={selectedItem.descriptionMarkdown} />
              )}
            </div>
          )}
        </PopoverContent>
      </Command>
    </Popover>
  );
};
