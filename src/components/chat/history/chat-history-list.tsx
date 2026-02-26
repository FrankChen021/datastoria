"use client";

import { chatStorage } from "@/components/chat/storage/chat-storage";
import { useConnection } from "@/components/connection/connection-context";
import { Button } from "@/components/ui/button";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import type { Chat } from "@/lib/ai/chat-types";
import "@/lib/number-utils";
import { TextHighlighter } from "@/lib/text-highlighter";
import { cn } from "@/lib/utils";
import * as PopoverPrimitive from "@radix-ui/react-popover";
import { AlertCircle, Check, Eraser, Pencil, Plus, Trash2 } from "lucide-react";
import * as React from "react";

interface HistoryItemProps {
  item: Chat;
  isSelected: boolean;
  searchQuery: string;
  onSelect: () => void;
  onDelete: (id: string, e: React.MouseEvent) => void;
  onEdit: (id: string, newTitle: string) => void;
}

const HistoryItem: React.FC<HistoryItemProps> = ({
  item,
  isSelected,
  searchQuery,
  onSelect,
  onDelete,
  onEdit,
}) => {
  const [isEditing, setIsEditing] = React.useState(false);
  const [editedTitle, setEditedTitle] = React.useState(item.title || "New Conversation");
  const inputRef = React.useRef<HTMLInputElement>(null);

  React.useEffect(() => {
    if (isEditing && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [isEditing]);

  const handleEditClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    setIsEditing(true);
  };

  const handleSave = () => {
    setIsEditing(false);
    const trimmedTitle = editedTitle.trim();
    if (trimmedTitle && trimmedTitle !== item.title) {
      onEdit(item.chatId, trimmedTitle);
    } else {
      setEditedTitle(item.title || "New Conversation");
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      handleSave();
    } else if (e.key === "Escape") {
      setIsEditing(false);
      setEditedTitle(item.title || "New Conversation");
      e.preventDefault();
      e.stopPropagation();
    }
  };

  return (
    <CommandItem
      onSelect={isEditing ? undefined : onSelect}
      value={item.chatId}
      className={`flex items-center justify-between group px-2 py-1 cursor-pointer`}
    >
      <div className="flex items-center gap-1.5 overflow-hidden mr-2 flex-1 min-w-0">
        <Check
          className={cn("h-3 w-3 shrink-0 text-primary", isSelected ? "opacity-100" : "opacity-0")}
        />
        <div className="flex flex-col overflow-hidden min-w-0 flex-1 relative">
          {isEditing ? (
            <div className="relative flex items-center">
              <input
                ref={inputRef}
                type="text"
                value={editedTitle}
                onChange={(e) => setEditedTitle(e.target.value)}
                onBlur={handleSave}
                onKeyDown={handleKeyDown}
                className="text-[11px] font-medium bg-background border border-primary rounded px-1 py-0.5 pr-6 outline-none w-full"
                onClick={(e) => e.stopPropagation()}
              />
              <Button
                variant="ghost"
                size="icon"
                className="h-3 w-3 absolute items-center right-1 text-primary hover:text-primary hover:bg-primary/10"
                onClick={(e) => {
                  e.stopPropagation();
                  handleSave();
                }}
                onMouseDown={(e) => e.preventDefault()}
              >
                <Check className="!h-2.5 !w-2.5" />
              </Button>
            </div>
          ) : (
            <span
              className={`text-[11px] truncate ${isSelected ? "font-semibold" : "font-medium"}`}
            >
              {TextHighlighter.highlight(item.title ?? "New Conversation", searchQuery)}
            </span>
          )}
        </div>
      </div>
      <div className="flex items-center gap-1.5 shrink-0">
        <div className="opacity-0 group-hover:opacity-100 transition-opacity flex items-center gap-0.5">
          <Button
            variant="ghost"
            size="icon"
            className="h-5 w-5 text-muted-foreground hover:text-primary"
            onClick={handleEditClick}
          >
            <Pencil className="!h-2.5 !w-2.5" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="h-5 w-5 text-muted-foreground hover:text-destructive"
            onClick={(e) => onDelete(item.chatId, e)}
          >
            <Trash2 className="!h-2.5 !w-2.5" />
          </Button>
        </div>
        <span className="text-[9px] text-muted-foreground whitespace-nowrap">
          {(new Date().getTime() - new Date(item.updatedAt).getTime()).formatTimeDiff()}
        </span>
      </div>
    </CommandItem>
  );
};

interface ChatHistoryListProps {
  currentChatId: string;
  onNewChat: () => void;
  onClose: () => void;
  onSelectChat?: (id: string) => void;
  onClearCurrentChat?: () => void;
}

const getGroupLabel = (dateInput: Date | string) => {
  const date = typeof dateInput === "string" ? new Date(dateInput) : dateInput;
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const itemDate = new Date(date.getFullYear(), date.getMonth(), date.getDate());

  const diffTime = today.getTime() - itemDate.getTime();
  const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));

  if (diffDays <= 0) return "Today";
  if (diffDays === 1) return "Yesterday";
  if (diffDays < 7) return `${diffDays}d ago`;
  return "Earlier";
};

