import {
  DEFAULT_AUTO_EXPLAIN_LANGUAGE,
  type AutoExplainLanguage,
} from "@/components/settings/agent/agent-manager";

function isEnglishLanguageTag(tag: string): boolean {
  const t = tag.trim().toLowerCase();
  return t === "en" || t.startsWith("en-");
}

export function buildExplainErrorPrompt({
  errorMessage,
  errorCode,
  sql,
  language = DEFAULT_AUTO_EXPLAIN_LANGUAGE,
}: {
  errorMessage: string;
  errorCode?: string | number;
  sql?: string;
  /** BCP-47 language for prose and headings; English adds no extra instructions. */
  language?: AutoExplainLanguage;
}): string {
  const parts: string[] = [];

  if (errorCode !== undefined) {
    parts.push(`error code: ${errorCode}`);
  }

  parts.push(`error message: ${errorMessage}`);

  if (sql) {
    parts.push(`sql:\n\`\`\`sql\n${sql}\n\`\`\``);
  }

  const base = `/diagnose-clickhouse-errors ${parts.join("\n\n")}`;

  if (isEnglishLanguageTag(language)) {
    return base;
  }

  return `${base}\n\nResponse language (BCP-47): ${language}\nWrite the ## Cause, ## Fix, and optional ## Example sections in this language (localize the headings to match). Keep SQL, error codes, ClickHouse setting names, and identifiers unchanged.`;
}
