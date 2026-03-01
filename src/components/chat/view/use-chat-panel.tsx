"use client";

import React, { createContext, useContext, useState } from "react";

export type ChatPanelDisplayMode = "hidden" | "panel" | "tabWidth" | "fullscreen";

interface ChatPanelContextType {
  displayMode: ChatPanelDisplayMode;
  setDisplayMode: (mode: ChatPanelDisplayMode) => void;
  toggleDisplayMode: () => void;
  open: () => void;
  close: () => void;
  currentChatId: string | null;
  setCurrentChatId: (chatId: string | null) => void;
  selectChat: (chatId: string) => void;
  selectedChatId: string | null;
  clearSelectedChatId: () => void;
  requestNewChat: () => void;
  newChatRequestNonce: number;
  postMessage: (text: string, options?: { forceNewChat?: boolean }) => void;
  pendingCommand: { text: string; timestamp: number; forceNewChat?: boolean } | null;
  consumeCommand: () => void;
  setInitialInput: (text: string, chatId?: string) => void;
  initialInput: { text: string; chatId?: string } | null;
  clearInitialInput: () => void;
}

const ChatPanelContext = createContext<ChatPanelContextType>({
  displayMode: "hidden",
  setDisplayMode: () => {
    // Default implementation
  },
  toggleDisplayMode: () => {
    // Default implementation
  },
  open: () => {
    // Default implementation
  },
  close: () => {
    // Default implementation
  },
  currentChatId: null,
  setCurrentChatId: () => {
    // Default implementation
  },
  selectChat: () => {
    // Default implementation
  },
  selectedChatId: null,
  clearSelectedChatId: () => {
    // Default implementation
  },
  requestNewChat: () => {
    // Default implementation
  },
  newChatRequestNonce: 0,
  postMessage: () => {
    // Default implementation
  },
  pendingCommand: null,
  consumeCommand: () => {
    // Default implementation
  },
  setInitialInput: () => {
    // Default implementation
  },
  initialInput: null,
  clearInitialInput: () => {
    // Default implementation
  },
});

export function ChatPanelProvider({ children }: { children: React.ReactNode }) {
  // Default to hidden
  const [displayMode, setDisplayMode] = useState<ChatPanelDisplayMode>("hidden");
  const [currentChatId, setCurrentChatId] = useState<string | null>(null);
  const [selectedChatId, setSelectedChatId] = useState<string | null>(null);
  const [newChatRequestNonce, setNewChatRequestNonce] = useState(0);
  const [pendingCommand, setPendingCommand] = useState<{
    text: string;
    timestamp: number;
    forceNewChat?: boolean;
  } | null>(null);
  const [initialInput, setInitialInputState] = useState<{ text: string; chatId?: string } | null>(
    null
  );

  const toggleDisplayMode = () => {
    setDisplayMode((prev) => {
      switch (prev) {
        case "panel":
          return "tabWidth";
        case "tabWidth":
          return "fullscreen";
        case "fullscreen":
          return "panel";
        default:
          return "panel";
      }
    });
  };

  const open = () => {
    setDisplayMode((prev) => (prev === "hidden" ? "tabWidth" : prev));
  };

  const close = () => {
    setDisplayMode("hidden");
  };

  const selectChat = (chatId: string) => {
    setSelectedChatId(chatId);
    setDisplayMode("tabWidth");
  };

  const clearSelectedChatId = () => {
    setSelectedChatId(null);
  };

  const requestNewChat = () => {
    setSelectedChatId(null);
    setNewChatRequestNonce((prev) => prev + 1);
    setDisplayMode("tabWidth");
  };

  const postMessage = (text: string, options?: { forceNewChat?: boolean }) => {
    setPendingCommand({ text, timestamp: Date.now(), forceNewChat: options?.forceNewChat });
    setDisplayMode((prev) => (prev === "hidden" ? "panel" : prev));
  };

  const consumeCommand = () => {
    setPendingCommand(null);
  };

  const setInitialInput = (text: string, chatId?: string) => {
    setInitialInputState({ text, chatId });
    setDisplayMode((prev) => (prev === "hidden" ? "panel" : prev));
  };

  const clearInitialInput = () => {
    setInitialInputState(null);
  };

  return (
    <ChatPanelContext.Provider
      value={{
        displayMode,
        setDisplayMode,
        toggleDisplayMode,
        open,
        close,
        currentChatId,
        setCurrentChatId,
        selectChat,
        selectedChatId,
        clearSelectedChatId,
        requestNewChat,
        newChatRequestNonce,
        postMessage,
        pendingCommand,
        consumeCommand,
        setInitialInput,
        initialInput,
        clearInitialInput,
      }}
    >
      {children}
    </ChatPanelContext.Provider>
  );
}

export const useChatPanel = () => useContext(ChatPanelContext);
