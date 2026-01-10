import { Output, streamText } from "ai";
import { z } from "zod";
import type { DatabaseContext } from "../../../components/chat/chat-context";
import { ClientTools, type ValidateSqlToolInput } from "../client-tools";
import { LanguageModelProviderFactory } from "../llm/llm-provider-factory";
import type { InputModel } from "./orchestrator-agent";

/**
 * SQL Generation Agent Output Schema
 *
 * Defines the structure of responses from the SQL generation agent
 */
export const sqlSubAgentOutputSchema = z.object({
  sql: z.string().describe("Generated ClickHouse SQL query"),
  notes: z.string().describe("Explanation of the query logic"),
  assumptions: z.array(z.string()).describe("Assumptions made during query generation"),
  needs_clarification: z.boolean().describe("Whether user clarification is needed"),
  questions: z.array(z.string()).describe("Questions for the user if clarification needed"),
});

export type SQLSubAgentOutput = z.infer<typeof sqlSubAgentOutputSchema>;

/**
 * SQL Generation Agent Input
 */
export interface SQLGenerationAgentInput {
  userQuestion: string;
  schemaHints?: {
    database?: string;
    tables?: Array<{ name: string; columns: string[] }>;
  };
  context?: DatabaseContext;
  history?: any[]; // CoreMessage[]
  inputModel: InputModel;
}

/**
 * SQL Generation Agent
 *
 * Specialized agent for generating ClickHouse SQL queries
 * Focuses on:
 * - ClickHouse-specific SQL syntax
 * - Performance optimization (LIMIT, bounded time windows)
 * - System table queries for diagnostics
 */
