import type { Chat, Message } from "@/lib/ai/chat-types";
import type { LocalStorage } from "@/lib/storage/local-storage-provider";
import { StorageManager } from "@/lib/storage/storage-provider-manager";
import type { SessionRepository } from "./session-repository";

/**
 * LocalStorage-based implementation of SessionRepository for simplicity
 *
 * Note: localStorage has a quota limit (typically 5-10 MB per origin).
 * This implementation includes automatic cleanup of old chats when quota is exceeded.
 */
export class LocalSessionRepository implements SessionRepository {
  private get chatsStorage(): LocalStorage {
    return StorageManager.getInstance()
      .getStorageProvider()
      .subStorage("chats")
      .withCompression(true);
  }

  private get messagesStorage(): LocalStorage {
    return StorageManager.getInstance()
      .getStorageProvider()
      .subStorage("messages")
      .withCompression(true);
  }

  private async removeOldestChats(count: number = 5, excludeChatId?: string): Promise<number> {
    try {
      const chats = await this.getSessions();
      if (chats.length === 0) {
        return 0;
      }

      const sortedChats = chats.sort((a, b) => a.updatedAt.getTime() - b.updatedAt.getTime());
      const chatsToConsider = excludeChatId
        ? sortedChats.filter((chat) => chat.chatId !== excludeChatId)
        : sortedChats;
      const chatsToDelete = chatsToConsider.slice(0, Math.min(count, chatsToConsider.length));
      if (chatsToDelete.length === 0) {
        return 0;
      }

      const allChats = this.chatsStorage.getAsJSON<Record<string, Chat>>(() => ({}));

      for (const chat of chatsToDelete) {
        delete allChats[chat.chatId];
        this.messagesStorage.removeChild(chat.chatId);
      }

      this.chatsStorage.setJSON(allChats);
      return chatsToDelete.length;
    } catch (error) {
      console.error("Error removing oldest chats:", error);
      return 0;
    }
  }

  private async cleanupOldMessages(chatId: string, count: number = 100): Promise<number> {
    try {
      const messages = await this.getMessages(chatId);
      if (messages.length === 0) {
        return 0;
      }

      const messagesToDelete = messages.slice(0, Math.min(count, messages.length));
      if (messagesToDelete.length === 0) {
        return 0;
      }

      const messagesMap = this.getMessagesForChat(chatId);

      for (const message of messagesToDelete) {
        delete messagesMap[message.id];
      }

      try {
        this.messagesStorage.setChildJSON(chatId, messagesMap);
        return messagesToDelete.length;
      } catch (saveError) {
        console.warn(`Failed to save pruned messages for chat ${chatId}:`, saveError);
        return 0;
      }
    } catch (error) {
      console.error(`Error cleaning up old messages for chat ${chatId}:`, error);
      return 0;
    }
  }

  private async safeSave(
    key: string | null,
    saveFn: () => void,
    currentChatId?: string,
    hasPrunedMessages = false
  ): Promise<void> {
    const chatIdFromKey =
      key && key.startsWith("messages:") ? key.replace("messages:", "") : undefined;
    const currentChatIdToExclude = currentChatId || chatIdFromKey;

    for (;;) {
      try {
        saveFn();
        return;
      } catch (error) {
        if (error instanceof DOMException && error.name === "QuotaExceededError") {
          console.warn("localStorage quota exceeded, cleaning up old data...");

          const allChats = await this.getSessions();
          const remainingChats = currentChatIdToExclude
            ? allChats.filter((chat) => chat.chatId !== currentChatIdToExclude)
            : allChats;

          if (remainingChats.length === 0 && currentChatIdToExclude && !hasPrunedMessages) {
            for (;;) {
              const removedMessageCount = await this.cleanupOldMessages(
                currentChatIdToExclude,
                100
              );
              if (removedMessageCount === 0) {
                break;
              }
            }
            continue;
          }

          const removedCount = await this.removeOldestChats(5, currentChatIdToExclude);

          if (removedCount === 0) {
            if (currentChatIdToExclude && !hasPrunedMessages) {
              for (;;) {
                const removedMessageCount = await this.cleanupOldMessages(
                  currentChatIdToExclude,
                  100
                );
                if (removedMessageCount === 0) {
                  break;
                }
              }
              continue;
            }

            throw new Error(
              "Storage quota exceeded. Please delete some old chats manually or clear your browser's localStorage."
            );
          }

          continue;
        }

        throw error;
      }
    }
  }

  private getMessagesForChat(chatId: string): Record<string, Message> {
    return this.messagesStorage.getChildAsJSON<Record<string, Message>>(chatId, () => ({}));
  }

  private compareMessages(a: Message, b: Message): number {
    const aOrder = a.sequence ?? undefined;
    const bOrder = b.sequence ?? undefined;
    if (aOrder != null && bOrder != null) {
      return aOrder - bOrder;
    }
    const timeCmp = new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
    if (timeCmp !== 0) return timeCmp;
    return a.id.localeCompare(b.id);
  }

