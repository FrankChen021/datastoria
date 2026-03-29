"use client";

import { createContext, useContext } from "react";

export type UserActionInput = {
  text: string;
  autoRun?: boolean;
};

interface ChatActionContextType {
  onAction: (input: UserActionInput) => void;
  onToolOutput: (input: { tool: string; toolCallId: string; output: unknown }) => Promise<void>;
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
  onToolOutput,
  chatId,
}: {
  children: React.ReactNode;
  onAction: (input: UserActionInput) => void;
  onToolOutput: (input: { tool: string; toolCallId: string; output: unknown }) => Promise<void>;
  chatId?: string;
}) {
  return (
    <ChatActionContext.Provider value={{ onAction, onToolOutput, chatId }}>
      {children}
    </ChatActionContext.Provider>
  );
}
