import { isEnglishLanguageTag, sanitizeLanguageTag } from "../language-utils";

export function withVisibleReasoningLanguageInstruction(
  instructions: string,
  outputReasoning: boolean,
  responseLanguage?: string
): string {
  const language = sanitizeLanguageTag(responseLanguage);
  if (!outputReasoning || !language || isEnglishLanguageTag(language)) {
    return instructions;
  }

  return `${instructions}

## Visible Reasoning Language
The API may emit visible reasoning summaries separately from the final answer. Every visible reasoning summary, thinking summary, planning note, heading, and paragraph MUST be written in ${language}. Never emit English visible reasoning text unless the configured response language is English.`;
}
