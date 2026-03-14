type ExplainErrorPromptMode = "default" | "inline-auto";

export function buildExplainErrorPrompt({
  errorMessage,
  errorCode,
  sql,
  mode = "default",
}: {
  errorMessage: string;
  errorCode?: string | number;
  sql?: string;
  mode?: ExplainErrorPromptMode;
}): string {
  const parts: string[] = [];

  if (mode === "inline-auto") {
    parts.push(
      [
        "Respond for inline query error help in a compact, action-first format.",
        "Keep the answer brief and avoid repeating the raw error unless necessary.",
        "Format the response using this exact markdown structure when possible:",
        "## Cause",
        "- <one short sentence>",
        "## Fix",
        "- <fix 1>",
        "- <fix 2>",
        "## Example",
        "```sql",
        "<corrected sql>",
        "```",
        "Put only a fenced SQL block under ## Example.",
        "If no example is useful, omit the entire ## Example section.",
        "Do not include long background sections, step-by-step essays, or headings like Diagnosis and Fixes.",
      ].join("\n")
    );
  }

  if (errorCode !== undefined) {
    parts.push(`error code: ${errorCode}`);
  }

  parts.push(`error message: ${errorMessage}`);

  if (sql) {
    parts.push(`sql:\n\`\`\`sql\n${sql}\n\`\`\``);
  }

  return `/explain_error_code ${parts.join("\n\n")}`;
}
