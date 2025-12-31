import type { ReactNode } from "react";
import { createContext, useContext } from "react";

interface ChatExecutionContextType {
  isChatExecuting: boolean;
}

const ChatExecutionContext = createContext<ChatExecutionContextType | undefined>(undefined);

export function ChatExecutionProvider({
  children,
  isChatExecuting,
}: {
  children: ReactNode;
  isChatExecuting: boolean;
}) {
  return (
    <ChatExecutionContext.Provider value={{ isChatExecuting }}>{children}</ChatExecutionContext.Provider>
  );
}

export function useChatExecution() {
  const context = useContext(ChatExecutionContext);
  if (!context) {
    throw new Error("useChatExecution must be used within a ChatExecutionProvider");
  }
  return context;
}

