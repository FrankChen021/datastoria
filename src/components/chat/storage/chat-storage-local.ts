import type { Chat, Message } from "../chat-message-types";
import type { ChatStorage } from "./chat-storage";

/**
 * LocalStorage-based implementation of ChatStorage for simplicity
 */
export class LocalStorageChatStorage implements ChatStorage {
  private readonly CHATS_KEY = "datastoria:chats";
  private readonly MESSAGES_PREFIX = "datastoria:messages:";

  /**
   * Get the localStorage key for a specific chat's messages
   */
  private getMessagesKey(chatId: string): string {
    return `${this.MESSAGES_PREFIX}${chatId}`;
  }

  /**
   * Get messages for a specific chat as a Map (object) keyed by message ID
   * This allows O(1) lookups instead of O(n) array searches
   */
  private getMessagesForChat(chatId: string): Record<string, Message> {
    const key = this.getMessagesKey(chatId);
    const data = localStorage.getItem(key);
    if (!data) return {};

    try {
      const parsed = JSON.parse(data);
      return parsed as Record<string, Message>;
    } catch {
      return {};
    }
  }

  /**
   * Save messages for a specific chat as a Map (object) keyed by message ID
   */
  private saveMessagesForChat(chatId: string, messages: Record<string, Message>): void {
    const key = this.getMessagesKey(chatId);
    localStorage.setItem(key, JSON.stringify(messages));
  }

  // Chat operations
  async getChat(id: string): Promise<Chat | null> {
    const data = localStorage.getItem(this.CHATS_KEY);
    if (!data) return null;

    const chats = JSON.parse(data) as Record<string, Chat>;
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
    const data = localStorage.getItem(this.CHATS_KEY);
    const chats = data ? JSON.parse(data) : {};

    chats[chat.chatId] = {
      ...chat,
      updatedAt: new Date(),
    };

    localStorage.setItem(this.CHATS_KEY, JSON.stringify(chats));
  }

  async updateChatTitle(id: string, title: string): Promise<void> {
    const chatData = localStorage.getItem(this.CHATS_KEY);
    if (!chatData) return;

    const chats = JSON.parse(chatData) as Record<string, Chat>;
    if (chats[id]) {
      chats[id] = {
        ...chats[id],
        title,
        updatedAt: new Date(),
      };
      localStorage.setItem(this.CHATS_KEY, JSON.stringify(chats));
    }
  }

  async deleteChat(id: string): Promise<void> {
    // Delete chat
    const chatData = localStorage.getItem(this.CHATS_KEY);
    if (chatData) {
      const chats = JSON.parse(chatData) as Record<string, Chat>;
      delete chats[id];
      localStorage.setItem(this.CHATS_KEY, JSON.stringify(chats));
    }

    // Delete all messages for this chat
    await this.clearMessages(id);
  }

  async getCharts(): Promise<Chat[]> {
    const data = localStorage.getItem(this.CHATS_KEY);
    if (!data) return [];

    const chats = JSON.parse(data) as Record<string, Chat>;

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

    // Convert object to array, parse dates, and sort by message id.
    // Message ids are UUIDv7, which are lexicographically sortable in chronological order.
    return (
      Object.values(messagesMap)
        .map((message) => ({
          ...message,
          createdAt: new Date(message.createdAt),
          updatedAt: new Date(message.updatedAt),
        }))
        // Sort by UUIDv7 id to ensure stable chronological ordering
        .sort((a, b) => a.id.localeCompare(b.id))
    );
  }

  async saveMessage(message: Message): Promise<void> {
    const chatId = message.chatId;
    const messagesMap = this.getMessagesForChat(chatId);

    const messageToSave: Message = {
      ...message,
      createdAt: message.createdAt || new Date(),
      updatedAt: new Date(),
    };

    // O(1) update or add using object property access
    messagesMap[message.id] = messageToSave;

    this.saveMessagesForChat(chatId, messagesMap);
  }

  /**
   * Save multiple messages in batch
   * Uses O(1) object property access for efficient updates
   */
  async saveMessages(chatId: string, messagesToSave: Message[]): Promise<void> {
    const messagesMap = this.getMessagesForChat(chatId);

    // O(1) updates for each message using object property access
    for (const message of messagesToSave) {
      const messageToSave: Message = {
        ...message,
        createdAt: message.createdAt || new Date(),
        updatedAt: new Date(),
      };
      messagesMap[message.id] = messageToSave;
    }

    this.saveMessagesForChat(chatId, messagesMap);
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
          localStorage.removeItem(this.getMessagesKey(chat.chatId));
        } else {
          this.saveMessagesForChat(chat.chatId, messagesMap);
        }
        return;
      }
    }
  }

  async clearMessages(chatId: string): Promise<void> {
    localStorage.removeItem(this.getMessagesKey(chatId));
  }

  async clearAll(): Promise<void> {
    // Remove chats
    localStorage.removeItem(this.CHATS_KEY);

    // Remove all per-chat message keys
    const keysToRemove: string[] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key?.startsWith(this.MESSAGES_PREFIX)) {
        keysToRemove.push(key);
      }
    }
    for (const key of keysToRemove) {
      localStorage.removeItem(key);
    }
  }
}
