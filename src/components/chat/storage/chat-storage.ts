import type { Chat, Message } from "@/components/chat/chat-message-types";
import { ChatStorageLocal } from "./chat-storage-local";

// Storage interface for abstraction (localStorage now, IndexedDB later)
export interface ChatStorage {
  // Chat operations
  getChat(id: string): Promise<Chat | null>;
  saveChat(chat: Chat): Promise<void>;
  updateChatTitle(id: string, title: string): Promise<void>;
  deleteChat(id: string): Promise<void>;
  getCharts(): Promise<Chat[]>;
  getLatestChatId(): Promise<string | undefined>;
  getChatsForConnection(connectionId: string): Promise<Chat[]>;
  getLatestChatIdForConnection(connectionId: string): Promise<Chat | undefined>;

  // Message operations
  getMessages(chatId: string): Promise<Message[]>;
  saveMessage(message: Message): Promise<void>;
  saveMessages(chatId: string, messages: Message[]): Promise<void>;
  deleteMessage(id: string): Promise<void>;
  clearMessages(chatId: string): Promise<void>;
  clearAll(): Promise<void>;
  clearAllForConnection(connectionId: string): Promise<void>;
}

export const chatStorage = new ChatStorageLocal();
