"use client";

import { createContext, useContext } from "react";
import type { UserAction } from "./message/message-user-actions";

interface ChatActionContextType {
  onAction: (action: UserAction) => void;
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
}: {
  children: React.ReactNode;
  onAction: (action: UserAction) => void;
}) {
  return <ChatActionContext.Provider value={{ onAction }}>{children}</ChatActionContext.Provider>;
}
