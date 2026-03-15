import { buildExplainErrorPrompt } from "@/components/query-tab/query-response/explain-error-prompt";
import { Button } from "@/components/ui/button";
import { SparklesIcon } from "lucide-react";
import { memo, useState } from "react";
import { useChatPanel } from "../chat/view/use-chat-panel";

interface AskAIButtonProps {
  errorMessage: string;
  errorCode?: string | number;
  sql?: string;
  className?: string;
  hideAfterClick?: boolean;
}

export const AskAIButton = memo(function AskAIButton({
  errorMessage,
  errorCode,
  sql,
  className,
  hideAfterClick = true,
}: AskAIButtonProps) {
  const { postMessage } = useChatPanel();
  const [isClicked, setIsClicked] = useState(false);

  const handleAskAI = () => {
    const message = buildExplainErrorPrompt({
      errorMessage,
      errorCode,
      sql,
    });

    postMessage(message, { forceNewChat: true });

    if (hideAfterClick) {
      setIsClicked(true);
    }
  };

  if (hideAfterClick && isClicked) {
    return null;
  }

  return (
    <Button
      variant="outline"
      size="sm"
      onClick={handleAskAI}
      className={`gap-2 rounded-sm text-primary bg-primary/10 hover:bg-primary/20 hover:text-primary border-primary/50 font-semibold animate-pulse ${className || ""}`}
    >
      <SparklesIcon className="h-4 w-4" />
      Ask AI for Fix
    </Button>
  );
});