export async function sqlGenerationAgent(
  input: SQLGenerationAgentInput
): Promise<SQLSubAgentOutput> {
  const { userQuestion, schemaHints, context, history, inputModel: modelConfig } = input;

  if (!modelConfig) {
    throw new Error("modelConfig is required for sqlGenerationAgent");
  }

  // Use model-specific default temperature
  const temperature = LanguageModelProviderFactory.getDefaultTemperature(modelConfig.modelId);

  // Build schema context from schemaHints (for backward compatibility) or context
  const schemaContext = [];
  const database = schemaHints?.database || context?.database;
  const tables = schemaHints?.tables || context?.tables;

  if (database) {
    schemaContext.push(`Current database: ${database}`);
  }
  if (tables && tables.length > 0) {
    schemaContext.push("Available tables:");
    tables.forEach((table) => {
      schemaContext.push(`- ${table.name}: ${table.columns.join(", ")}`);
    });
  }

  // Build user context section with explicit instructions
  const clickHouseUser = context?.clickHouseUser;
  const userContextSection = clickHouseUser
    ? `\n## Current ClickHouse User (CRITICAL - USE THIS FOR USER-RELATED QUERIES)
**Authenticated user: ${clickHouseUser}**

**MANDATORY INSTRUCTIONS FOR USER-RELATED QUERIES:**
- When the user asks about their own data, user permissions, or user-specific information, ALWAYS use "${clickHouseUser}" as the user value
- DO NOT use functions like current_user(), USER(), or any placeholder values
- DO NOT hardcode different usernames or ask for the username
- When filtering by user, use: WHERE user = '${clickHouseUser}' or WHERE username = '${clickHouseUser}' (adjust column name as needed)
- This is the authoritative user identity - use it directly in your SQL queries
- Examples:
  * "Show my queries" → WHERE user = '${clickHouseUser}'
  * "What tables can I access?" → Use ${clickHouseUser} in permission checks
  * "My recent activity" → Filter by user = '${clickHouseUser}'`
    : "";

  // Add current query context if available
  const currentQuerySection = context?.currentQuery
    ? `\n## Current Query Context
The user may be asking about or modifying this existing query:
\`\`\`sql
${context.currentQuery}
\`\`\`
Consider this query when generating the new SQL.`
    : "";

  const systemPromptDiscovery = `You are a ClickHouse SQL expert. Your goal is to generate a SQL query to answer the user's question.

## Requirements
- Generate ONLY valid ClickHouse SQL syntax
- Always use LIMIT clauses for SQL queries which will be executed to fetch data.
- Use bounded time windows for time-series queries (e.g., last 24 hours, last 7 days)
- For performance queries, use system tables: system.query_log, system.processes, system.metrics, etc.
${userContextSection}${currentQuerySection}
## Schema Context
${schemaContext.length > 0 ? schemaContext.join("\n") : "No schema context provided. Generate SQL based on the user question."}

## Validation
- You have access to the \`validate_sql\` tool to verify your SQL syntax.
- **MANDATORY**: Before providing the final SQL, you MUST call \`validate_sql\` to verify its syntax.
- If validation fails, fix the SQL and validate again.
- Only return the final SQL after successful validation.

## Important
- You do NOT have access to schema discovery tools (get_tables, get_table_columns).
- The orchestrator has already gathered all necessary schema information.
- Use the Schema Context provided above to generate the SQL.
- If schema information is missing, note it in your response and return needs_clarification=true.`;

  const systemPromptFinal = `You are a ClickHouse SQL expert. Review the user's question, the discovered schema, and the validation result, then generate the final SQL output in JSON format.

## Requirements
- Generate ONLY valid ClickHouse SQL syntax
- Use LIMIT clauses
- Format SQL with 2-space indentation
- Use full qualified table names (e.g., database.table)
- Ensure the SQL has been validated via \`validate_sql\` in the previous step.
${userContextSection}${currentQuerySection}

## Output Format
1. Return ONLY valid JSON matching this schema:
{
  "sql": "SELECT ... FROM ...",
  "notes": "Explanation of the query logic and what it returns",
  "assumptions": ["assumption 1", "assumption 2"],
  "needs_clarification": false,
  "questions": []
}
2. Don't wrap the JSON in any additional text or formatting.`;

  try {
    // Use provided model config
    const [model] = LanguageModelProviderFactory.createModel(
      modelConfig.provider,
      modelConfig.modelId,
      modelConfig.apiKey
    );

    // Build base messages for processing
    // If history is provided, we assume it contains the full context (including previous tool results)
    // Sanitizing history to ensure it's valid CoreMessage[] for AI SDK
    const sanitizedHistory: any[] =
      history && history.length > 0
        ? history.map((msg, i) => {
            // Handle legacy or mis-formatted tool results
            if (msg.role === "function" || msg.role === "tool") {
              // CoreToolMessage expects content to be an array of ToolResultPart
              // Parse the content if it's a JSON string
              let resultValue = msg.content;
              if (typeof msg.content === "string") {
                try {
                  resultValue = JSON.parse(msg.content);
                } catch {
                  // Keep as string if not valid JSON
                  resultValue = msg.content;
                }
              }

              // Format output according to AI SDK spec
              // output must be {type: 'text'|'json', value: any}
              const output =
                typeof resultValue === "string"
                  ? { type: "text" as const, value: resultValue }
                  : { type: "json" as const, value: resultValue };

              return {
                role: "tool",
                content: [
                  {
                    type: "tool-result",
                    toolCallId: (msg as any).toolCallId || `call_${i}`,
                    toolName: (msg as any).toolName || "unknown_tool",
                    output: output,
                  },
                ],
              };
            }

            // Ensure assistant messages that were results of tool calls are properly marked
            if (
              msg.role === "assistant" &&
              (msg.content?.includes("Performing:") || msg.content?.includes("Action:"))
            ) {
              // If it was a proxy for a tool call, we might need to add a dummy tool_call
              // but for now, let's just leave it as text.
              // The SDK is okay with assistant text followed by tool results if IDs match.
              // To be safe, if the next message is a tool result we just created an ID for,
              // we should probably add a matching tool_call here.
            }

            return msg;
          })
        : [{ role: "user", content: userQuestion }];

    // Handle case where history starts with a tool result (orphan)
    // We must prepend a dummy assistant message that "called" this tool
    if (sanitizedHistory.length > 0 && sanitizedHistory[0].role === "tool") {
      const toolResult = sanitizedHistory[0].content[0];
      sanitizedHistory.unshift({
        role: "assistant",
        content: [
          { type: "text", text: "Resuming conversation..." },
          {
            type: "tool-call",
            toolCallId: toolResult.toolCallId,
            toolName: toolResult.toolName,
            args: {},
          },
        ],
      });
    }

    // Re-align IDs for tool call/result pairs if necessary
    for (let i = 0; i < sanitizedHistory.length - 1; i++) {
      if (sanitizedHistory[i].role === "assistant" && sanitizedHistory[i + 1].role === "tool") {
        const toolResult = sanitizedHistory[i + 1].content[0];

        // Construct the tool-call part to append to the assistant message
        const toolCallPart = {
          type: "tool-call",
          toolCallId: toolResult.toolCallId,
          toolName: toolResult.toolName,
          args: {},
        };

        // Convert content to array if it's a string, or append if it's already an array
        if (typeof sanitizedHistory[i].content === "string") {
          sanitizedHistory[i].content = [
            { type: "text", text: sanitizedHistory[i].content || "" },
            toolCallPart,
          ];
        } else if (Array.isArray(sanitizedHistory[i].content)) {
          // Check if tool call already exists to avoid duplication
          const exists = sanitizedHistory[i].content.some(
            (p: any) => p.type === "tool-call" && p.toolCallId === toolResult.toolCallId
          );
          if (!exists) {
            sanitizedHistory[i].content.push(toolCallPart);
          }
        }

        // Ensure no conflicting toolCalls property exists
        if (sanitizedHistory[i].toolCalls) {
          delete sanitizedHistory[i].toolCalls;
        }
      }
    }

    const messages: any[] = sanitizedHistory;

    // Step 1: Processing (Validation only - orchestrator handles schema discovery)
    // Use streamText instead of generateText to avoid proxy timeouts
    const processResult = streamText({
      model,
      messages: [{ role: "system", content: systemPromptDiscovery }, ...messages],
      tools: {
        // Only validation tool - NO schema discovery tools
        validate_sql: ClientTools.validate_sql,
      },
      temperature,
    });

    // Wait for the stream to complete and get the last step
    const allSteps = await processResult.steps;
    const processStep = allSteps[allSteps.length - 1];

    // If the model requested validation, communicate back to orchestrator
    if (processStep.toolCalls && processStep.toolCalls.length > 0) {
      return {
        // Return the generated SQL to client for observability
        sql: (processStep.toolCalls[0].input as ValidateSqlToolInput).sql,
        notes: "I am currently validating syntax of the generated SQL.",
        assumptions: [],
        needs_clarification: false,
        questions: ["Performing: validating SQL syntax"],
      };
    }

    // Step 2: Final JSON generation
    // Use streamText instead of generateText to avoid proxy timeouts
    const result = streamText({
      model,
      output: Output.object({
        schema: sqlSubAgentOutputSchema,
      }),
      messages: [
        { role: "system", content: systemPromptFinal },
        ...messages,
        { role: "assistant", content: processStep.text },
      ],
      temperature,
    });

    // Wait for the complete validated output from the stream
    const validated = await result.output;

    return validated;
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
      const abortError = new Error(error instanceof Error ? error.message : String(error), {
        cause: error,
      });
      abortError.name = "AbortError";
      throw abortError;
    }

    console.error("❌ SQL generation agent execution or validation error:", error);

    // Fallback response for errors
    return {
      sql: "",
      notes: "An error occurred while generating or validating the SQL query structure.",
      assumptions: [],
      needs_clarification: true,
      questions: ["Could you try asking your question again?"],
    };
  }
}
