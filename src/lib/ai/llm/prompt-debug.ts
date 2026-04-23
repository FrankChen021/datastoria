type PromptDebugInput = {
  label: string;
  provider?: string;
  modelId?: string;
  system?: string;
  prompt?: string;
  messages?: unknown;
};

function shouldLogPrompt(): boolean {
  return process.env.DEBUG_LLM_PROMPTS === "true" || process.env.NODE_ENV !== "production";
}

function stringifySection(value: unknown): string {
  if (value == null) return "";
  if (typeof value === "string") return value;

  try {
    return JSON.stringify(value, null, 2);
  } catch (error) {
    return `[unserializable: ${error instanceof Error ? error.message : String(error)}]`;
  }
}

export function logLlmPrompt(input: PromptDebugInput): void {
  if (!shouldLogPrompt()) {
    return;
  }

  const sections = [
    "===== LLM PROMPT DEBUG =====",
    `label: ${input.label}`,
    `model: ${input.provider ?? "unknown"} / ${input.modelId ?? "unknown"}`,
  ];

  if (input.system !== undefined) {
    sections.push("----- system -----", stringifySection(input.system));
  }
  if (input.prompt !== undefined) {
    sections.push("----- prompt -----", stringifySection(input.prompt));
  }
  if (input.messages !== undefined) {
    sections.push("----- messages -----", stringifySection(input.messages));
  }

  sections.push("===== END LLM PROMPT DEBUG =====");
  console.log(sections.join("\n"));
}
