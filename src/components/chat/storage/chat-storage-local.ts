import type { Chat, Message } from "@/lib/ai/chat-types";
import type { LocalStorage } from "@/lib/storage/local-storage-provider";
import { StorageManager } from "@/lib/storage/storage-provider-manager";
import { chatActionStorage } from "./chat-action-storage";
import type { ChatStorage } from "./chat-storage";

/**
 * LocalStorage-based implementation of ChatStorage for simplicity
 *
 * Note: localStorage has a quota limit (typically 5-10 MB per origin).
 * This implementation includes automatic cleanup of old chats when quota is exceeded.
 */
export class ChatStorageLocal implements ChatStorage {
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

  /**
   * Remove the 5 oldest chats to free up storage space
   * Returns the number of chats removed
   * @param count - Number of chats to remove (default: 5)
   * @param excludeChatId - Chat ID to exclude from removal (e.g., the current chat being saved)
   */
  private async removeOldestChats(count: number = 5, excludeChatId?: string): Promise<number> {
    try {
      const chats = await this.getCharts();
      if (chats.length === 0) {
        return 0;
      }

      // Sort by updatedAt (oldest first)
      const sortedChats = chats.sort((a, b) => a.updatedAt.getTime() - b.updatedAt.getTime());

      // Filter out the excluded chat if provided
      const chatsToConsider = excludeChatId
        ? sortedChats.filter((chat) => chat.chatId !== excludeChatId)
        : sortedChats;

      // Remove up to 'count' oldest chats (excluding the current one)
      const chatsToDelete = chatsToConsider.slice(0, Math.min(count, chatsToConsider.length));
      if (chatsToDelete.length === 0) {
        return 0;
      }

      // Get chats object from storage
      const allChats = this.chatsStorage.getAsJSON<Record<string, Chat>>(() => ({}));

      // Delete all target chats from the object in batch
      for (const chat of chatsToDelete) {
        chatActionStorage.clearHiddenActionsForChat(chat.chatId);
        delete allChats[chat.chatId];
        // Clear messages for each chat
        this.messagesStorage.removeChild(chat.chatId);
      }

      this.chatsStorage.setJSON(allChats);

      return chatsToDelete.length;
    } catch (error) {
      console.error("Error removing oldest chats:", error);
      return 0;
    }
  }

  /**
   * Remove the oldest messages from a chat to free up storage space
   * Returns the number of messages removed
   * @param chatId - Chat ID to clean up messages for
   * @param count - Number of messages to remove (default: 100)
   */
  private async cleanupOldMessages(chatId: string, count: number = 100): Promise<number> {
    try {
      const messages = await this.getMessages(chatId);

      if (messages.length === 0) {
        return 0;
      }

      // getMessages returns sorted (order-based or legacy createdAt+id)
      const messagesToDelete = messages.slice(0, Math.min(count, messages.length));

      if (messagesToDelete.length === 0) {
        return 0;
      }

      // Get messages object from storage
      const messagesMap = this.getMessagesForChat(chatId);

      // Delete all target messages from the object in batch
      for (const message of messagesToDelete) {
        delete messagesMap[message.id];
      }

      // Save directly without going through safeSave to avoid nested recursion
      // This is safe because cleanupOldMessages is only called from within safeSave's quota error handler
      try {
        this.messagesStorage.setChildJSON(chatId, messagesMap);
        return messagesToDelete.length;
      } catch (saveError) {
        // If save fails (e.g., still quota error), return 0 to indicate no messages were removed
        // The outer safeSave loop will handle retrying
        console.warn(`Failed to save pruned messages for chat ${chatId}:`, saveError);
        return 0;
      }
    } catch (error) {
      console.error(`Error cleaning up old messages for chat ${chatId}:`, error);
      return 0;
    }
  }

