"use client";

import { ChatUIContext } from "@/components/chat/chat-ui-context";
import { chatStorage } from "@/components/chat/storage/chat-storage";
import { useConnection } from "@/components/connection/connection-context";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Tree, type TreeDataItem } from "@/components/ui/tree";
import type { Chat } from "@/lib/ai/chat-types";
import "@/lib/number-utils";
import { searchTree } from "@/lib/tree-search";
import { cn } from "@/lib/utils";
import * as PopoverPrimitive from "@radix-ui/react-popover";
import {
  AlertCircle,
  Ellipsis,
  Eraser,
  FolderClosed,
  MessageSquareText,
  Pencil,
  Plus,
  Search,
  Trash2,
  X,
} from "lucide-react";
import * as React from "react";

interface ChatHistoryListProps {
  currentChatId: string;
  onNewChat: () => void;
  onClose?: () => void;
  onSelectChat?: (id: string) => void;
  className?: string;
}

type HistoryNodeData =
  | {
      kind: "group";
      label: string;
      chatIds: string[];
    }
  | {
      kind: "chat";
      chat: Chat;
    };

type RenameState = {
  chatId: string;
  title: string;
} | null;

type DeleteState = {
  chatIds: string[];
  title: string;
  description: string;
  confirmLabel: string;
} | null;

const chatNodeId = (chatId: string) => `chat:${chatId}`;
const groupNodeId = (label: string) => `group:${label}`;

const getChatTitle = (chat: Chat) => chat.title || "New Conversation";

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

