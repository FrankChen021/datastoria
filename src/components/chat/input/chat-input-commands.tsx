"use client";

import {
  AgentCommandBrowserPanel,
  type AgentCommandBrowserPanelRef,
} from "@/components/chat/agent-command-browser-panel";
import { Popover, PopoverAnchor, PopoverContent } from "@/components/ui/popover";
import type { CommandDetail } from "@/lib/ai/commands/command-manager";
import { StringUtils } from "@/lib/string-utils";
import { TextHighlighter } from "@/lib/text-highlighter";
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
      const [query, setQuery] = React.useState("");
      const commandBrowserRef = React.useRef<AgentCommandBrowserPanelRef>(null);

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

      React.useEffect(() => {
        if (open) {
          commandBrowserRef.current?.setActiveIndex(0);
        }
      }, [open, query, filtered.length]);

      React.useImperativeHandle(ref, () => ({
        open: (searchQuery: string) => {
          setQuery(searchQuery.toLowerCase());
          setOpen(true);
        },
        close: () => setOpen(false),
        isOpen: () => open,
        getSelected: () => {
          const activeItem = commandBrowserRef.current?.getActiveItem();
          if (!activeItem) {
            return null;
          }
          return filtered.find((cmd) => cmd.name === activeItem.key) ?? null;
        },
        handleKeyDown: (e: React.KeyboardEvent) => {
          if (!open) return false;

          if (e.key === "Escape") {
            setOpen(false);
            return true;
          }

          if (filtered.length > 0) {
            if (e.key === "ArrowDown") {
              commandBrowserRef.current?.moveActiveIndex(1);
              e.preventDefault();
              e.stopPropagation();
              return true;
            }
            if (e.key === "ArrowUp") {
              commandBrowserRef.current?.moveActiveIndex(-1);
              e.preventDefault();
              e.stopPropagation();
              return true;
            }
            if (e.key === "Enter" && !e.shiftKey && !e.metaKey && !e.ctrlKey) {
              const activeItem = commandBrowserRef.current?.getActiveItem();
              const selected = activeItem
                ? (filtered.find((cmd) => cmd.name === activeItem.key) ?? null)
                : null;
              if (selected) {
                e.preventDefault();
                e.stopPropagation();
                onSelect(selected);
                setOpen(false);
              }
              return true;
            }
          }

          return false;
        },
      }));

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
            <AgentCommandBrowserPanel
              ref={commandBrowserRef}
              items={filtered.map((cmd) => ({
                key: cmd.name,
                label: (
                  <>
                    /
                    {TextHighlighter.highlight2(
                      cmd.name,
                      cmd.matchStart,
                      cmd.matchStart >= 0 ? cmd.matchStart + cmd.matchLength : -1,
                      "text-yellow-500"
                    )}
                  </>
                ),
                description: cmd.description,
              }))}
              onSelectItem={(item) => {
                const selected = filtered.find((cmd) => cmd.name === item.key);
                if (selected) {
                  handleSelect(selected);
                }
              }}
            />
          </PopoverContent>
        </Popover>
      );
    }
  )
);
ChatInputCommands.displayName = "ChatInputCommandsPopover";
