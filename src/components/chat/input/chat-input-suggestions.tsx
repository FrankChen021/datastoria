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
import { ArrowLeft, ChevronRight, Settings2, Table2 } from "lucide-react";
import * as React from "react";

export interface ChatInputSuggestionItem {
  name: string;
  type: "table" | "setting";
  description: React.ReactNode;
  search: string;
  badge?: string;
  group: string;
}

type SuggestionMode = "groups" | "tables" | "settings";

interface FilteredSuggestionItem extends ChatInputSuggestionItem {
  globalIndex: number;
  matchStart: number;
  matchLength: number;
}

interface FilteredSuggestions {
  flatSuggestions: FilteredSuggestionItem[];
  groupedSuggestions: Record<string, FilteredSuggestionItem[]>;
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
  onSelect: (item: ChatInputSuggestionItem) => void;
  onInteractOutside?: (target: EventTarget | null) => boolean;
  suggestions: {
    tables: ChatInputSuggestionItem[];
    settings: ChatInputSuggestionItem[];
  };
}

interface SuggestionGroupItem {
  mode: Exclude<SuggestionMode, "groups">;
  title: string;
  subtitle: string;
  icon: React.ComponentType<{ className?: string }>;
  count: number;
}

function filterTableSuggestions(
  suggestions: ChatInputSuggestionItem[],
  query: string
): FilteredSuggestions {
  const flatSuggestions: FilteredSuggestionItem[] = [];
  const groupedSuggestions: Record<string, FilteredSuggestionItem[]> = {};
  const searchParts = query.toLowerCase().split(".");
  let globalIndex = 0;

  for (const suggestionItem of suggestions) {
    let nameIndex = -1;
    let nameLength = 0;

    if (query.length > 0) {
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
        include = suggestionItem.group.toLowerCase() === groupPart && nameIndex >= 0;
      }

      if (!include) {
        continue;
      }

      nameLength = namePart.length;
    }

    const group = suggestionItem.group || "Global";
    if (!groupedSuggestions[group]) {
      groupedSuggestions[group] = [];
    }

    const item: FilteredSuggestionItem = {
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
}

function filterSettingSuggestions(
  suggestions: ChatInputSuggestionItem[],
  query: string
): FilteredSuggestions {
  const normalizedQuery = query.trim().toLowerCase();
  const flatSuggestions: FilteredSuggestionItem[] = [];
  let globalIndex = 0;

  for (const suggestionItem of suggestions) {
    const nameIndex = normalizedQuery
      ? StringUtils.indexOfIgnoreCase(suggestionItem.name, normalizedQuery)
      : -1;

    if (normalizedQuery && nameIndex < 0) {
      continue;
    }

    flatSuggestions.push({
      ...suggestionItem,
      globalIndex,
      matchStart: nameIndex,
      matchLength: normalizedQuery.length,
    });
    globalIndex++;
  }

  return {
    flatSuggestions,
    groupedSuggestions: flatSuggestions.reduce<Record<string, FilteredSuggestionItem[]>>(
      (result, item) => {
        const group = item.group || "settings";
        if (!result[group]) {
          result[group] = [];
        }
        result[group].push(item);
        return result;
      },
      {}
    ),
  };
}

export const ChatInputSuggestions = React.memo(
  React.forwardRef<ChatInputSuggestionsType, ChatInputSuggestionsProps>(
    ({ onSelect, onInteractOutside, suggestions }, ref) => {
      const [open, setOpen] = React.useState(false);
      const [mode, setMode] = React.useState<SuggestionMode>("tables");
      const [query, setQuery] = React.useState("");
      const [activeIndex, setActiveIndex] = React.useState(0);
      const activeItemRef = React.useRef<HTMLDivElement>(null);

      const groupItems = React.useMemo<SuggestionGroupItem[]>(
        () => [
          {
            mode: "tables",
            title: "Tables",
            subtitle: "Browse database tables",
            icon: Table2,
            count: suggestions.tables.length,
          },
          {
            mode: "settings",
            title: "Settings",
            subtitle: "Insert ClickHouse settings",
            icon: Settings2,
            count: suggestions.settings.length,
          },
        ],
        [suggestions.settings.length, suggestions.tables.length]
      );

      const currentSuggestions = React.useMemo(() => {
        if (mode === "tables") {
          return filterTableSuggestions(suggestions.tables, query);
        }
        if (mode === "settings") {
          return filterSettingSuggestions(suggestions.settings, query);
        }
        return {
          flatSuggestions: [],
          groupedSuggestions: {},
        } satisfies FilteredSuggestions;
      }, [mode, query, suggestions.settings, suggestions.tables]);

      const flatSuggestions = currentSuggestions.flatSuggestions;
      const groupedSuggestions = currentSuggestions.groupedSuggestions;

      React.useImperativeHandle(ref, () => ({
        open: (searchQuery: string) => {
          setQuery(searchQuery);
          setActiveIndex(0);
          if (!open) {
            setMode("tables");
          }
          setOpen(true);
        },
        close: () => {
          setOpen(false);
          setMode("tables");
          setActiveIndex(0);
        },
        isOpen: () => open,
        getSelectedIndex: () => activeIndex,
        getSuggestions: () => flatSuggestions,
        handleKeyDown: (e: React.KeyboardEvent) => {
          if (!open) return false;

          const isBackNavigation =
            e.key === "ArrowLeft" || (e.key === "Backspace" && query.length === 0);

          if (e.key === "Escape") {
            setOpen(false);
            return true;
          }

          if (mode === "groups") {
            if (groupItems.length > 0) {
              if (e.key === "ArrowDown") {
                setActiveIndex((prev) => (prev + 1) % groupItems.length);
                e.preventDefault();
                e.stopPropagation();
                return true;
              }
              if (e.key === "ArrowUp") {
                setActiveIndex((prev) => (prev - 1 + groupItems.length) % groupItems.length);
                e.preventDefault();
                e.stopPropagation();
                return true;
              }
              if ((e.key === "Enter" || e.key === "Tab") && !e.shiftKey && !e.metaKey) {
                e.preventDefault();
                e.stopPropagation();
                setMode(groupItems[activeIndex].mode);
                setActiveIndex(0);
                return true;
              }
            }
            return false;
          }

          if (isBackNavigation) {
            e.preventDefault();
            e.stopPropagation();
            setMode("groups");
            setActiveIndex(0);
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
            if ((e.key === "Enter" || e.key === "Tab") && !e.shiftKey && !e.metaKey && !e.ctrlKey) {
              e.preventDefault();
              e.stopPropagation();
              onSelect(flatSuggestions[activeIndex]);
              return true;
            }
          }

          return false;
        },
      }));

      React.useEffect(() => {
        if (open && activeItemRef.current) {
          activeItemRef.current.scrollIntoView({ block: "nearest" });
        }
      }, [activeIndex, open, mode]);

      React.useEffect(() => {
        setActiveIndex(0);
      }, [mode, query]);

      const handleSelect = React.useCallback(
        (item: ChatInputSuggestionItem) => {
          onSelect(item);
          setOpen(false);
          setMode("tables");
        },
        [onSelect]
      );

      const detailHeaderLabel = mode === "settings" ? "Settings" : "Tables";
      const description =
        mode === "groups"
          ? null
          : flatSuggestions[Math.min(activeIndex, flatSuggestions.length - 1)]?.description;

      return (
        <Popover open={open} onOpenChange={setOpen}>
          <PopoverAnchor asChild>
            <div className="absolute top-0 left-0 h-0 w-full" />
          </PopoverAnchor>
          <PopoverContent
            align="start"
            side="top"
            sideOffset={4}
            className="z-[10000] flex w-auto items-stretch border-0 bg-transparent p-0 pointer-events-auto"
            onOpenAutoFocus={(e) => e.preventDefault()}
            onInteractOutside={(e) => {
              if (onInteractOutside && !onInteractOutside(e.target)) {
                e.preventDefault();
              }
            }}
          >
            <div className="flex max-h-[320px] items-stretch">
              <div
                data-panel="left"
                className={cn(
                  "flex w-[360px] flex-col rounded-sm border bg-popover shadow-md",
                  description && "rounded-r-none"
                )}
              >
                {mode !== "groups" && (
                  <div className="flex items-center gap-1 border-b px-2 py-1">
                    <button
                      type="button"
                      aria-label="Show suggestion groups"
                      className="inline-flex h-7 w-7 items-center justify-center rounded-sm text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground"
                      onMouseDown={(e) => e.preventDefault()}
                      onClick={() => setMode("groups")}
                    >
                      <ArrowLeft className="h-4 w-4" />
                    </button>
                    <span className="text-sm font-medium">{detailHeaderLabel}</span>
                  </div>
                )}

                {mode === "groups" ? (
                  <Command
                    className="flex-1 rounded-none border-0 bg-transparent shadow-none"
                    shouldFilter={false}
                  >
                    <CommandList className="flex-1 overflow-y-auto py-1">
                      {groupItems.map((item, index) => {
                        const Icon = item.icon;
                        const isSelected = index === activeIndex;

                        return (
                          <CommandItem
                            key={item.mode}
                            value={item.title}
                            onSelect={() => {
                              setMode(item.mode);
                              setActiveIndex(0);
                            }}
                            onMouseEnter={() => setActiveIndex(index)}
                            className={cn(
                              "mx-1 flex items-center gap-2.5 px-2.5 py-1.5",
                              isSelected && "bg-accent text-accent-foreground"
                            )}
                            ref={isSelected ? activeItemRef : null}
                          >
                            <Icon className="h-3.5 w-3.5 text-muted-foreground" />
                            <div className="min-w-0 flex-1">
                              <div className="truncate text-xs font-medium">{item.title}</div>
                              <div className="truncate text-[11px] text-muted-foreground">
                                {item.subtitle}
                              </div>
                            </div>
                            <Badge
                              variant="outline"
                              className="border-0 px-1 py-0 text-[9px] text-muted-foreground"
                            >
                              {item.count}
                            </Badge>
                            <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />
                          </CommandItem>
                        );
                      })}
                    </CommandList>
                  </Command>
                ) : (
                  <Command
                    className="flex-1 rounded-none border-0 bg-transparent shadow-none"
                    value={flatSuggestions[activeIndex]?.name}
                    shouldFilter={false}
                  >
                    <CommandList className="flex-1 overflow-y-auto pt-1">
                      <CommandEmpty>
                        {mode === "settings" ? "No settings found" : "No tables found"}
                      </CommandEmpty>
                      {flatSuggestions.length > 0 &&
                        Object.entries(groupedSuggestions).map(([group, items]) => (
                          <CommandGroup
                            key={group}
                            heading={group}
                            className="py-0 [&_[cmdk-group-heading]]:px-3 [&_[cmdk-group-heading]]:py-1 [&_[cmdk-group-heading]]:text-[11px]"
                          >
                            {items.map((item) => {
                              const isSelected = item.globalIndex === activeIndex;
                              return (
                                <CommandItem
                                  key={`${item.type}.${group}.${item.name}`}
                                  value={item.name}
                                  onSelect={() => handleSelect(item)}
                                  onMouseEnter={() => setActiveIndex(item.globalIndex)}
                                  className={cn(
                                    "flex w-full items-center gap-2 py-1 text-sm",
                                    mode === "settings" ? "pl-6 pr-2" : "pl-6 pr-2",
                                    isSelected && "bg-accent text-accent-foreground"
                                  )}
                                  ref={isSelected ? activeItemRef : null}
                                >
                                  <span className="min-w-0 flex-1 truncate">
                                    {TextHighlighter.highlight2(
                                      item.name,
                                      item.matchStart,
                                      item.matchStart >= 0
                                        ? item.matchStart + item.matchLength
                                        : -1,
                                      "text-yellow-500"
                                    )}
                                  </span>
                                  {item.badge && (
                                    <Badge
                                      variant="outline"
                                      className="border-0 px-1 py-0 text-[10px] text-muted-foreground"
                                    >
                                      {item.badge}
                                    </Badge>
                                  )}
                                </CommandItem>
                              );
                            })}
                          </CommandGroup>
                        ))}
                    </CommandList>
                  </Command>
                )}
              </div>

              {description && (
                <div
                  data-panel="right"
                  className="w-[360px] overflow-y-auto overflow-x-hidden rounded-md rounded-l-none border border-l-0 bg-popover p-3 shadow-md"
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