  /**
   * Safely save data to localStorage with quota checking and cleanup
   * Uses a loop to retry after removing old chats until save succeeds or no more chats to remove
   * @param key - Storage key (e.g., "messages:chatId" for messages, null for chats)
   * @param saveFn - Function to execute the save operation
   * @param currentChatId - Optional chat ID that is being saved (to exclude from deletion)
   * @param hasPrunedMessages - Internal flag to prevent infinite recursion when pruning messages
   */
  private async safeSave(
    key: string | null,
    saveFn: () => void,
    currentChatId?: string,
    hasPrunedMessages = false
  ): Promise<void> {
    // Extract chatId from key if it's a message save
    const chatIdFromKey =
      key && key.startsWith("messages:") ? key.replace("messages:", "") : undefined;
    const currentChatIdToExclude = currentChatId || chatIdFromKey;

    // Loop until save succeeds or no more chats to remove
    for (;;) {
      try {
        // Try to save
        saveFn();
        // Success, exit loop
        return;
      } catch (error) {
        // If quota exceeded, try cleanup and retry
        if (error instanceof DOMException && error.name === "QuotaExceededError") {
          console.warn("localStorage quota exceeded, cleaning up old data...");

          // Check how many chats we have
          const allChats = await this.getCharts();
          const remainingChats = currentChatIdToExclude
            ? allChats.filter((chat) => chat.chatId !== currentChatIdToExclude)
            : allChats;

          // If we only have the current chat (or no chats), try pruning messages instead
          if (remainingChats.length === 0 && currentChatIdToExclude && !hasPrunedMessages) {
            // Only one chat left (the current one), prune old messages
            // Loop until no more messages can be removed
            for (;;) {
              const removedMessageCount = await this.cleanupOldMessages(
                currentChatIdToExclude,
                100
              );
              if (removedMessageCount === 0) {
                // No more messages to remove, break and retry save
                break;
              }
              // Continue removing messages
            }
            // Retry save after pruning messages (mark that we've pruned)
            // Note: cleanupOldMessages will call saveMessagesForChat which calls safeSave again
            // but with hasPrunedMessages=true to prevent infinite recursion
            continue;
          }

          // Remove 5 oldest chats (excluding the current one)
          const removedCount = await this.removeOldestChats(5, currentChatIdToExclude);

          // If no chats were removed, we can't free up more space
          if (removedCount === 0) {
            // If we have the current chat and haven't pruned yet, try pruning its messages as last resort
            if (currentChatIdToExclude && !hasPrunedMessages) {
              // Loop until no more messages can be removed
              for (;;) {
                const removedMessageCount = await this.cleanupOldMessages(
                  currentChatIdToExclude,
                  100
                );
                if (removedMessageCount === 0) {
                  // No more messages to remove, break and retry save
                  break;
                }
                // Continue removing messages
              }
              // Retry save after pruning messages
              continue;
            }
            throw new Error(
              "Storage quota exceeded. Please delete some old chats manually or clear your browser's localStorage."
            );
          }

          // Continue loop to retry save
          continue;
        } else {
          // Non-quota error, throw immediately
          throw error;
        }
      }
    }
  }

  /**
   * Get messages for a specific chat as a Map (object) keyed by message ID
   * This allows O(1) lookups instead of O(n) array searches
   */
  private getMessagesForChat(chatId: string): Record<string, Message> {
    return this.messagesStorage.getChildAsJSON<Record<string, Message>>(chatId, () => ({}));
  }

  /**
   * Compare two messages for sorting. Uses order when both have it (immune to clock skew).
   * Falls back to createdAt then id for legacy messages without order.
   */
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

  /**
   * Save messages for a specific chat as a Map (object) keyed by message ID
   * @param hasPrunedMessages - Internal flag to prevent infinite recursion when pruning messages
   */
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

  // Chat operations
  async getChat(id: string): Promise<Chat | null> {
    const chats = this.chatsStorage.getAsJSON<Record<string, Chat>>(() => ({}));
    const chat = chats[id];

    if (!chat) return null;

    // Parse dates back from JSON
    return {
      ...chat,
      createdAt: new Date(chat.createdAt),
      updatedAt: new Date(chat.updatedAt),
    };
  }

  async saveChat(chat: Chat): Promise<void> {
    const chats = this.chatsStorage.getAsJSON<Record<string, Chat>>(() => ({}));

    chats[chat.chatId] = {
      ...chat,
      updatedAt: new Date(),
    };

    await this.safeSave(null, () => this.chatsStorage.setJSON(chats), chat.chatId);
  }

  async updateChatTitle(id: string, title: string): Promise<void> {
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

  async deleteChat(id: string): Promise<void> {
    chatActionStorage.clearHiddenActionsForChat(id);

    // Delete chat
    const chats = this.chatsStorage.getAsJSON<Record<string, Chat>>(() => ({}));
    delete chats[id];

    await this.safeSave(null, () => this.chatsStorage.setJSON(chats));

    // Delete all messages for this chat
    await this.clearMessages(id);
  }

  async getCharts(): Promise<Chat[]> {
    const chats = this.chatsStorage.getAsJSON<Record<string, Chat>>(() => ({}));

    return Object.values(chats)
      .map((chat) => ({
        ...chat,
        createdAt: new Date(chat.createdAt),
        updatedAt: new Date(chat.updatedAt),
      }))
      .sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime());
  }

  async getLatestChatId(): Promise<string | undefined> {
    const chats = await this.getCharts();
    return chats[0]?.chatId;
  }

