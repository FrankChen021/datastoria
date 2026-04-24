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
import { ArrowLeft, ChevronRight, Database, Settings2, Table2 } from "lucide-react";
import * as React from "react";

export interface ChatInputSuggestionItem {
  name: string;
  type: "database" | "table" | "setting";
  description: React.ReactNode;
  search: string;
  badge?: string;
  group: string;
}

type SuggestionMode = "groups" | "databases" | "tables" | "settings";

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

function scrollItemIntoViewport(viewport: HTMLElement, item: HTMLElement) {
  const itemTop = item.offsetTop;
  const itemBottom = itemTop + item.offsetHeight;
  const viewportTop = viewport.scrollTop;
  const viewportBottom = viewportTop + viewport.clientHeight;

  if (itemTop < viewportTop) {
    viewport.scrollTop = itemTop;
    return;
  }

  if (itemBottom > viewportBottom) {
    viewport.scrollTop = itemBottom - viewport.clientHeight;
  }
}

interface ChatInputSuggestionsProps {
  onSelect: (item: ChatInputSuggestionItem) => void;
  onInteractOutside?: (target: EventTarget | null) => boolean;
  suggestions: {
    databases: ChatInputSuggestionItem[];
    tables: ChatInputSuggestionItem[];
    settings: ChatInputSuggestionItem[];
  };
}

interface SuggestionGroupItem {
  mode: Exclude<SuggestionMode, "groups">;
  title: string;
  icon: React.ComponentType<{ className?: string }>;
  count: number;
  matchCount?: number;
}

function filterTableSuggestions(
  suggestions: ChatInputSuggestionItem[],
  query: string
): FilteredSuggestions {
  const matchedSuggestions: Omit<FilteredSuggestionItem, "globalIndex">[] = [];
  const groupedSuggestions: Record<string, FilteredSuggestionItem[]> = {};
  const searchParts = query.toLowerCase().split(".");

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

    matchedSuggestions.push({
      ...suggestionItem,
      matchStart: nameIndex,
      matchLength: nameLength,
    });
  }

  const flatSuggestions = matchedSuggestions.map((item, globalIndex) => ({
    ...item,
    globalIndex,
  }));

  for (const item of flatSuggestions) {
    const group = item.group || "Global";
    if (!groupedSuggestions[group]) {
      groupedSuggestions[group] = [];
    }
    groupedSuggestions[group].push(item);
  }

  const orderedFlatSuggestions = Object.values(groupedSuggestions).flat();
  orderedFlatSuggestions.forEach((item, globalIndex) => {
    item.globalIndex = globalIndex;
  });

  return { flatSuggestions: orderedFlatSuggestions, groupedSuggestions };
}

function filterNameSuggestions(
  suggestions: ChatInputSuggestionItem[],
  query: string
): FilteredSuggestions {
  const normalizedQuery = query.trim().toLowerCase();
  const matchedSuggestions: Omit<FilteredSuggestionItem, "globalIndex">[] = [];

  for (const suggestionItem of suggestions) {
    const nameIndex = normalizedQuery
      ? StringUtils.indexOfIgnoreCase(suggestionItem.name, normalizedQuery)
      : -1;

    if (normalizedQuery && nameIndex < 0) {
      continue;
    }

    matchedSuggestions.push({
      ...suggestionItem,
      matchStart: nameIndex,
      matchLength: normalizedQuery.length,
    });
  }

  const flatSuggestions = matchedSuggestions.map((item, globalIndex) => ({
    ...item,
    globalIndex,
  }));

  const groupedSuggestions = flatSuggestions.reduce<Record<string, FilteredSuggestionItem[]>>(
    (result, item) => {
      const group = item.group || "default";
      if (!result[group]) {
        result[group] = [];
      }
      result[group].push(item);
      return result;
    },
    {}
  );

  const orderedFlatSuggestions = Object.values(groupedSuggestions).flat();
  orderedFlatSuggestions.forEach((item, globalIndex) => {
    item.globalIndex = globalIndex;
  });

  return {
    flatSuggestions: orderedFlatSuggestions,
    groupedSuggestions,
  };
}

