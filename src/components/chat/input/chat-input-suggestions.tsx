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
import { TextHighlighter } from "@/lib/text-highlighter";
import { cn } from "@/lib/utils";
import * as React from "react";

export interface ChatInputSuggestionItem {
  name: string;
  type: string;
  description: string;
  search: string;
  badge?: string;
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
  onSelect: (tableName: string) => void;
  onInteractOutside?: (target: EventTarget | null) => boolean;
  suggestions: ChatInputSuggestionItem[];
}

export const ChatInputSuggestions = React.memo(
  React.forwardRef<ChatInputSuggestionsType, ChatInputSuggestionsProps>(
    ({ onSelect, onInteractOutside, suggestions: allSuggestions }, ref) => {
      const [open, setOpen] = React.useState(false);
      const [activeIndex, setActiveIndex] = React.useState(0);
      const [searchQuery, setSearchQuery] = React.useState("");
      const activeItemRef = React.useRef<HTMLDivElement>(null);

      const filteredSuggestions = React.useMemo(() => {
        const lowerQuery = searchQuery.toLowerCase();
        return allSuggestions.filter((t) => t.search.includes(lowerQuery)).slice(0, 100);
      }, [allSuggestions, searchQuery]);

      React.useImperativeHandle(ref, () => ({
        open: (query: string) => {
          setSearchQuery(query);
          setActiveIndex(0);
          setOpen(true);
        },
        close: () => setOpen(false),
        isOpen: () => open,
        getSelectedIndex: () => activeIndex,
        getSuggestions: () => filteredSuggestions,
        handleKeyDown: (e: React.KeyboardEvent) => {
          if (!open) return false;

          if (e.key === "Escape") {
            setOpen(false);
            return true;
          }

          if (filteredSuggestions.length > 0) {
            if (e.key === "ArrowDown") {
              setActiveIndex((prev) => (prev + 1) % filteredSuggestions.length);
              e.preventDefault();
              e.stopPropagation();
              return true;
            }
            if (e.key === "ArrowUp") {
              setActiveIndex(
                (prev) => (prev - 1 + filteredSuggestions.length) % filteredSuggestions.length
              );
              e.preventDefault();
              e.stopPropagation();
              return true;
            }
            if (e.key === "PageDown") {
              setActiveIndex((prev) => Math.min(prev + 8, filteredSuggestions.length - 1));
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
              onSelect(filteredSuggestions[activeIndex].name);
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
        (name: string) => {
          onSelect(name);
          setOpen(false);
        },
        [onSelect]
      );

      const description = filteredSuggestions[activeIndex]?.description;

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
                  "flex flex-col border shadow-md w-[350px] bg-popover overflow-x-auto rounded-sm",
                  description && "rounded-r-none"
                )}
              >
                <Command
                  className="flex-1 rounded-none border-0 shadow-none bg-transparent"
                  value={filteredSuggestions[activeIndex]?.name}
                  shouldFilter={false}
                >
                  <CommandList className="flex-1 overflow-y-auto overflow-x-auto">
                    <CommandEmpty>No items found</CommandEmpty>
                    {filteredSuggestions.length > 0 && (
                      <CommandGroup heading="Tables" className="min-w-fit">
                        {filteredSuggestions.map((table, index) => (
                          <CommandItem
                            key={table.name}
                            value={table.name}
                            onSelect={() => handleSelect(table.name)}
                            onMouseEnter={() => setActiveIndex(index)}
                            className={cn(
                              "py-1 flex items-center gap-2 cursor-pointer hover:bg-accent hover:text-accent-foreground min-w-fit",
                              index === activeIndex && "bg-accent text-accent-foreground"
                            )}
                            ref={index === activeIndex ? activeItemRef : null}
                          >
                            <span>{TextHighlighter.highlight(table.name, searchQuery)}</span>
                            {table.badge && (
                              <Badge
                                variant="outline"
                                className="text-muted-foreground text-[10px] rounded-none px-1 py-0 border-0"
                              >
                                {table.badge}
                              </Badge>
                            )}
                          </CommandItem>
                        ))}
                      </CommandGroup>
                    )}
                  </CommandList>
                </Command>
              </div>

              {description && (
                <div
                  data-panel="right"
                  className="w-[350px] overflow-y-auto p-2 bg-popover border border-l-0 shadow-md rounded-md rounded-l-none"
                >
                  <div className="text-sm text-foreground">{description}</div>
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
