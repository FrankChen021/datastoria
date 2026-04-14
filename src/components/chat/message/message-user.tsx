import { memo, useMemo } from "react";
import { useAgentCommands } from "../agent-command-context";
import { getLeadingCommand } from "../input/command-utils";
import { TABLE_MENTION_REGEX } from "../input/mention-utils";
import { MessageMarkdown } from "./message-markdown";
import { SkillLink } from "./skill-link";

const FENCED_CODE_BLOCK_RE = /(```[\s\S]*?```)/g;

function processUserMessageProse(text: string) {
  return text
    .replace(TABLE_MENTION_REGEX, (match) => {
      return `@\`${match.substring(1)}\``;
    })
    .replace(/\n/g, "\n\n");
}

/**
 * Component to render user message with table mention support
 * We use markdown component to render the user message.
 * To correctly render new line characters in user messages, we need to replace the single \n with \n\n
 * But some places given markdown text, like using ``` code blocks, in this case, we should not do the replacement.
 */
export const MessageUser = memo(function MessageUser({ text }: { text: string }) {
  const { commandsByName } = useAgentCommands();
  const matchedCommand = text ? getLeadingCommand(text) : null;
  const command = matchedCommand ? commandsByName.get(matchedCommand.commandName) : null;

  const processedText = useMemo(() => {
    if (!text) return text;

    const baseText = command && matchedCommand ? matchedCommand.remainder.replace(/^ /, "") : text;
    const processedBaseText = baseText
      .split(FENCED_CODE_BLOCK_RE)
      .map((segment) => (segment.startsWith("```") ? segment : processUserMessageProse(segment)))
      .join("");

    if (!command || !matchedCommand) {
      return processedBaseText;
    }

    const commandLink = SkillLink.buildToken(
      new SkillLink({
        skillId: command.skillId,
        label: matchedCommand.commandText,
        title: command.description,
      })
    );

    if (!processedBaseText) {
      return commandLink;
    }

    // Fenced blocks must start on their own line or markdown will render the backticks inline.
    const separator = processedBaseText.startsWith("```") ? "\n\n" : " ";
    return `${commandLink}${separator}${processedBaseText}`;
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
