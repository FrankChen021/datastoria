"use client";

import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Clock } from "lucide-react";
import * as React from "react";
import { ChatHistoryList } from "./chat-history-list";

interface OpenHistoryButtonProps {
  currentChatId: string;
  onNewChat: () => void;
  onSelectChat?: (id: string) => void;
  onClearCurrentChat?: () => void;
  variant?: "ghost" | "outline" | "secondary";
  className?: string;
  iconClassName?: string;
  align?: "center" | "end" | "start";
}

export const OpenHistoryButton: React.FC<OpenHistoryButtonProps> = ({
  currentChatId,
  onNewChat,
  onSelectChat,
  onClearCurrentChat,
  variant = "ghost",
  className = "h-7 w-7",
  iconClassName = "h-4 w-4",
  align = "end",
}) => {
  const [open, setOpen] = React.useState(false);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant={variant} size="icon" className={className} title="Show chat history">
          <Clock className={iconClassName} />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-80 p-0" align={align} sideOffset={5}>
        <ChatHistoryList
          currentChatId={currentChatId}
          onNewChat={() => {
            onNewChat();
            setOpen(false);
          }}
          onClose={() => setOpen(false)}
          onSelectChat={onSelectChat}
          onClearCurrentChat={onClearCurrentChat}
        />
      </PopoverContent>
    </Popover>
  );
};
