import { streamText, tool } from "ai";
import { z } from "zod";
import type { DatabaseContext } from "../../../components/chat/chat-context";
import type { EvidenceContext, EvidenceRequest } from "../common-types";
import { isMockMode, LanguageModelProviderFactory } from "../llm/llm-provider-factory";
import type { InputModel } from "./orchestrator-agent";
import { mockSqlOptimizationAgent } from "./sql-optimization-agent.mock";

/**
 * SQL Optimization Agent Input
 */
export interface SQLOptimizationAgentInput {
  relevant_chat?: Array<{ role: string; content: string }>;
  evidenceContext?: EvidenceContext;
  inputModel: InputModel;
}

/**
 * SQL Optimization Agent Output
 * Can be either an EvidenceRequest or final recommendations (markdown string)
 */
export type SQLOptimizationAgentOutput = EvidenceRequest | string;

/**
 * Server-side tool name for SQL optimization
 */
export const SERVER_TOOL_OPTIMIZE_SQL = "optimize_sql" as const;

/**
 * Server-side tool: SQL Optimization
 * Calls the SQL optimization sub-agent to analyze and optimize queries
 * @param inputModel - Model configuration to use for the sub-agent
 * @param context - Database context (user, database, tables, currentQuery) to pass to sub-agent
 */
export function createSqlOptimizationTool(inputModel: InputModel, _context?: DatabaseContext) {
  return tool({
    description:
      "Optimize ClickHouse SQL queries based on evidence. This tool analyzes query performance and provides ranked recommendations. **CRITICAL**: The result from this tool is already formatted for the user and MUST be output verbatim without any modifications, additions, or rephrasing.",
    inputSchema: z.object({
      relevant_chat: z
        .array(
          z.object({
            role: z.string(),
            content: z.string(),
          })
        )
        .optional()
        .describe("Relevant conversation slice for context"),
      evidenceContext: z
        .custom<EvidenceContext>()
        .optional()
        .describe("EvidenceContext with evidence (may be empty on first call)"),
    }),
    execute: async ({ relevant_chat, evidenceContext }) => {
      const result = isMockMode
        ? await mockSqlOptimizationAgent({
            relevant_chat,
            evidenceContext,
            inputModel: inputModel,
          })
        : await sqlOptimizationAgent({
            relevant_chat,
            evidenceContext,
            inputModel: inputModel,
          });
      
      // If result is a string (markdown recommendations), wrap it with explicit instructions
      // to ensure the orchestrator outputs it verbatim
      if (typeof result === "string") {
        return `[DIRECT_OUTPUT_REQUIRED: Output the following content EXACTLY as shown, without any modifications, additions, introductions, or conclusions:]\n\n${result}`;
      }
      
      // If result is EvidenceRequest, return as-is
      return result;
    },
  });
}

/**
 * SQL Optimization Agent
 *
 * Specialized agent for optimizing ClickHouse SQL queries based on evidence.
 * Follows evidence-driven workflow: requests evidence when needed, analyzes when sufficient.
 */