function HistoryNodeMenu({
  actions,
}: {
  actions: Array<{
    label: string;
    icon: React.ReactNode;
    destructive?: boolean;
    onSelect: () => void;
  }>;
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="h-5 w-5 text-muted-foreground"
          onClick={(e) => e.stopPropagation()}
          onMouseDown={(e) => e.stopPropagation()}
        >
          <Ellipsis className="h-3.5 w-3.5" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" onClick={(e) => e.stopPropagation()}>
        {actions.map((action) => (
          <DropdownMenuItem
            key={action.label}
            className={cn(action.destructive && "text-destructive focus:text-destructive")}
            onClick={(e) => {
              e.stopPropagation();
              action.onSelect();
            }}
          >
            {action.icon}
            {action.label}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function buildHistoryTree(
  history: Chat[],
  onRenameChat: (chat: Chat) => void,
  onDeleteChat: (chat: Chat) => void,
  onDeleteGroup: (label: string, chats: Chat[]) => void
): TreeDataItem[] {
  const groups: Array<{ label: string; chats: Chat[] }> = [];
  const groupIndex = new Map<string, number>();

  for (const chat of history) {
    const label = getGroupLabel(chat.updatedAt);
    const existingIndex = groupIndex.get(label);
    if (existingIndex === undefined) {
      groupIndex.set(label, groups.length);
      groups.push({ label, chats: [chat] });
      continue;
    }
    groups[existingIndex]!.chats.push(chat);
  }

  return groups.map(({ label, chats }) => ({
    id: groupNodeId(label),
    labelContent: label,
    search: label.toLowerCase(),
    type: "folder",
    data: {
      kind: "group",
      label,
      chatIds: chats.map((chat) => chat.chatId),
    } satisfies HistoryNodeData,
    tag: () => (
      <HistoryNodeMenu
        actions={[
          {
            label: "Delete folder",
            icon: <Trash2 className="h-4 w-4" />,
            destructive: true,
            onSelect: () => onDeleteGroup(label, chats),
          },
        ]}
      />
    ),
    children: chats.map((chat) => ({
      id: chatNodeId(chat.chatId),
      labelContent: getChatTitle(chat),
      search: getChatTitle(chat).toLowerCase(),
      type: "leaf",
      data: {
        kind: "chat",
        chat,
      } satisfies HistoryNodeData,
      labelTooltip: getChatTitle(chat),
      tag: () => (
        <HistoryNodeMenu
          actions={[
            {
              label: "Rename",
              icon: <Pencil className="h-4 w-4" />,
              onSelect: () => onRenameChat(chat),
            },
            {
              label: "Delete",
              icon: <Trash2 className="h-4 w-4" />,
              destructive: true,
              onSelect: () => onDeleteChat(chat),
            },
          ]}
        />
      ),
    })),
  }));
}

export const ChatHistoryList = React.memo<ChatHistoryListProps>(
  ({ currentChatId, onNewChat, onClose, onSelectChat, className }) => {
    const { connection } = useConnection();
    const [history, setHistory] = React.useState<Chat[]>([]);
    const [search, setSearch] = React.useState("");
    const [renameState, setRenameState] = React.useState<RenameState>(null);
    const [deleteState, setDeleteState] = React.useState<DeleteState>(null);

    const fetchHistory = React.useCallback(async () => {
      const connectionId = connection?.connectionId;
      if (!connectionId) {
        setHistory([]);
        return;
      }

      const chats = await chatStorage.getChatsForConnection(connectionId);
      setHistory(chats);
    }, [connection?.connectionId]);

    React.useEffect(() => {
      void fetchHistory();
    }, [fetchHistory, currentChatId]);

    const handleDeleteChats = React.useCallback(
      async (chatIds: string[]) => {
        await Promise.all(chatIds.map((chatId) => chatStorage.deleteChat(chatId)));
        await fetchHistory();

        if (currentChatId && chatIds.includes(currentChatId)) {
          onNewChat();
          onClose?.();
        }
      },
      [currentChatId, fetchHistory, onClose, onNewChat]
    );

    const handleClearAll = React.useCallback(async () => {
      const connectionId = connection?.connectionId;
      if (!connectionId) {
        return;
      }

      await chatStorage.clearAllForConnection(connectionId);
      setHistory([]);
      onNewChat();
      onClose?.();
    }, [connection?.connectionId, onClose, onNewChat]);

    const handleRenameSubmit = React.useCallback(async () => {
      if (!renameState) {
        return;
      }

      const nextTitle = renameState.title.trim();
      if (!nextTitle) {
        return;
      }

      await chatStorage.updateChatTitle(renameState.chatId, nextTitle);
      await fetchHistory();

      if (renameState.chatId === currentChatId) {
        ChatUIContext.updateTitle(nextTitle);
      }

      setRenameState(null);
    }, [currentChatId, fetchHistory, renameState]);

    const treeData = React.useMemo(
      () =>
        buildHistoryTree(
          history,
          (chat) =>
            setRenameState({
              chatId: chat.chatId,
              title: getChatTitle(chat),
            }),
          (chat) =>
            setDeleteState({
              chatIds: [chat.chatId],
              title: "Delete conversation",
              description: `Delete "${getChatTitle(chat)}"? This action cannot be reverted.`,
              confirmLabel: "Delete",
            }),
          (label, chats) =>
            setDeleteState({
              chatIds: chats.map((chat) => chat.chatId),
              title: "Delete folder",
              description: `Delete all ${chats.length} conversations in "${label}"? This action cannot be reverted.`,
              confirmLabel: "Delete folder",
            })
        ),
      [history]
    );

    const hasVisibleTreeData = React.useMemo(() => {
      if (search.length === 0) {
        return treeData.length > 0;
      }

      return searchTree(treeData, search.toLowerCase(), { pathSeparator: "/" }).length > 0;
    }, [search, treeData]);

    return (
      <>
        <div className={cn("flex flex-col h-full w-full", className)}>
          <div className="relative border-b-2 flex items-center h-9">
            <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search conversations"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className={cn("pl-8 pr-8 rounded-none border-none flex-1 h-9")}
            />
            {search && (
              <Button
                variant="ghost"
                size="sm"
                className="absolute right-1 h-6 w-6 shrink-0"
                onClick={() => setSearch("")}
                title="Clear search"
              >
                <X className="h-4 w-4" />
              </Button>
            )}
          </div>

          <div className="flex-1 min-h-0 overflow-hidden">
            {hasVisibleTreeData ? (
              <Tree
                data={treeData}
                search={search}
                selectedItemId={currentChatId ? chatNodeId(currentChatId) : undefined}
                onSelectChange={(item) => {
                  const data = item?.data as HistoryNodeData | undefined;
                  if (!data || data.kind !== "chat") {
                    return;
                  }

                  if (data.chat.chatId !== currentChatId) {
                    onSelectChat?.(data.chat.chatId);
                  }
                  onClose?.();
                }}
                className="h-full"
                folderIcon={FolderClosed}
                itemIcon={MessageSquareText}
                showChildCount={true}
                expandAll
                pathSeparator="/"
                rowHeight={30}
              />
            ) : (
              <div className="h-full flex items-center justify-center px-4 text-sm text-muted-foreground">
                No conversations found.
              </div>
            )}
          </div>

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

        <Dialog open={renameState !== null} onOpenChange={(open) => !open && setRenameState(null)}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Rename conversation</DialogTitle>
              <DialogDescription>Update the session title shown in chat history.</DialogDescription>
            </DialogHeader>
            <Input
              value={renameState?.title ?? ""}
              onChange={(e) =>
                setRenameState((current) =>
                  current
                    ? {
                        ...current,
                        title: e.target.value,
                      }
                    : current
                )
              }
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  void handleRenameSubmit();
                }
              }}
              autoFocus
            />
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setRenameState(null)}>
                Cancel
              </Button>
              <Button type="button" onClick={() => void handleRenameSubmit()}>
                Save
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        <Dialog open={deleteState !== null} onOpenChange={(open) => !open && setDeleteState(null)}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>{deleteState?.title}</DialogTitle>
              <DialogDescription>{deleteState?.description}</DialogDescription>
            </DialogHeader>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setDeleteState(null)}>
                Cancel
              </Button>
              <Button
                type="button"
                variant="destructive"
                onClick={async () => {
                  if (!deleteState) {
                    return;
                  }

                  await handleDeleteChats(deleteState.chatIds);
                  setDeleteState(null);
                }}
              >
                {deleteState?.confirmLabel}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </>
    );
  }
);
