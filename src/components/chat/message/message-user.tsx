import { memo, useMemo } from "react";
import { useChatCommands } from "../command-context";
import { getLeadingCommand } from "../input/command-utils";
import { TABLE_MENTION_REGEX } from "../input/mention-utils";
import { MessageMarkdown } from "./message-markdown";

function escapeHtmlAttribute(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll('"', "&quot;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}

/**
 * Component to render user message with table mention support
 * We use markdown component to render the user message.
 * To correctly render new line characters in user messages, we need to replace the single \n with \n\n
 * But some places given markdown text, like using ``` code blocks, in this case, we should not do the replacement.
 */
export const MessageUser = memo(function MessageUser({ text }: { text: string }) {
  const { commandsByName } = useChatCommands();
  const matchedCommand = text ? getLeadingCommand(text) : null;
  const command = matchedCommand ? commandsByName.get(matchedCommand.commandName) : null;

  const processedText = useMemo(() => {
    if (!text) return text;

    const baseText = command && matchedCommand ? matchedCommand.remainder.replace(/^ /, "") : text;
    const processedBaseText = baseText
      // Replace @xxx.yyy with @`xxx.yyy` so markdown treats it as inline code
      // This allows MessageMarkdown to detect and render it as a table button
      // Uses the shared TABLE_MENTION_REGEX to match table mentions including
      // those followed by punctuation (e.g., @system.query_log?)
      .replace(TABLE_MENTION_REGEX, (match) => {
        // Keep the @ symbol and wrap the rest in backticks
        return `@\`${match.substring(1)}\``;
      })
      // Replace newlines with double newlines for proper paragraph breaks,
      // but skip content inside fenced code blocks (```...```)
      .replace(/(```[\s\S]*?```)|(\n)/g, (_match, codeBlock, _newline) => {
        // If it's a code block, return it unchanged
        if (codeBlock) return codeBlock;
        // If it's a newline outside code block, double it
        return "\n\n";
      });

    if (!command || !matchedCommand) {
      return processedBaseText;
    }

    const commandText = escapeHtmlAttribute(matchedCommand.commandText);
    const skillId = escapeHtmlAttribute(command.skillId);
    const title = command.description ? ` title="${escapeHtmlAttribute(command.description)}"` : "";
    const commandLink = `<a href="skill://${skillId}" data-chat-command="true"${title}>${commandText}</a>`;

    return processedBaseText ? `${commandLink} ${processedBaseText}` : commandLink;
  }, [command, matchedCommand, text]);

  return (
    <MessageMarkdown
      text={processedText}
      showExecuteButton={false}
      customStyle={{ fontSize: "0.9rem", lineHeight: "1.6" }}
      expandable={true}
    />
  );
});
