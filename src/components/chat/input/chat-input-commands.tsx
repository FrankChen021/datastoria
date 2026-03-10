"use client";

import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { Popover, PopoverAnchor, PopoverContent } from "@/components/ui/popover";
import type { CommandDetail } from "@/lib/ai/commands/command-manager";
import { StringUtils } from "@/lib/string-utils";
import { TextHighlighter } from "@/lib/text-highlighter";
import { cn } from "@/lib/utils";
import * as React from "react";

export interface ChatInputCommandsType {
  open: (searchQuery: string) => void;
  close: () => void;
  isOpen: () => boolean;
  getSelected: () => CommandDetail | null;
  handleKeyDown: (e: React.KeyboardEvent) => boolean;
}

interface ChatInputCommandsProps {
  commands: CommandDetail[];
  onSelect: (command: CommandDetail) => void;
  onInteractOutside?: (target: EventTarget | null) => boolean;
}

export const ChatInputCommands = React.memo(
  React.forwardRef<ChatInputCommandsType, ChatInputCommandsProps>(
    ({ commands, onSelect, onInteractOutside }, ref) => {
      const [open, setOpen] = React.useState(false);
      const [activeIndex, setActiveIndex] = React.useState(0);
      const [query, setQuery] = React.useState("");
      const activeItemRef = React.useRef<HTMLDivElement>(null);

      const filtered = React.useMemo(() => {
        if (!query) {
          return commands.map((c) => ({ ...c, matchStart: -1, matchLength: 0 }));
        }
        const lower = query.toLowerCase();
        return commands
          .map((c) => ({
            ...c,
            matchStart: StringUtils.indexOfIgnoreCase(c.name, lower),
            matchLength: lower.length,
          }))
          .filter((c) => c.matchStart >= 0);
      }, [commands, query]);

      const activeCommand = filtered[activeIndex] ?? null;

      const description: React.ReactNode | null = activeCommand?.description ? (
        <div className="text-xs">
          <div className="text-muted-foreground mb-0.5">Description</div>
          <div className="text-foreground whitespace-pre-wrap break-all">
            {activeCommand.description}
          </div>
        </div>
      ) : null;

      React.useImperativeHandle(ref, () => ({
        open: (searchQuery: string) => {
          setQuery(searchQuery.toLowerCase());
          setActiveIndex(0);
          setOpen(true);
        },
        close: () => setOpen(false),
        isOpen: () => open,
        getSelected: () => activeCommand,
        handleKeyDown: (e: React.KeyboardEvent) => {
          if (!open) return false;

          if (e.key === "Escape") {
            setOpen(false);
            return true;
          }

          if (filtered.length > 0) {
            if (e.key === "ArrowDown") {
              setActiveIndex((prev) => (prev + 1) % filtered.length);
              e.preventDefault();
              e.stopPropagation();
              return true;
            }
            if (e.key === "ArrowUp") {
              setActiveIndex((prev) => (prev - 1 + filtered.length) % filtered.length);
              e.preventDefault();
              e.stopPropagation();
              return true;
            }
            if (e.key === "Enter" && !e.shiftKey && !e.metaKey && !e.ctrlKey) {
              if (activeCommand) {
                onSelect(activeCommand);
                setOpen(false);
              }
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
      }, [activeIndex, open]);

      const handleSelect = React.useCallback(
        (command: CommandDetail) => {
          onSelect(command);
          setOpen(false);
        },
        [onSelect]
      );

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
                  value={activeCommand?.name}
                  shouldFilter={false}
                >
                  <CommandList className="flex-1 overflow-y-auto pt-1">
                    <CommandEmpty>No commands found</CommandEmpty>
                    {filtered.length > 0 && (
                      <CommandGroup
                        heading="Commands"
                        className="py-0 [&_[cmdk-group-heading]]:py-1"
                      >
                        {filtered.map((cmd, index) => {
                          const isSelected = index === activeIndex;
                          return (
                            <CommandItem
                              key={cmd.name}
                              value={cmd.name}
                              onSelect={() => handleSelect(cmd)}
                              onMouseEnter={() => setActiveIndex(index)}
                              className={cn(
                                "py-1 pl-6 flex w-full items-center gap-2 cursor-pointer hover:bg-accent hover:text-accent-foreground",
                                isSelected && "bg-accent text-accent-foreground"
                              )}
                              ref={isSelected ? activeItemRef : null}
                            >
                              <span className="flex-1 min-w-0 truncate font-mono text-xs">
                                /
                                {TextHighlighter.highlight2(
                                  cmd.name,
                                  cmd.matchStart,
                                  cmd.matchStart >= 0 ? cmd.matchStart + cmd.matchLength : -1,
                                  "text-yellow-500"
                                )}
                              </span>
                            </CommandItem>
                          );
                        })}
                      </CommandGroup>
                    )}
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
ChatInputCommands.displayName = "ChatInputCommandsPopover";