  async getChatsForConnection(connectionId: string): Promise<Chat[]> {
    const allChats = await this.getCharts();
    return allChats.filter((chat) => chat.databaseId === connectionId);
  }

  async getLatestChatIdForConnection(connectionId: string): Promise<Chat | undefined> {
    const chats = await this.getChatsForConnection(connectionId);
    return chats.length > 0 ? chats[0] : undefined;
  }

  // Message operations
  async getMessages(chatId: string): Promise<Message[]> {
    const messagesMap = this.getMessagesForChat(chatId);
    const messages = Object.values(messagesMap).map((message) => ({
      ...message,
      createdAt: new Date(message.createdAt),
      updatedAt: new Date(message.updatedAt),
    }));

    // Backfill sequence on legacy messages when loading (migration-on-read)
    const needsBackfill = messages.some((m) => m.sequence == null);
    if (needsBackfill && messages.length > 0) {
      const sorted = [...messages].sort((a, b) => this.compareMessages(a, b));
      for (let i = 0; i < sorted.length; i++) {
        const sequence = i + 1;
        sorted[i].sequence = sequence;
        messagesMap[sorted[i].id] = sorted[i];
      }
      await this.saveMessagesForChat(chatId, messagesMap);
    }

    // Sort and return (uses sequence when present, else createdAt+id for legacy)
    return messages.sort((a, b) => this.compareMessages(a, b));
  }

  async saveMessage(chatId: string, message: Message): Promise<void> {
    const messagesMap = this.getMessagesForChat(chatId);

    // Use existing sequence if available to preserve order on updates
    let sequence = messagesMap[message.id]?.sequence;

    // If new message, assign next sequence
    if (sequence === undefined) {
      const messages = Object.values(messagesMap);
      const maxSequence =
        messages.length > 0 ? Math.max(...messages.map((m) => m.sequence ?? 0)) : 0;
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

    const chat = await this.getChat(chatId);
    if (chat) {
      await this.saveChat({ ...chat, updatedAt: new Date() });
    }
  }

  /**
   * Save multiple messages in batch
   * Assigns sequential sequence to each message.
   */
  async saveMessages(chatId: string, messagesToSave: Message[]): Promise<void> {
    if (messagesToSave.length === 0) return;

    const messagesMap = this.getMessagesForChat(chatId);
    const messages = Object.values(messagesMap);

    // Next sequence: max(sequence) + 1, or 1 if empty
    let maxSequence = messages.length > 0 ? Math.max(...messages.map((m) => m.sequence ?? 0)) : 0;

    for (const message of messagesToSave) {
      // Use existing sequence if available to preserve order on updates
      let sequence = messagesMap[message.id]?.sequence;

      // If new message, assign next sequence
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

    const chat = await this.getChat(chatId);
    if (chat) {
      await this.saveChat({ ...chat, updatedAt: new Date() });
    }
  }

  async deleteMessage(id: string): Promise<void> {
    // We need to find which chat this message belongs to
    // Since we don't have chatId, we need to search through all chats
    const chats = await this.getCharts();

    for (const chat of chats) {
      const messagesMap = this.getMessagesForChat(chat.chatId);
      if (id in messagesMap) {
        // O(1) delete using object property deletion
        delete messagesMap[id];
        if (Object.keys(messagesMap).length === 0) {
          // Remove the key if no messages left
          this.messagesStorage.removeChild(chat.chatId);
        } else {
          await this.saveMessagesForChat(chat.chatId, messagesMap);
        }
        return;
      }
    }
  }

  async clearMessages(chatId: string): Promise<void> {
    this.messagesStorage.removeChild(chatId);
    chatActionStorage.clearHiddenActionsForChat(chatId);
  }

  async clearAll(): Promise<void> {
    // Remove chats
    this.chatsStorage.remove();

    // Remove all per-chat message keys
    this.messagesStorage.clear();

    chatActionStorage.clearAllHiddenActions();
  }

  async clearAllForConnection(connectionId: string): Promise<void> {
    // Get all chats for this connection
    const chatsForConnection = await this.getChatsForConnection(connectionId);

    if (chatsForConnection.length === 0) {
      return;
    }

    // Get all chats from storage
    const allChats = this.chatsStorage.getAsJSON<Record<string, Chat>>(() => ({}));

    // Remove chats for this connection in batch
    for (const chat of chatsForConnection) {
      chatActionStorage.clearHiddenActionsForChat(chat.chatId);
      delete allChats[chat.chatId];
      // Remove messages for this chat
      this.messagesStorage.removeChild(chat.chatId);
    }

    // Save updated chats in one operation
    await this.safeSave(null, () => this.chatsStorage.setJSON(allChats));
  }
}
