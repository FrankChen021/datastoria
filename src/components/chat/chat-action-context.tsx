"use client";

import { createContext, useContext } from "react";
import type { UserActionInput } from "./message/message-user-actions";

interface ChatActionContextType {
  onAction: (input: UserActionInput) => void;
  chatId?: string;
}

const ChatActionContext = createContext<ChatActionContextType | undefined>(undefined);

export function useChatAction() {
  const context = useContext(ChatActionContext);
  if (!context) {
    throw new Error("useChatAction must be used within a ChatActionProvider");
  }
  return context;
}

export function ChatActionProvider({
  children,
  onAction,
  chatId,
}: {
  children: React.ReactNode;
  onAction: (input: UserActionInput) => void;
  chatId?: string;
}) {
  return (
    <ChatActionContext.Provider value={{ onAction, chatId }}>{children}</ChatActionContext.Provider>
  );
}
