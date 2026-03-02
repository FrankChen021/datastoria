import type { Chat, Message } from "@/lib/ai/chat-types";

export interface SessionRepository {
  getSession(id: string): Promise<Chat | null>;
  saveSession(session: Chat): Promise<void>;
  updateSessionTitle(id: string, title: string): Promise<void>;
  deleteSession(id: string): Promise<void>;
  getSessionsForConnection(connectionId: string): Promise<Chat[]>;
  getMessages(chatId: string): Promise<Message[]>;
  saveMessage(chatId: string, message: Message): Promise<void>;
  saveMessages(chatId: string, messages: Message[]): Promise<void>;
}