const ClearAllButton: React.FC<{ onClearAll: () => void }> = ({ onClearAll }) => {
  const [open, setOpen] = React.useState(false);
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="ghost"
          size="sm"
          className="text-xs h-7 text-muted-foreground hover:text-destructive gap-2"
        >
          <Eraser className="h-3 w-3" />
          Clear All
        </Button>
      </PopoverTrigger>
      <PopoverContent
        className="p-0 overflow-hidden z-[10000] w-72"
        side="left"
        align="end"
        alignOffset={-12}
      >
        <PopoverPrimitive.Arrow className="fill-[var(--border)]" width={12} height={8} />
        <div className="p-4">
          <div className="flex items-center gap-2 mb-3">
            <AlertCircle className="h-4 w-4 mt-0.5 shrink-0 text-red-600 dark:text-red-400" />
            <div className="font-semibold text-sm">Confirmation</div>
          </div>
          <div className="pl-6">
            <div className="text-xs mb-3 text-muted-foreground">
              Are you sure to clear all chat history for the current connection? This action cannot
              be reverted.
            </div>
            <div className="flex justify-end gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="h-7 px-2 text-[11px]"
                onClick={() => setOpen(false)}
              >
                Cancel
              </Button>
              <Button
                type="button"
                variant="destructive"
                size="sm"
                className="h-7 px-2 text-[11px]"
                onClick={() => {
                  onClearAll();
                  setOpen(false);
                }}
              >
                Clear
              </Button>
            </div>
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
};

export const ChatHistoryList = React.memo<ChatHistoryListProps>(
  ({ currentChatId, onNewChat, onClose, onSelectChat, onClearCurrentChat }) => {
    const { connection } = useConnection();
    const [history, setHistory] = React.useState<Chat[]>([]);
    const [selectedChatId, setSelectedChatId] = React.useState(currentChatId);

    const fetchHistory = React.useCallback(async () => {
      const connectionId = connection?.connectionId;
      if (!connectionId) {
        setHistory([]);
        return;
      }
      const h = await chatStorage.getChatsForConnection(connectionId);
      setHistory(h);
    }, [connection?.connectionId]);

    React.useEffect(() => {
      fetchHistory();
    }, [fetchHistory, currentChatId]);

    const handleDeleteChat = React.useCallback(
      async (id: string, e: React.MouseEvent) => {
        e.stopPropagation();
        await chatStorage.deleteChat(id);
        await fetchHistory();
        if (id === currentChatId) {
          // Clear the current chat instance's messages in memory
          onClearCurrentChat?.();
          onNewChat();
        }
      },
      [currentChatId, onNewChat, onClearCurrentChat, fetchHistory]
    );

    const handleClearAll = React.useCallback(async () => {
      const connectionId = connection?.connectionId;
      if (!connectionId) {
        return;
      }
      await chatStorage.clearAllForConnection(connectionId);
      setHistory([]);
      // Clear the current chat instance's messages in memory
      onClearCurrentChat?.();
      onNewChat();
    }, [connection?.connectionId, onNewChat, onClearCurrentChat]);

    const handleEditTitle = React.useCallback(
      async (id: string, newTitle: string) => {
        await chatStorage.updateChatTitle(id, newTitle);
        await fetchHistory();
      },
      [fetchHistory]
    );

    const [searchQuery, setSearchQuery] = React.useState("");

    const groupedHistory = React.useMemo(() => {
      const query = searchQuery.trim().toLowerCase();
      const toGroup = query
        ? history.filter((item) => (item.title || "New Conversation").toLowerCase().includes(query))
        : history;

      const groups: { label: string; items: Chat[] }[] = [];
      const map: Record<string, number> = {};

      for (const item of toGroup) {
        const label = getGroupLabel(item.updatedAt);
        if (map[label] === undefined) {
          map[label] = groups.length;
          groups.push({ label, items: [] });
        }
        groups[map[label]].items.push(item);
      }
      return groups;
    }, [history, searchQuery]);

    return (
      <div className="flex flex-col h-[300px]">
        <Command
          className="rounded-sm border-0"
          value={selectedChatId}
          onValueChange={setSelectedChatId}
          shouldFilter={false}
        >
          <CommandInput
            placeholder="Search conversations..."
            className="h-9"
            value={searchQuery}
            onValueChange={setSearchQuery}
          />
          <CommandList className="flex-1 max-h-none">
            <CommandEmpty>No conversations found.</CommandEmpty>
            {groupedHistory.map((group) => (
              <CommandGroup
                className="py-0 px-0 [&_[cmdk-group-heading]]:px-1 [&_[cmdk-group-heading]]:py-0.5"
                key={group.label}
                heading={
                  <span className="text-[10px] text-muted-foreground px-1 py-0">{group.label}</span>
                }
              >
                {group.items.map((item) => (
                  <HistoryItem
                    key={item.chatId}
                    item={item}
                    isSelected={item.chatId === currentChatId}
                    searchQuery={searchQuery}
                    onDelete={handleDeleteChat}
                    onEdit={handleEditTitle}
                    onSelect={() => {
                      if (item.chatId !== currentChatId) {
                        onSelectChat?.(item.chatId);
                      }
                      onClose();
                    }}
                  />
                ))}
              </CommandGroup>
            ))}
          </CommandList>
        </Command>
        <div className="p-1 border-t flex items-center justify-between gap-2 bg-muted/30 shrink-0">
          <Button
            variant="ghost"
            size="sm"
            className="text-xs h-7 flex-1 justify-start gap-2"
            onClick={onNewChat}
          >
            <Plus className="h-3 w-3" />
            New Conversation
          </Button>
          <ClearAllButton onClearAll={handleClearAll} />
        </div>
      </div>
    );
  }
);