export const ChatInputSuggestions = React.memo(
  React.forwardRef<ChatInputSuggestionsType, ChatInputSuggestionsProps>(
    ({ onSelect, onInteractOutside, suggestions }, ref) => {
      const [open, setOpen] = React.useState(false);
      const [mode, setMode] = React.useState<SuggestionMode>("groups");
      const [query, setQuery] = React.useState("");
      const [activeIndex, setActiveIndex] = React.useState<number | null>(null);
      const activeItemRef = React.useRef<HTMLElement | null>(null);
      const listViewportRef = React.useRef<HTMLElement | null>(null);
      const openRef = React.useRef(open);

      React.useEffect(() => {
        openRef.current = open;
      }, [open]);

      const groupItems = React.useMemo<SuggestionGroupItem[]>(
        () => [
          {
            mode: "databases",
            title: "Databases",
            icon: Database,
            count: suggestions.databases.length,
          },
          {
            mode: "tables",
            title: "Tables",
            icon: Table2,
            count: suggestions.tables.length,
          },
          {
            mode: "settings",
            title: "Settings",
            icon: Settings2,
            count: suggestions.settings.length,
          },
        ],
        [suggestions.databases.length, suggestions.settings.length, suggestions.tables.length]
      );

      const visibleGroupItems = React.useMemo<SuggestionGroupItem[]>(() => {
        const normalizedQuery = query.trim().toLowerCase();
        return groupItems
          .map((item) => {
            const matchCount =
              item.mode === "databases"
                ? filterNameSuggestions(suggestions.databases, query).flatSuggestions.length
                : item.mode === "tables"
                  ? filterTableSuggestions(suggestions.tables, query).flatSuggestions.length
                  : filterNameSuggestions(suggestions.settings, query).flatSuggestions.length;

            return {
              ...item,
              matchCount,
            };
          })
          .filter((item) => {
            if (!normalizedQuery) {
              return true;
            }

            return (
              StringUtils.indexOfIgnoreCase(item.title, normalizedQuery) >= 0 ||
              (item.matchCount ?? 0) > 0
            );
          });
      }, [groupItems, query, suggestions.databases, suggestions.settings, suggestions.tables]);

      const currentSuggestions = React.useMemo(() => {
        if (mode === "databases") {
          return filterNameSuggestions(suggestions.databases, query);
        }
        if (mode === "tables") {
          return filterTableSuggestions(suggestions.tables, query);
        }
        if (mode === "settings") {
          return filterNameSuggestions(suggestions.settings, query);
        }
        return {
          flatSuggestions: [],
          groupedSuggestions: {},
        } satisfies FilteredSuggestions;
      }, [mode, query, suggestions.databases, suggestions.settings, suggestions.tables]);

      const flatSuggestions = currentSuggestions.flatSuggestions;
      const groupedSuggestions = currentSuggestions.groupedSuggestions;
      const resolvedGroupIndex = activeIndex ?? (visibleGroupItems.length === 1 ? 0 : null);
      const resolvedSuggestionIndex = activeIndex ?? (flatSuggestions.length === 1 ? 0 : null);

      React.useImperativeHandle(ref, () => ({
        open: (searchQuery: string) => {
          setQuery(searchQuery);
          setActiveIndex(null);
          if (!openRef.current) {
            setMode("groups");
          }
          setOpen(true);
        },
        close: () => {
          setOpen(false);
          setMode("groups");
          setActiveIndex(null);
        },
        isOpen: () => open,
        getSelectedIndex: () => activeIndex ?? -1,
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
            if (visibleGroupItems.length > 0) {
              if (e.key === "ArrowDown") {
                setActiveIndex((prev) =>
                  prev === null ? 0 : (prev + 1) % visibleGroupItems.length
                );
                e.preventDefault();
                e.stopPropagation();
                return true;
              }
              if (e.key === "ArrowUp") {
                setActiveIndex((prev) =>
                  prev === null
                    ? visibleGroupItems.length - 1
                    : (prev - 1 + visibleGroupItems.length) % visibleGroupItems.length
                );
                e.preventDefault();
                e.stopPropagation();
                return true;
              }
              if (
                (e.key === "Enter" || e.key === "Tab") &&
                !e.shiftKey &&
                !e.metaKey &&
                resolvedGroupIndex !== null
              ) {
                e.preventDefault();
                e.stopPropagation();
                setMode(visibleGroupItems[resolvedGroupIndex].mode);
                setActiveIndex(0);
                return true;
              }
              if (e.key === "ArrowRight" && resolvedGroupIndex !== null) {
                e.preventDefault();
                e.stopPropagation();
                setMode(visibleGroupItems[resolvedGroupIndex].mode);
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
            setActiveIndex(null);
            return true;
          }

          if (flatSuggestions.length > 0) {
            if (e.key === "ArrowDown") {
              setActiveIndex((prev) => (prev === null ? 0 : (prev + 1) % flatSuggestions.length));
              e.preventDefault();
              e.stopPropagation();
              return true;
            }
            if (e.key === "ArrowUp") {
              setActiveIndex((prev) =>
                prev === null
                  ? flatSuggestions.length - 1
                  : (prev - 1 + flatSuggestions.length) % flatSuggestions.length
              );
              e.preventDefault();
              e.stopPropagation();
              return true;
            }
            if (e.key === "PageDown") {
              setActiveIndex((prev) =>
                prev === null ? 0 : Math.min(prev + 8, flatSuggestions.length - 1)
              );
              e.preventDefault();
              e.stopPropagation();
              return true;
            }
            if (e.key === "PageUp") {
              setActiveIndex((prev) =>
                prev === null ? flatSuggestions.length - 1 : Math.max(prev - 8, 0)
              );
              e.preventDefault();
              e.stopPropagation();
              return true;
            }
            if (
              (e.key === "Enter" || e.key === "Tab") &&
              !e.shiftKey &&
              !e.metaKey &&
              !e.ctrlKey &&
              resolvedSuggestionIndex !== null
            ) {
              e.preventDefault();
              e.stopPropagation();
              onSelect(flatSuggestions[resolvedSuggestionIndex]);
              return true;
            }
          }

          return false;
        },
      }));

      React.useEffect(() => {
        if (open && activeItemRef.current && listViewportRef.current) {
          scrollItemIntoViewport(listViewportRef.current, activeItemRef.current);
        }
      }, [activeIndex, open, mode]);

      React.useEffect(() => {
        setActiveIndex(null);
      }, [query]);

      React.useEffect(() => {
        if (mode !== "groups") {
          return;
        }

        setActiveIndex((currentIndex) => {
          if (visibleGroupItems.length === 0 || currentIndex === null) {
            return currentIndex;
          }

          return Math.min(currentIndex, visibleGroupItems.length - 1);
        });
      }, [mode, visibleGroupItems.length]);

      const handleSelect = React.useCallback(
        (item: ChatInputSuggestionItem) => {
          onSelect(item);
          setOpen(false);
          setMode("groups");
        },
        [onSelect]
      );

      const detailHeaderLabel =
        mode === "settings" ? "ClickHouse Settings" : mode === "databases" ? "Databases" : "Tables";
      const description =
        mode === "groups" || activeIndex === null
          ? null
          : flatSuggestions[Math.min(activeIndex, flatSuggestions.length - 1)]?.description;
      const renderSuggestionItem = (item: FilteredSuggestionItem) => {
        const isSelected = item.globalIndex === activeIndex;
        return (
          <CommandItem
            key={`${item.type}.${item.group}.${item.name}`}
            value={item.name}
            onSelect={() => handleSelect(item)}
            onMouseEnter={() => setActiveIndex(item.globalIndex)}
            className={cn(
              "flex w-full items-center gap-2 py-1 text-sm",
              "pl-6 pr-2",
              isSelected && "bg-accent text-accent-foreground"
            )}
            ref={isSelected ? activeItemRef : null}
          >
            <span className="min-w-0 flex-1 truncate">
              {TextHighlighter.highlight2(
                item.name,
                item.matchStart,
                item.matchStart >= 0 ? item.matchStart + item.matchLength : -1,
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
      };

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
                  <div
                    ref={listViewportRef as React.RefObject<HTMLDivElement>}
                    className="flex-1 overflow-y-auto py-1"
                  >
                    {visibleGroupItems.map((item, index) => {
                      const Icon = item.icon;
                      const isSelected = index === activeIndex;

                      return (
                        <button
                          key={item.mode}
                          type="button"
                          onMouseDown={(e) => e.preventDefault()}
                          onClick={() => {
                            setMode(item.mode);
                            setActiveIndex(0);
                          }}
                          onMouseEnter={() => setActiveIndex(index)}
                          className={cn(
                            "mx-1 flex w-[calc(100%-0.5rem)] items-center gap-2 rounded-sm px-2 py-1 text-left",
                            isSelected && "bg-accent text-accent-foreground"
                          )}
                          ref={
                            isSelected
                              ? (node) => {
                                  activeItemRef.current = node;
                                }
                              : undefined
                          }
                        >
                          <Icon className="h-3.5 w-3.5 text-muted-foreground" />
                          <div className="min-w-0 flex-1 truncate text-sm font-medium">
                            {item.title}
                          </div>
                          <Badge
                            variant="outline"
                            className="border-0 px-1 py-0 text-[10px] text-muted-foreground"
                          >
                            {query.trim() ? item.matchCount : item.count}
                          </Badge>
                          <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />
                        </button>
                      );
                    })}
                    {visibleGroupItems.length === 0 ? (
                      <div className="py-3 text-center text-sm text-muted-foreground">
                        No suggestion groups found
                      </div>
                    ) : null}
                  </div>
                ) : (
                  <Command
                    className="flex-1 rounded-none border-0 bg-transparent shadow-none"
                    value={
                      resolvedSuggestionIndex === null
                        ? undefined
                        : flatSuggestions[resolvedSuggestionIndex]?.name
                    }
                    shouldFilter={false}
                  >
                    <CommandList
                      ref={listViewportRef as React.RefObject<HTMLDivElement>}
                      className="flex-1 overflow-y-auto pt-1"
                    >
                      <CommandEmpty>
                        {mode === "settings"
                          ? "No settings found"
                          : mode === "databases"
                            ? "No databases found"
                            : "No tables found"}
                      </CommandEmpty>
                      {mode === "databases"
                        ? flatSuggestions.map((item) => renderSuggestionItem(item))
                        : flatSuggestions.length > 0 &&
                          Object.entries(groupedSuggestions).map(([group, items]) => (
                            <CommandGroup
                              key={group}
                              heading={group}
                              className="py-0 [&_[cmdk-group-heading]]:px-3 [&_[cmdk-group-heading]]:py-1 [&_[cmdk-group-heading]]:text-[11px]"
                            >
                              {items.map((item) => renderSuggestionItem(item))}
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
