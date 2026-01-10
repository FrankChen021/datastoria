"use client";

import React, { createContext, useContext, useState } from "react";

interface ChatPanelContextType {
  isVisible: boolean;
  toggle: () => void;
  open: () => void;
  close: () => void;
  postMessage: (text: string, options?: { forceNewChat?: boolean }) => void;
  pendingCommand: { text: string; timestamp: number; forceNewChat?: boolean } | null;
  consumeCommand: () => void;
}

const ChatPanelContext = createContext<ChatPanelContextType>({
  isVisible: true,
  toggle: () => {
    // Default implementation
  },
  open: () => {
    // Default implementation
  },
  close: () => {
    // Default implementation
  },
  postMessage: () => {
    // Default implementation
  },
  pendingCommand: null,
  consumeCommand: () => {
    // Default implementation
  },
});

export function ChatPanelProvider({ children }: { children: React.ReactNode }) {
  // Default to false to hide the panel
  const [isVisible, setIsVisible] = useState<boolean>(false);
  const [pendingCommand, setPendingCommand] = useState<{
    text: string;
    timestamp: number;
    forceNewChat?: boolean;
  } | null>(null);

  const toggle = () => {
    setIsVisible((prev) => !prev);
  };

  const open = () => {
    setIsVisible(true);
  };

  const close = () => {
    setIsVisible(false);
  };

  const postMessage = (text: string, options?: { forceNewChat?: boolean }) => {
    setPendingCommand({ text, timestamp: Date.now(), forceNewChat: options?.forceNewChat });
    setIsVisible(true);
  };

  const consumeCommand = () => {
    setPendingCommand(null);
  };

  return (
    <ChatPanelContext.Provider
      value={{
        isVisible,
        toggle,
        open,
        close,
        postMessage,
        pendingCommand,
        consumeCommand,
      }}
    >
      {children}
    </ChatPanelContext.Provider>
  );
}

export const useChatPanel = () => useContext(ChatPanelContext);
