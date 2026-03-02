"use client";

import { ChatUIContext } from "@/components/chat/chat-ui-context";
import {
  SessionManager,
  useSessions,
  type ManagedSession,
} from "@/components/chat/session/session-manager";
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
import { Tree, type TreeDataItem } from "@/components/ui/tree";
import type { Chat } from "@/lib/ai/chat-types";
import "@/lib/number-utils";
import { searchTree } from "@/lib/tree-search";
import { cn } from "@/lib/utils";
import {
  EllipsisVertical,
  FolderClosed,
  Loader2,
  MessageSquareText,
  Pencil,
  Plus,
  RotateCw,
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
      chat: ManagedSession;
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

const getChatTitle = (chat: Pick<Chat, "title">) => chat.title || "New Conversation";

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
          className="h-5 w-5 text-muted-foreground opacity-0 transition-opacity group-hover/tree:opacity-100 focus-visible:opacity-100 data-[state=open]:opacity-100"
          onClick={(e) => e.stopPropagation()}
          onMouseDown={(e) => e.stopPropagation()}
        >
          <EllipsisVertical className="h-3.5 w-3.5" />
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
  history: ManagedSession[],
  onRenameChat: (chat: ManagedSession) => void,
  onDeleteChat: (chat: ManagedSession) => void,
  onDeleteGroup: (label: string, chats: ManagedSession[]) => void
): TreeDataItem[] {
  const groups: Array<{ label: string; chats: ManagedSession[] }> = [];
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
      icon: chat.running ? Loader2 : MessageSquareText,
      iconClassName: chat.running ? "animate-spin" : undefined,
      type: "leaf",
      data: {
        kind: "chat",
        chat,
      } satisfies HistoryNodeData,
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

export const ChatSessionList = React.memo<ChatHistoryListProps>(
  ({ currentChatId, onNewChat, onClose, onSelectChat, className }) => {
    const { connection } = useConnection();
    const history = useSessions(connection?.connectionId);
    const [search, setSearch] = React.useState("");
    const [renameState, setRenameState] = React.useState<RenameState>(null);
    const [deleteState, setDeleteState] = React.useState<DeleteState>(null);
    const [isRefreshing, setIsRefreshing] = React.useState(false);

    const refreshSessions = React.useCallback(async () => {
      if (!connection?.connectionId) {
        return;
      }

      setIsRefreshing(true);
      try {
        await SessionManager.loadSessions(connection.connectionId);
      } finally {
        setIsRefreshing(false);
      }
    }, [connection?.connectionId]);

    React.useEffect(() => {
      void refreshSessions();
    }, [refreshSessions, currentChatId]);

    const handleDeleteChats = React.useCallback(
      async (chatIds: string[]) => {
        await SessionManager.deleteSessions(connection?.connectionId, chatIds);

        if (currentChatId && chatIds.includes(currentChatId)) {
          onNewChat();
          onClose?.();
        }
      },
      [connection?.connectionId, currentChatId, onClose, onNewChat]
    );

    const handleRenameSubmit = React.useCallback(async () => {
      if (!renameState) {
        return;
      }

      const nextTitle = renameState.title.trim();
      if (!nextTitle) {
        return;
      }

      await SessionManager.renameSession(connection?.connectionId, renameState.chatId, nextTitle);

      if (renameState.chatId === currentChatId) {
        ChatUIContext.updateTitle(nextTitle);
      }

      setRenameState(null);
    }, [connection?.connectionId, currentChatId, renameState]);

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
              className={cn("pl-8 rounded-none border-none flex-1 h-9", search ? "pr-24" : "pr-16")}
            />
            {search && (
              <Button
                variant="ghost"
                size="sm"
                className="absolute right-16 top-1/2 -translate-y-1/2 h-6 w-6 p-0"
                onClick={() => setSearch("")}
                title="Clear search"
              >
                <X className="h-4 w-4" />
              </Button>
            )}
            <Button
              variant="ghost"
              size="sm"
              className="absolute right-9 top-1/2 -translate-y-1/2 h-6 w-6 p-0"
              onClick={() => void refreshSessions()}
              title="Refresh sessions"
              disabled={isRefreshing}
            >
              <RotateCw className={cn("h-4 w-4", isRefreshing && "animate-spin")} />
            </Button>
            <Button
              variant="ghost"
              size="sm"
              className="absolute right-2 top-1/2 -translate-y-1/2 h-6 w-6 p-0"
              onClick={onNewChat}
              title="New session"
            >
              <Plus className="h-4 w-4" />
            </Button>
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
