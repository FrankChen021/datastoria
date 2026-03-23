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

export function replaceLeadingCommand(input: string, commandName: string): string {
  const match = LEADING_COMMAND_PREFIX_RE.exec(input);
  const argsStart = match ? match[0].length : input.length;
  const existingArgs = input.slice(argsStart);
  return `/${commandName}${existingArgs || " "}`;
}
