import type { Chat, Message } from "@/lib/ai/chat-types";

export interface SessionRepository {
  getSession(chatId: string): Promise<Chat | null>;
  getSessionsForConnection(connectionId: string): Promise<Chat[]>;
  getMessages(chatId: string): Promise<Message[]>;
  saveSession(session: Chat): Promise<void>;
  saveMessages(chatId: string, messages: Message[]): Promise<void>;
  saveMessage(chatId: string, message: Message): Promise<void>;
  renameSession(chatId: string, title: string): Promise<void>;
  deleteSession(chatId: string): Promise<void>;
}
