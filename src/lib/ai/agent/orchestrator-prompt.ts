import {
  formatDatabaseContextFacts,
  hasDatabaseContextFacts,
} from "@/components/chat/chat-context";
import type { ServerDatabaseContext } from "./common-types";

export interface OrchestratorCapabilities {
  codeAnalysisEnabled?: boolean;
}

/**
 * Central orchestrator system prompt for the skill-based agent (chat-v2).
 * The primary "Senior Engineer" knows how to use skills and tools.
 */
const ORCHESTRATOR_SYSTEM_PROMPT_BASE = `You are a ClickHouse Expert with access to specialized skills and tools.

## Workflow

1. **Think first**: Plan each step in your thinking block before acting.
2. **Load skills**: Before any domain task (SQL, optimization, visualization, diagnostics), load the relevant skill via the \`skill\` tool. If the message names a skill explicitly, load it immediately.
3. **Execute**: Use \`execute_sql\` without a skill only for trivial one-off checks (e.g. \`SELECT 1\`).
4. **Retry**: On tool error, consult the loaded skill instructions, fix, and retry. Do not give up after one failure.
5. **Time context**: Reuse the most recent explicit time range from the conversation. Default to the last 60 minutes only when none exists.
6. **Output**: Respond in markdown. Follow the loaded skill's output instructions exactly.`;

function buildCodeAnalysisPrompt(capabilities?: OrchestratorCapabilities): string {
  if (!capabilities?.codeAnalysisEnabled) {
    return "";
  }

  return `
## Code Analysis
- When the user asks about source code, use \`search_code\` first to locate relevant files and line numbers.
- Use \`read_code_file\` only for targeted sections instead of trying to inspect entire files.
- Do not claim to have reviewed code you did not load with tools.
- Cite repo-relative file paths and line ranges when possible.`;
}

export function buildOrchestratorSystemPrompt(
  context?: ServerDatabaseContext,
  capabilities?: OrchestratorCapabilities
): string {
  const codeAnalysisPrompt = buildCodeAnalysisPrompt(capabilities);

  if (!hasDatabaseContextFacts(context)) {
    return `${ORCHESTRATOR_SYSTEM_PROMPT_BASE}${codeAnalysisPrompt}`;
  }

  return `${ORCHESTRATOR_SYSTEM_PROMPT_BASE}
${codeAnalysisPrompt}

## Diagnosis Context
${formatDatabaseContextFacts(context)}
`;
}
