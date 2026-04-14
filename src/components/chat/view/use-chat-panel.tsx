"use client";

import type { AgentContext } from "@/lib/ai/chat-types";
import React, { createContext, useContext, useState } from "react";

export type ChatPanelDisplayMode = "hidden" | "panel" | "tabWidth" | "fullscreen";
export type SidebarTab = "database" | "snippets" | "history";
export type SelectedChatTarget = {
  chatId: string;
  connectionId?: string;
};

export type ChatComposerInputMode = "replace" | "append";
export type ChatComposerInput = {
  text: string;
  chatId?: string;
  mode: ChatComposerInputMode;
  nonce: number;
};

interface ChatPanelContextType {
  displayMode: ChatPanelDisplayMode;
  setDisplayMode: (mode: ChatPanelDisplayMode) => void;
  toggleDisplayMode: () => void;
  open: () => void;
  close: () => void;
  currentChatId: string | null;
  setCurrentChatId: (chatId: string | null) => void;
  selectChat: (chatId: string, connectionId?: string) => void;
  selectedChat: SelectedChatTarget | null;
  clearSelectedChat: () => void;
  requestNewChat: () => void;
  newChatRequestNonce: number;
  activeSidebarTab: SidebarTab;
  setActiveSidebarTab: (tab: SidebarTab) => void;
  postMessage: (
    text: string,
    options?: { forceNewChat?: boolean; agentContext?: Partial<AgentContext> }
  ) => void;
  pendingCommand: {
    text: string;
    timestamp: number;
    forceNewChat?: boolean;
    agentContext?: Partial<AgentContext>;
  } | null;
  consumeCommand: () => void;
  setInitialInput: (text: string, chatId?: string, mode?: ChatComposerInputMode) => void;
  initialInput: ChatComposerInput | null;
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
  selectedChat: null,
  clearSelectedChat: () => {
    // Default implementation
  },
  requestNewChat: () => {
    // Default implementation
  },
  newChatRequestNonce: 0,
  activeSidebarTab: "database",
  setActiveSidebarTab: () => {
    // Default implementation
  },
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
  const [selectedChat, setSelectedChat] = useState<SelectedChatTarget | null>(null);
  const [newChatRequestNonce, setNewChatRequestNonce] = useState(0);
  const [activeSidebarTab, setActiveSidebarTab] = useState<SidebarTab>("database");
  const [pendingCommand, setPendingCommand] = useState<{
    text: string;
    timestamp: number;
    forceNewChat?: boolean;
    agentContext?: Partial<AgentContext>;
  } | null>(null);
  const [initialInput, setInitialInputState] = useState<ChatComposerInput | null>(null);

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

  const selectChat = (chatId: string, connectionId?: string) => {
    setSelectedChat({ chatId, connectionId });
    setActiveSidebarTab("history");
    setDisplayMode("tabWidth");
  };

  const clearSelectedChat = () => {
    setSelectedChat(null);
  };

  const requestNewChat = () => {
    setSelectedChat(null);
    setNewChatRequestNonce((prev) => prev + 1);
    setActiveSidebarTab("history");
    setDisplayMode("tabWidth");
  };

  const postMessage = (
    text: string,
    options?: { forceNewChat?: boolean; agentContext?: Partial<AgentContext> }
  ) => {
    setPendingCommand({
      text,
      timestamp: Date.now(),
      forceNewChat: options?.forceNewChat,
      agentContext: options?.agentContext,
    });
    setDisplayMode((prev) => (prev === "hidden" ? "panel" : prev));
  };

  const consumeCommand = () => {
    setPendingCommand(null);
  };

  const setInitialInput = (
    text: string,
    chatId?: string,
    mode: ChatComposerInputMode = "replace"
  ) => {
    setInitialInputState({ text, chatId, mode, nonce: Date.now() });
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
        selectedChat,
        clearSelectedChat,
        requestNewChat,
        newChatRequestNonce,
        activeSidebarTab,
        setActiveSidebarTab,
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