  private async saveMessagesForChat(
    chatId: string,
    messages: Record<string, Message>,
    hasPrunedMessages = false
  ): Promise<void> {
    await this.safeSave(
      `messages:${chatId}`,
      () => this.messagesStorage.setChildJSON(chatId, messages),
      chatId,
      hasPrunedMessages
    );
  }

  async getSession(id: string): Promise<Chat | null> {
    const chats = this.chatsStorage.getAsJSON<Record<string, Chat>>(() => ({}));
    const chat = chats[id];

    if (!chat) return null;

    return {
      ...chat,
      createdAt: new Date(chat.createdAt),
      updatedAt: new Date(chat.updatedAt),
    };
  }

  async saveSession(session: Chat): Promise<void> {
    const chats = this.chatsStorage.getAsJSON<Record<string, Chat>>(() => ({}));

    chats[session.chatId] = {
      ...session,
    };

    await this.safeSave(null, () => this.chatsStorage.setJSON(chats), session.chatId);
  }

  async updateSessionTitle(id: string, title: string): Promise<void> {
    const chats = this.chatsStorage.getAsJSON<Record<string, Chat>>(() => ({}));
    if (chats[id]) {
      chats[id] = {
        ...chats[id],
        title,
        updatedAt: new Date(),
      };
      await this.safeSave(null, () => this.chatsStorage.setJSON(chats), id);
    }
  }

  async renameSession(chatId: string, title: string): Promise<void> {
    await this.updateSessionTitle(chatId, title);
  }

  async deleteSession(id: string): Promise<void> {
    const chats = this.chatsStorage.getAsJSON<Record<string, Chat>>(() => ({}));
    delete chats[id];

    await this.safeSave(null, () => this.chatsStorage.setJSON(chats));
    await this.clearMessages(id);
  }

  private async getSessions(): Promise<Chat[]> {
    const chats = this.chatsStorage.getAsJSON<Record<string, Chat>>(() => ({}));

    return Object.values(chats)
      .map((chat) => ({
        ...chat,
        createdAt: new Date(chat.createdAt),
        updatedAt: new Date(chat.updatedAt),
      }))
      .sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime());
  }

  async getSessionsForConnection(connectionId: string): Promise<Chat[]> {
    const allChats = await this.getSessions();
    return allChats.filter((chat) => chat.databaseId === connectionId);
  }

  async getMessages(chatId: string): Promise<Message[]> {
    const messagesMap = this.getMessagesForChat(chatId);
    const messages = Object.values(messagesMap).map((message) => ({
      ...message,
      createdAt: new Date(message.createdAt),
      updatedAt: new Date(message.updatedAt),
    }));

    const needsBackfill = messages.some((message) => message.sequence == null);
    if (needsBackfill && messages.length > 0) {
      const sorted = [...messages].sort((a, b) => this.compareMessages(a, b));
      for (let index = 0; index < sorted.length; index++) {
        const sequence = index + 1;
        sorted[index].sequence = sequence;
        messagesMap[sorted[index].id] = sorted[index];
      }
      await this.saveMessagesForChat(chatId, messagesMap);
    }

    return messages.sort((a, b) => this.compareMessages(a, b));
  }

  async saveMessage(chatId: string, message: Message): Promise<void> {
    const messagesMap = this.getMessagesForChat(chatId);
    let sequence = messagesMap[message.id]?.sequence;

    if (sequence === undefined) {
      const messages = Object.values(messagesMap);
      const maxSequence =
        messages.length > 0
          ? Math.max(...messages.map((existingMessage) => existingMessage.sequence ?? 0))
          : 0;
      sequence = maxSequence + 1;
    }

    const messageToSave: Message = {
      ...message,
      sequence,
      createdAt: message.createdAt || new Date(),
      updatedAt: new Date(),
    };

    messagesMap[message.id] = messageToSave;
    await this.saveMessagesForChat(chatId, messagesMap);

    const session = await this.getSession(chatId);
    if (session) {
      await this.saveSession({ ...session, updatedAt: new Date() });
    }
  }

  async saveMessages(chatId: string, messagesToSave: Message[]): Promise<void> {
    if (messagesToSave.length === 0) return;

    const messagesMap = this.getMessagesForChat(chatId);
    const messages = Object.values(messagesMap);
    let maxSequence =
      messages.length > 0 ? Math.max(...messages.map((message) => message.sequence ?? 0)) : 0;

    for (const message of messagesToSave) {
      let sequence = messagesMap[message.id]?.sequence;
      if (sequence === undefined) {
        maxSequence += 1;
        sequence = maxSequence;
      }

      const messageToSave: Message = {
        ...message,
        sequence,
        createdAt: message.createdAt || new Date(),
        updatedAt: new Date(),
      };
      messagesMap[message.id] = messageToSave;
    }

    await this.saveMessagesForChat(chatId, messagesMap);

    const session = await this.getSession(chatId);
    if (session) {
      await this.saveSession({ ...session, updatedAt: new Date() });
    }
  }

  private async clearMessages(chatId: string): Promise<void> {
    this.messagesStorage.removeChild(chatId);
  }
}

export const localSessionRepository: SessionRepository = new LocalSessionRepository();
