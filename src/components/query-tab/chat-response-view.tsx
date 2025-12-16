import type { AppUIMessage } from "@/lib/ai/ai-tools";
import { AlertCircleIcon, Loader2, Sparkles, User } from "lucide-react";
import { memo } from "react";
import ReactMarkdown from "react-markdown";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { useSession } from "next-auth/react";
import { Alert, AlertDescription, AlertTitle } from "../ui/alert";
import { Badge } from "../ui/badge";
import { SqlCodeBlock } from "./sql-code-block";

interface ChatResponseViewProps {
  messages: AppUIMessage[];
  isLoading?: boolean;
  error?: Error | null;
}

/**
 * Render a single message part
 */
function MessagePart({ part }: { part: AppUIMessage["parts"][0] }) {
  if (part.type === "text") {
    return (
      <div className="prose prose-sm dark:prose-invert max-w-none mt-1">
        <ReactMarkdown
          components={{
            code({ className, children, ...props }: React.ComponentProps<"code">) {
              const match = /language-(\w+)/.exec(className || "");
              const language = match ? match[1] : "";
              const codeString = String(children).replace(/\n$/, "");
              const isInline = !className || !className.includes("language-");

              // Use SqlCodeBlock for SQL code blocks (non-inline)
              if (!isInline && (language === "sql" || language === "")) {
                return (
                  <SqlCodeBlock
                    code={codeString}
                    showExecuteButton={true}
                    customStyle={{
                      margin: 0,
                      borderRadius: "0.375rem",
                      fontSize: "0.875rem",
                    }}
                  />
                );
              }

              // Default inline code rendering
              return (
                <code className={className} {...props}>
                  {children}
                </code>
              );
            },
            h1: ({ children, ...props }) => (
              <h1 className="pt-4 pb-2" {...props}>
                {children}
              </h1>
            ),
            h2: ({ children, ...props }) => (
              <h2 className="pt-3 pb-2" {...props}>
                {children}
              </h2>
            ),
            h3: ({ children, ...props }) => (
              <h3 className="pt-3 pb-1.5" {...props}>
                {children}
              </h3>
            ),
            h4: ({ children, ...props }) => (
              <h4 className="pt-2 pb-1.5" {...props}>
                {children}
              </h4>
            ),
            h5: ({ children, ...props }) => (
              <h5 className="pt-2 pb-1" {...props}>
                {children}
              </h5>
            ),
            h6: ({ children, ...props }) => (
              <h6 className="pt-2 pb-1" {...props}>
                {children}
              </h6>
            ),
            ul: ({ children, ...props }) => (
              <ul className="list-disc my-2 pl-4" {...props}>
                {children}
              </ul>
            ),
            ol: ({ children, ...props }) => (
              <ol className="list-decimal my-2 pl-4" {...props}>
                {children}
              </ol>
            ),
            li: ({ children, ...props }) => (
              <li className="my-1" {...props}>
                {children}
              </li>
            ),
          }}
        >
          {part.text}
        </ReactMarkdown>
      </div>
    );
  }

  // Handle dynamic-tool parts (AI SDK's tool call format)
  if (part.type === "dynamic-tool") {
    const toolPart = part as { toolName: string; toolCallId: string; input?: unknown; state?: string };
    return (
      <div className="text-xs text-muted-foreground bg-muted/50 p-2 rounded mt-2 flex items-center gap-2">
        <div className="font-mono">Running Tool: {toolPart.toolName}</div>
        {/* {toolPart.input !== undefined && (
          <pre className="text-xs overflow-x-auto">{JSON.stringify(toolPart.input, null, 2)}</pre>
        )} */}
      </div>
    );
  }

  // Handle tool-* prefixed parts (like tool-get_tables, tool-get_table_columns)
  const partType = part.type as string;
  if (typeof partType === "string" && partType.startsWith("tool-")) {
    const toolName = partType.replace("tool-", "");
    return (
      <div>
        <Badge className="rounded-sm py-[0.5] font-normal">Tool: {toolName}</Badge>
      </div>
    );
  }

  return null;
}

/**
 * Render a single message
 */
const MessageView = memo(function MessageView({
  message,
  children,
}: {
  message: AppUIMessage;
  children?: React.ReactNode;
}) {
  const isUser = message.role === "user";
  const { data: session } = useSession();
  const user = session?.user;

  return (
    <div className="flex gap-3 mb-4">
      <div className="flex-shrink-0 mt-0.5">
        {isUser ? (
          <Avatar className="h-6 w-6">
            <AvatarImage src={user?.image || ""} alt={user?.name || "User"} />
            <AvatarFallback>{user?.name?.[0]?.toUpperCase() || <User className="h-4 w-4" />}</AvatarFallback>
          </Avatar>
        ) : (
          <div className="h-6 w-6 rounded-sm flex items-center justify-center">
            <Sparkles className="h-4 w-4" />
          </div>
        )}
      </div>

      <div className="flex-1 overflow-hidden min-w-0">
        <div className={`text-sm`}>
          {message.parts.map((part, i) => (
            <MessagePart key={i} part={part} />
          ))}
          {children}
        </div>
      </div>
    </div>
  );
});

export function ChatResponseView({ messages, isLoading = false, error }: ChatResponseViewProps) {
  if (error) {
    return (
      <Alert variant="destructive" className="border-0 p-3">
        <div className="flex items-center gap-2">
          <AlertCircleIcon />
          <AlertTitle>Chat Error</AlertTitle>
        </div>
        <AlertDescription className="mt-2">
          {error.message || "An error occurred while chatting with the AI assistant."}
        </AlertDescription>
      </Alert>
    );
  }

  if (isLoading && messages.length === 0) {
    return (
      <div className="h-full w-full overflow-auto p-4 flex flex-col items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground mb-2" />
        <div className="text-sm text-muted-foreground">AI is thinking...</div>
      </div>
    );
  }

  if (messages.length === 0 && !isLoading) {
    return <div className="p-4 text-sm text-muted-foreground">Waiting for AI response...</div>;
  }

  return (
    <div className="mt-2 overflow-auto">
      {messages.map((message, index) => (
        <MessageView key={message.id} message={message}>
          {index === messages.length - 1 && isLoading && <Loader2 className="mt-2 h-4 w-4 animate-spin" />}
        </MessageView>
      ))}
    </div>
  );
}
