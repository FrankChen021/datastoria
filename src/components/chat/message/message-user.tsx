import { memo } from "react";
import { TABLE_MENTION_REGEX } from "../input/mention-utils";
import { MessageMarkdown } from "./message-markdown";

/**
 * Component to render user message with table mention support
 */
export const MessageUser = memo(function MessageUser({ text }: { text: string }) {
  // Replace @xxx.yyy with @`xxx.yyy` so markdown treats it as inline code
  // This allows MessageMarkdown to detect and render it as a table button
  // Uses the shared TABLE_MENTION_REGEX to match table mentions including
  // those followed by punctuation (e.g., @system.query_log?)
  const processedText = !text
    ? text
    : text.replace(TABLE_MENTION_REGEX, (match) => {
        // Keep the @ symbol and wrap the rest in backticks
        return `@\`${match.substring(1)}\``;
      });

  return (
    <MessageMarkdown
      text={processedText}
      showExecuteButton={false}
      customStyle={{ fontSize: "0.9rem", lineHeight: "1.6" }}
    />
  );
});
