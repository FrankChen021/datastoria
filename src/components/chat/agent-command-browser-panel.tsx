"use client";

import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandItem,
  CommandList,
  CommandSeparator,
} from "@/components/ui/command";
import { cn } from "@/lib/utils";
import * as React from "react";

export interface AgentCommandBrowserItem {
  key: string;
  label: React.ReactNode;
  description?: string;
  icon?: React.ReactNode;
  separatorBefore?: boolean;
  itemClassName?: string;
  labelClassName?: string;
}

export interface AgentCommandBrowserPanelRef {
  getActiveItem: () => AgentCommandBrowserItem | null;
  moveActiveIndex: (delta: number) => void;
  setActiveIndex: (index: number) => void;
}

interface AgentCommandBrowserPanelProps {
  emptyText?: string;
  groupHeading?: string;
  items: AgentCommandBrowserItem[];
  onSelectItem: (item: AgentCommandBrowserItem) => void;
}

export const AgentCommandBrowserPanel = React.forwardRef<
  AgentCommandBrowserPanelRef,
  AgentCommandBrowserPanelProps
>(function AgentCommandBrowserPanel(
  { emptyText = "No commands found", groupHeading = "Commands", items, onSelectItem },
  ref
) {
  const [activeIndex, setActiveIndex] = React.useState(0);
  const activeItemRef = React.useRef<HTMLDivElement>(null);
  const activeItem = items[activeIndex] ?? null;

  React.useEffect(() => {
    setActiveIndex((current) => {
      if (items.length === 0) {
        return 0;
      }
      return Math.min(current, items.length - 1);
    });
  }, [items]);

  React.useImperativeHandle(
    ref,
    () => ({
      getActiveItem: () => items[activeIndex] ?? null,
      moveActiveIndex: (delta: number) => {
        if (items.length === 0) {
          return;
        }
        setActiveIndex((current) => (current + delta + items.length) % items.length);
      },
      setActiveIndex: (index: number) => {
        if (items.length === 0) {
          setActiveIndex(0);
          return;
        }
        const nextIndex = Math.max(0, Math.min(index, items.length - 1));
        setActiveIndex(nextIndex);
      },
    }),
    [activeIndex, items]
  );

  React.useEffect(() => {
    if (activeItemRef.current && typeof activeItemRef.current.scrollIntoView === "function") {
      activeItemRef.current.scrollIntoView({ block: "nearest" });
    }
  }, [activeIndex]);

  return (
    <div className="flex items-stretch max-h-[300px]">
      <div
        data-panel="left"
        className={cn(
          "flex flex-col border shadow-md w-[280px] bg-popover rounded-sm",
          activeItem?.description && "rounded-r-none"
        )}
      >
        <Command
          className="flex-1 rounded-none border-0 shadow-none bg-transparent"
          value={activeItem?.key}
          shouldFilter={false}
        >
          <CommandList className="flex-1 overflow-y-auto pt-1">
            <CommandEmpty>{emptyText}</CommandEmpty>
            {items.length > 0 && (
              <CommandGroup heading={groupHeading} className="py-0 [&_[cmdk-group-heading]]:py-1">
                {items.map((item, index) => {
                  const isSelected = index === activeIndex;
                  const isLastItem = index === items.length - 1;
                  return (
                    <React.Fragment key={item.key}>
                      {item.separatorBefore ? <CommandSeparator className="my-1" /> : null}
                      <CommandItem
                        value={item.key}
                        onSelect={() => onSelectItem(item)}
                        onMouseEnter={() => setActiveIndex(index)}
                        className={cn(
                          "py-1 pl-4 pr-3 flex w-full items-center gap-2 cursor-pointer hover:bg-accent hover:text-accent-foreground",
                          isLastItem && "pb-2",
                          item.itemClassName,
                          isSelected && "bg-accent text-accent-foreground"
                        )}
                        ref={isSelected ? activeItemRef : null}
                      >
                        {item.icon ? (
                          <span className="shrink-0 flex items-center">{item.icon}</span>
                        ) : null}
                        <span
                          className={cn(
                            "flex-1 min-w-0 truncate font-mono text-xs",
                            item.labelClassName
                          )}
                        >
                          {item.label}
                        </span>
                      </CommandItem>
                    </React.Fragment>
                  );
                })}
              </CommandGroup>
            )}
          </CommandList>
        </Command>
      </div>

      {activeItem?.description ? (
        <div
          data-panel="right"
          className="w-[320px] overflow-y-auto overflow-x-hidden p-2 bg-popover border border-l-0 shadow-md rounded-md rounded-l-none"
        >
          <div className="text-xs">
            <div className="text-muted-foreground mb-0.5">Description</div>
            <div className="text-foreground whitespace-pre-wrap break-all">
              {activeItem.description}
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
});