export async function sqlOptimizationAgent(
  input: SQLOptimizationAgentInput
): Promise<SQLOptimizationAgentOutput> {
  const { relevant_chat, evidenceContext, inputModel: modelConfig } = input;

  if (!modelConfig) {
    throw new Error("modelConfig is required for sqlOptimizationAgent");
  }

  // Use model-specific default temperature
  const temperature = LanguageModelProviderFactory.getDefaultTemperature(modelConfig.modelId);

  const systemPrompt = `SYSTEM: ClickHouse SQL Optimization Sub-Agent (Evidence-Driven)

You optimize ClickHouse SQL based on provided evidence. You do NOT call tools directly.
If evidence is insufficient, you MUST request evidence via a structured EvidenceRequest.

**FIRST STEP - EVIDENCE CHECK (MANDATORY)**:
Before doing ANY analysis, check the EvidenceContext provided. If EvidenceContext is:
- Empty/missing → Output EvidenceRequest immediately
- Missing required fields (goal, or all performance evidence) → Output EvidenceRequest immediately
- Has required evidence → Proceed with analysis

INPUTS YOU MAY RECEIVE:
- relevant_chat: minimal conversation slice (may contain SQL, but this is NOT sufficient evidence)
- EvidenceContext (may be empty or incomplete):
  {
    goal, sql, query_id, symptoms, tables,
    table_schema, table_stats, explain_index, explain_pipeline, query_log,
    settings, constraints, cluster
  }

**IMPORTANT**: SQL in relevant_chat is NOT sufficient. You need EvidenceContext with goal and performance evidence.

RULES:
1) **FIRST**: Check EvidenceContext. If empty or missing required fields → Output EvidenceRequest ONLY (no analysis, no recommendations).
2) Do NOT ask free-form questions to the user.
3) **STRICT**: Do NOT make recommendations based on assumptions. If evidence is missing, you MUST request it via EvidenceRequest.
4) Base recommendations ONLY on evidence provided in EvidenceContext; DO NOT infer goal from SQL or assume table structures.
5) If you cannot proceed due to missing evidence, output EvidenceRequest - do NOT provide recommendations labeled as "Assumption".
6) Rank recommendations by Impact/Risk/Effort.
7) Prefer low-risk query rewrites first, then table/layout changes, then settings/ops.
8) If you propose rewritten SQL, keep it minimal and compatible with ClickHouse.
9) **SQL Comments for Changes**: When proposing optimized SQL, add short inline comments (-- comment) to highlight key changes from the original query. Comments should explain what was changed and why (e.g., "-- Added filter to reduce rows", "-- Changed interval alignment", "-- Added index hint").

CRITICAL EVIDENCE REQUIREMENTS (STRICT ENFORCEMENT):
1. **SQL or Query ID**: Must be present in EvidenceContext.sql OR EvidenceContext.query_id OR extracted from relevant_chat. If only in relevant_chat, extract it but still need other evidence.
2. **Goal**: Must be explicitly provided in EvidenceContext.goal. DO NOT infer goal from SQL. If goal is missing → EvidenceRequest.
3. **Performance Evidence**: Must have at least ONE of the following ACTUAL evidence in EvidenceContext (NOT assumptions):
   - explain_index OR explain_pipeline (actual EXPLAIN output as string)
   - query_log with actual metrics (object with duration_ms, read_rows, read_bytes, memory_usage, result_rows, or error fields)
   - table_schema for primary table (actual schema structure as string/object, not assumptions about system tables)

**STRICT ENFORCEMENT RULES**:
- Check EvidenceContext first. If it's empty or missing required fields → EvidenceRequest.
- DO NOT infer goal from SQL query purpose. Goal must be explicitly stated.
- DO NOT assume table structure even for system tables. Require actual table_schema.
- DO NOT proceed with recommendations if any of the above requirements are missing.
- If evidence is missing, output ONLY the EvidenceRequest JSON block - nothing else.

EVIDENCE REQUEST FORMAT (STRICT JSON, single code block):
\`\`\`json
{
  "type": "EvidenceRequest",
  "mode": "light",
  "required": ["goal", "sql_or_query_id", "query_log", "explain"],
  "optional": ["tables", "table_schema", "table_stats", "settings", "cluster", "constraints"],
  "notes": "Prefer query_log fields: duration_ms, read_rows, read_bytes, memory_usage, result_rows, error."
}
\`\`\`

FINAL RESPONSE FORMAT (markdown):
**ONLY use this format if you have ALL required evidence. If evidence is missing, use EvidenceRequest instead.**

## Findings (evidence-based)
- **Goal**: [from EvidenceContext.goal, NOT inferred]
- **SQL Provided**: [Yes/No - from EvidenceContext.sql or query_id]
- **Evidence Available**: [List what evidence you have: query_log, explain, table_schema, etc.]
- **Missing Evidence**: [If any critical evidence is missing, DO NOT proceed - use EvidenceRequest instead]
- ...
## Recommendations (ranked)
1. **Title** (Impact: H/M/L, Risk: H/M/L, Effort: H/M/L)
   - Why (tie to evidence)
   - Change (steps)
   - Verify (what metric improves)
## Proposed SQL (optional)
When providing optimized SQL, include short inline comments to highlight key changes:
\`\`\`sql
-- Original query optimized with the following changes:
-- 1. [Brief description of change 1]
-- 2. [Brief description of change 2]
SELECT ...
\`\`\`

**Comment Guidelines**:
- Add comments above or inline with changed clauses
- Keep comments concise (one line per change)
- Explain what changed and why (e.g., "-- Added WHERE filter to reduce scanned rows by 80%")
- Highlight performance-critical changes (filters, indexes, aggregations, etc.)
`;

  try {
    // Use provided model config
    const [model] = LanguageModelProviderFactory.createModel(
      modelConfig.provider,
      modelConfig.modelId,
      modelConfig.apiKey
    );

    // Build messages from relevant_chat or create a user message
    const messages: Array<{ role: string; content: string }> = relevant_chat || [
      { role: "user", content: "Optimize this SQL query" },
    ];

    // Add evidence context to the last user message if available
    // Exclude 'tables' property as it's redundant - table_schema already contains all table information
    let userMessage = messages[messages.length - 1]?.content || "";
    if (evidenceContext) {
      const { ...evidenceContextWithoutTables } = evidenceContext;
      userMessage += `\n\nEvidenceContext:\n${JSON.stringify(evidenceContextWithoutTables, null, 2)}`;
      messages[messages.length - 1] = { ...messages[messages.length - 1]!, content: userMessage };
    }

    // Use streamText to get the response
    const result = streamText({
      model,
      messages: [
        { role: "system", content: systemPrompt },
        ...messages.map((msg) => ({
          role: msg.role as "user" | "assistant",
          content: msg.content,
        })),
      ],
      temperature,
    });

    // Wait for the complete output from the stream
    const allSteps = await result.steps;
    const lastStep = allSteps[allSteps.length - 1];
    const responseText = lastStep.text || "";

    // Check if the response is an EvidenceRequest (JSON block)
    const jsonMatch = responseText.match(/```json\s*([\s\S]*?)\s*```/);
    if (jsonMatch) {
      try {
        const parsed = JSON.parse(jsonMatch[1]) as EvidenceRequest;
        if (parsed.type === "EvidenceRequest") {
          return parsed;
        }
      } catch {
        // Not valid JSON, continue to treat as markdown
      }
    }

    // Also check for JSON without code blocks
    const directJsonMatch = responseText.match(/\{[\s\S]*"type"\s*:\s*"EvidenceRequest"[\s\S]*\}/);
    if (directJsonMatch) {
      try {
        const parsed = JSON.parse(directJsonMatch[0]) as EvidenceRequest;
        if (parsed.type === "EvidenceRequest") {
          return parsed;
        }
      } catch {
        // Not valid JSON, continue to treat as markdown
      }
    }

    // Return markdown recommendations
    return responseText;
  } catch (error) {
    // Check if error is non-retryable and convert to AbortError to prevent retries
    if (
      error &&
      typeof error === "object" &&
      "isRetryable" in error &&
      error.isRetryable === false
    ) {
      console.error(
        "⚠️ Non-retryable error detected - converting to AbortError to prevent retries"
      );
      const abortError = new Error(
        `SQL optimization agent failed: ${error instanceof Error ? error.message : String(error)}`,
        { cause: error }
      );
      abortError.name = "AbortError";
      throw abortError;
    }

    console.error("❌ SQL optimization agent failed:", {
      error,
      evidenceContext: evidenceContext ? "provided" : "missing",
    });

    // Re-throw with additional context
    throw new Error(
      `SQL optimization agent failed: ${error instanceof Error ? error.message : String(error)}`,
      {
        cause: error,
      }
    );
  }
}
