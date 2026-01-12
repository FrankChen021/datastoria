import { Button } from "@/components/ui/button";
import { SparklesIcon } from "lucide-react";
import { memo, useState } from "react";
import { useChatPanel } from "../chat/view/use-chat-panel";

interface AskAIButtonProps {
  sql?: string;
  errorMessage: string;
  className?: string;
  hideAfterClick?: boolean;
}

export const AskAIButton = memo(function AskAIButton({
  sql,
  errorMessage,
  className,
  hideAfterClick = true,
}: AskAIButtonProps) {
  const { postMessage } = useChatPanel();
  const [isClicked, setIsClicked] = useState(false);

  const handleAskAI = () => {
    // Build the message with SQL and error details
    const message = `I got an error when executing this SQL query. Please explain what went wrong in short and provide a fix.

${sql ? `### SQL
\`\`\`sql
${sql}
\`\`\`

` : ""}### Error Message
${errorMessage}
`;

    // Post message to the global chat panel
    postMessage(message, { forceNewChat: true });

    // Hide the button after clicking if hideAfterClick is true
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
      Ask AI About This Error
    </Button>
  );
});
