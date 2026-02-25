"use client";

import { Badge } from "@/components/ui/badge";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { Popover, PopoverAnchor, PopoverContent } from "@/components/ui/popover";
import { StringUtils } from "@/lib/string-utils";
import { TextHighlighter } from "@/lib/text-highlighter";
import { cn } from "@/lib/utils";
import * as React from "react";

export interface ChatInputSuggestionItem {
  name: string;
  type: string;
  description: React.ReactNode;
  search: string;
  badge?: string;
  group: string;
}

export interface ChatInputSuggestionsType {
  open: (searchQuery: string) => void;
  close: () => void;
  isOpen: () => boolean;
  getSelectedIndex: () => number;
  getSuggestions: () => ChatInputSuggestionItem[];
  handleKeyDown: (e: React.KeyboardEvent) => boolean;
}

interface ChatInputSuggestionsProps {
  onSelect: (group: string, tableName: string) => void;
  onInteractOutside?: (target: EventTarget | null) => boolean;
  suggestions: ChatInputSuggestionItem[];
}

export const ChatInputSuggestions = React.memo(
  React.forwardRef<ChatInputSuggestionsType, ChatInputSuggestionsProps>(
    ({ onSelect, onInteractOutside, suggestions }, ref) => {
      const [open, setOpen] = React.useState(false);
      const [activeIndex, setActiveIndex] = React.useState(0);
      const [searchParts, setSearchParts] = React.useState<string[] | undefined>(undefined);
      const activeItemRef = React.useRef<HTMLDivElement>(null);

      const { flatSuggestions, groupedSuggestions } = React.useMemo(() => {
        const flatSuggestions: (ChatInputSuggestionItem & {
          globalIndex: number;
          matchStart: number;
          matchLength: number;
        })[] = [];
        const groupedSuggestions: Record<
          string,
          (ChatInputSuggestionItem & {
            globalIndex: number;
            matchStart: number;
            matchLength: number;
          })[]
        > = {};

        let globalIndex = 0;

        for (const suggestionItem of suggestions) {
          let nameIndex = -1;
          let nameLength = 0;

          if (searchParts && searchParts.length > 0) {
            const groupPart = searchParts[0];
            const namePart = searchParts.length === 2 ? searchParts[1] : searchParts[0];

            let include = false;
            if (searchParts.length === 1) {
              nameIndex = StringUtils.indexOfIgnoreCase(suggestionItem.name, groupPart);
              include =
                groupPart === "" ||
                StringUtils.indexOfIgnoreCase(suggestionItem.group, groupPart) >= 0 ||
                nameIndex >= 0;
            } else if (searchParts.length === 2) {
              nameIndex = StringUtils.indexOfIgnoreCase(suggestionItem.name, namePart);
              include = suggestionItem.group === groupPart && nameIndex >= 0;
            }
            if (!include) continue;

            nameLength = namePart.length;
          }

          const group = suggestionItem.group || "Global";
          if (!groupedSuggestions[group]) groupedSuggestions[group] = [];

          const item = {
            ...suggestionItem,
            globalIndex,
            matchStart: nameIndex,
            matchLength: nameLength,
          };
          flatSuggestions.push(item);
          groupedSuggestions[group].push(item);
          globalIndex++;
        }

        return { flatSuggestions, groupedSuggestions };
      }, [suggestions, searchParts]);

      React.useImperativeHandle(ref, () => ({
        open: (query: string) => {
          setSearchParts(query.toLowerCase().split("."));
          setActiveIndex(0);
          setOpen(true);
        },
        close: () => setOpen(false),
        isOpen: () => open,
        getSelectedIndex: () => activeIndex,
        getSuggestions: () => flatSuggestions,
        handleKeyDown: (e: React.KeyboardEvent) => {
          if (!open) return false;

          if (e.key === "Escape") {
            setOpen(false);
            return true;
          }

          if (flatSuggestions.length > 0) {
            if (e.key === "ArrowDown") {
              setActiveIndex((prev) => (prev + 1) % flatSuggestions.length);
              e.preventDefault();
              e.stopPropagation();
              return true;
            }
            if (e.key === "ArrowUp") {
              setActiveIndex(
                (prev) => (prev - 1 + flatSuggestions.length) % flatSuggestions.length
              );
              e.preventDefault();
              e.stopPropagation();
              return true;
            }
            if (e.key === "PageDown") {
              setActiveIndex((prev) => Math.min(prev + 8, flatSuggestions.length - 1));
              e.preventDefault();
              e.stopPropagation();
              return true;
            }
            if (e.key === "PageUp") {
              setActiveIndex((prev) => Math.max(prev - 8, 0));
              e.preventDefault();
              e.stopPropagation();
              return true;
            }
            if (e.key === "Enter" && !e.shiftKey) {
              onSelect(flatSuggestions[activeIndex].group, flatSuggestions[activeIndex].name);
              return true;
            }
          }
          return false;
        },
      }));

      // Make sure the active item is visible
      React.useEffect(() => {
        if (open && activeItemRef.current) {
          activeItemRef.current.scrollIntoView({
            block: "nearest",
          });
        }
      }, [activeIndex, open]);

      const handleSelect = React.useCallback(
        (group: string, name: string) => {
          onSelect(group, name);
          setOpen(false);
        },
        [onSelect]
      );

      const description = flatSuggestions[activeIndex]?.description;

      return (
        <Popover open={open} onOpenChange={setOpen}>
          <PopoverAnchor asChild>
            <div className="absolute top-0 left-0 w-full h-0" />
          </PopoverAnchor>
          <PopoverContent
            align="start"
            side="top"
            sideOffset={4}
            className="p-0 w-auto flex items-stretch z-[10000] bg-transparent border-0 pointer-events-auto"
            onOpenAutoFocus={(e) => e.preventDefault()}
            onInteractOutside={(e) => {
              if (onInteractOutside && !onInteractOutside(e.target)) {
                e.preventDefault();
              }
            }}
          >
            <div className="flex items-stretch max-h-[300px]">
              <div
                data-panel="left"
                className={cn(
                  "flex flex-col border shadow-md w-[350px] bg-popover rounded-sm",
                  description && "rounded-r-none"
                )}
              >
                <Command
                  className="flex-1 rounded-none border-0 shadow-none bg-transparent"
                  value={flatSuggestions[activeIndex]?.name}
                  shouldFilter={false}
                >
                  <CommandList className="flex-1 overflow-y-auto pt-1">
                    <CommandEmpty>No items found</CommandEmpty>
                    {flatSuggestions.length > 0 &&
                      Object.entries(groupedSuggestions).map(([group, tables]) => (
                        <CommandGroup
                          key={group}
                          heading={group}
                          className="py-0 [&_[cmdk-group-heading]]:py-1"
                        >
                          {tables.map((table) => {
                            const isSelected = table.globalIndex === activeIndex;
                            return (
                              <CommandItem
                                key={group + "." + table.name}
                                value={table.name}
                                onSelect={() => handleSelect(group, table.name)}
                                onMouseEnter={() => setActiveIndex(table.globalIndex)}
                                className={cn(
                                  "py-1 pl-6 flex w-full items-center gap-2 cursor-pointer hover:bg-accent hover:text-accent-foreground",
                                  isSelected && "bg-accent text-accent-foreground"
                                )}
                                ref={isSelected ? activeItemRef : null}
                              >
                                <span className="flex-1 min-w-0 truncate">
                                  {TextHighlighter.highlight2(
                                    table.name,
                                    table.matchStart,
                                    table.matchStart >= 0
                                      ? table.matchStart + table.matchLength
                                      : -1,
                                    "text-yellow-500"
                                  )}
                                </span>
                                {table.badge && (
                                  <Badge
                                    variant="outline"
                                    className="text-muted-foreground text-[10px] rounded-none px-1 py-0 border-0"
                                  >
                                    {table.badge}
                                  </Badge>
                                )}
                              </CommandItem>
                            );
                          })}
                        </CommandGroup>
                      ))}
                  </CommandList>
                </Command>
              </div>

              {description && (
                <div
                  data-panel="right"
                  className="w-[350px] overflow-y-auto overflow-x-hidden p-2 bg-popover border border-l-0 shadow-md rounded-md rounded-l-none"
                >
                  {description}
                </div>
              )}
            </div>
          </PopoverContent>
        </Popover>
      );
    }
  )
);
ChatInputSuggestions.displayName = "MentionSuggestionsPopover";
