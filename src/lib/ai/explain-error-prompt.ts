export function buildExplainErrorPrompt({
  errorMessage,
  errorCode,
  sql,
}: {
  errorMessage: string;
  errorCode?: string | number;
  sql?: string;
}): string {
  const parts: string[] = [];

  if (errorCode !== undefined) {
    parts.push(`error code: ${errorCode}`);
  }

  parts.push(`error message: ${errorMessage}`);

  if (sql) {
    parts.push(`sql:\n\`\`\`sql\n${sql}\n\`\`\``);
  }

  return `/explain_error_code ${parts.join("\n\n")}`;
}
