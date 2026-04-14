export const LEADING_COMMAND_PREFIX_RE = /^\/[a-z][a-z0-9_-]*/;
const LEADING_COMMAND_RE = /^\/([a-z][a-z0-9_-]*)(?=$|\s|\n)/;

export interface LeadingCommandMatch {
  commandName: string;
  commandText: string;
  remainder: string;
}

export function getLeadingCommand(text: string): LeadingCommandMatch | null {
  const match = LEADING_COMMAND_RE.exec(text);
  if (!match) {
    return null;
  }

  return {
    commandName: match[1],
    commandText: match[0],
    remainder: text.slice(match[0].length),
  };
}

export function replaceLeadingCommand(
  input: string,
  commandName: string,
  cursorOffset: number = input.length
): string {
  const safeCursorOffset = Math.max(0, Math.min(cursorOffset, input.length));
  const beforeCursor = input.slice(0, safeCursorOffset);
  const afterCursor = input.slice(safeCursorOffset);
  const match = LEADING_COMMAND_PREFIX_RE.exec(beforeCursor);
  const argsStart = match ? match[0].length : beforeCursor.length;
  const existingArgs = `${beforeCursor.slice(argsStart)}${afterCursor}`;
  return `/${commandName}${existingArgs || " "}`;
}

export function removeLeadingCommand(input: string): string {
  const match = getLeadingCommand(input);
  if (!match) {
    return input;
  }

  return match.remainder.replace(/^ /, "");
}
