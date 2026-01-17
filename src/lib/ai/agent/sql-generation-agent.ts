import { Output, streamText, tool, type ModelMessage } from "ai";
import { z } from "zod";
import type { ServerDatabaseContext } from "../common-types";
import { isMockMode, LanguageModelProviderFactory } from "../llm/llm-provider-factory";
import { ClientTools as clientTools } from "../tools/client/client-tools";
import type { InputModel } from "./planner-agent";
import { mockSqlGenerationAgent } from "./sql-generation-agent.mock";

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
 * Server-side tool name for SQL generation
 */
export const SERVER_TOOL_GENERATE_SQL = "generate_sql" as const;

/**
 * Build user context section for SQL generation prompts
 */
function buildUserContextSection(context?: ServerDatabaseContext): string {
  const clickHouseUser = context?.clickHouseUser;
  if (!clickHouseUser) return "";

  return `\n## Current ClickHouse User (CRITICAL - USE THIS FOR USER-RELATED QUERIES)
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
  * "My recent activity" → Filter by user = '${clickHouseUser}'`;
}

/**
 * Build current query context section for SQL generation prompts
 */
function buildCurrentQuerySection(context?: ServerDatabaseContext): string {
  if (!context?.currentQuery) return "";

  return `\n## Current Query Context
The user may be asking about or modifying this existing query:
\`\`\`sql
${context.currentQuery}
\`\`\`
Consider this query when generating the new SQL.`;
}

/**
 * Build SQL generation system prompt with shared logic
 * Returns both the prompt and context sections for reuse
 */
function buildSqlGenerationPrompt({
  context,
  schemaHints,
  previousValidationError,
  allowSchemaDiscovery = false,
  includeValidationInstructions = true,
}: {
  context?: ServerDatabaseContext;
  schemaHints?: {
    database?: string;
    tables?: Array<{
      name: string;
      columns: Array<{ name: string; type: string }>;
    }>;
  };
  previousValidationError?: string;
  allowSchemaDiscovery?: boolean;
  includeValidationInstructions?: boolean;
}): {
  prompt: string;
  userContextSection: string;
  currentQuerySection: string;
} {
  // Build schema context from schemaHints (for backward compatibility) or context
  const schemaContext = [];
  const database = schemaHints?.database || context?.database;
  // Use schemaHints tables if available (has type info), otherwise fall back to context tables (string[] format)
  const tables =
    schemaHints?.tables ||
    (context?.tables as Array<{ name: string; columns: string[] }> | undefined);

  if (database) {
    schemaContext.push(`Current database: ${database}`);
  }
  if (tables && tables.length > 0) {
    schemaContext.push("Available tables:");
    tables.forEach((table) => {
      // Handle both old format (string[]) and new format (Array<{name, type}>)
      const columnList =
        table.columns.length > 0 && typeof table.columns[0] === "string"
          ? (table.columns as unknown as string[]).join(", ")
          : (table.columns as unknown as Array<{ name: string; type: string }>)
              .map((col) => `${col.name} (${col.type})`)
              .join(", ");
      schemaContext.push(`- ${table.name}: ${columnList}`);
    });
  }

  // Build context sections using shared helpers
  const userContextSection = buildUserContextSection(context);
  const currentQuerySection = buildCurrentQuerySection(context);

  // Add validation error context if this is a retry
  const validationErrorSection = previousValidationError
    ? `\n## Previous Validation Error (CRITICAL - FIX THIS)
A previous SQL generation attempt failed validation with this error:
${previousValidationError}

**MANDATORY**: You MUST fix the SQL to address this error. Analyze the error carefully:
- Check table/column names if the error mentions "does not exist" or "unknown"
- Fix syntax errors if the error mentions syntax issues
- Adjust ClickHouse-specific syntax if needed
- Verify the schema context matches the tables/columns you're using
- If the error mentions enum values (e.g., "maybe you meant: ['MutatePart']"), check the column type in the schema context and use the exact enum value shown there

Generate a corrected SQL query that will pass validation.`
    : "";

  const schemaDiscoverySection = allowSchemaDiscovery
    ? `\n## Schema Discovery
- You have access to schema discovery tools: 'get_tables' and 'get_table_columns'.
- If you need schema information that's not provided, use these tools to discover it.
- Call 'get_tables' to list available tables in a database.
- Call 'get_table_columns' to get detailed column information for a specific table.`
    : `\n## Important
- You do NOT have access to schema discovery tools (get_tables, get_table_columns).
- The orchestrator has already gathered all necessary schema information.
- Use the Schema Context provided above to generate the SQL.
- If schema information is missing, note it in your response and return needs_clarification=true.`;

  const validationSection = includeValidationInstructions
    ? `\n## Validation
- You have access to the \`validate_sql\` tool to verify your SQL syntax.
- **MANDATORY**: Before providing the final SQL, you MUST call \`validate_sql\` to verify its syntax.
- **RETRY LOGIC**: If validation fails, you MUST retry up to 3 times:
  1. Analyze the validation error message carefully
  2. Fix the SQL query based on the error (e.g., correct syntax, fix table/column names, adjust ClickHouse-specific syntax)
  3. Call 'validate_sql' again with the corrected SQL
  4. Repeat this process up to 3 total attempts
  5. Only if all 3 attempts fail, return needs_clarification=true and explain the error to the user
- Only return the final SQL after successful validation (after any successful attempt within the 3 retries).`
    : "";

  return {
    prompt: `You are a ClickHouse SQL expert. Your goal is to generate a SQL query to answer the user's question.

## Requirements
- Generate ONLY valid ClickHouse SQL syntax
- Always use LIMIT clauses for SQL queries which will be executed to fetch data.
- Use bounded time windows for time-series queries (e.g., last 24 hours, last 7 days)
- For performance queries, use system tables: system.query_log, system.processes, system.metrics, etc.
- **CRITICAL**: Do NOT include a trailing semicolon (;) at the end of SQL queries. The SQL should end without any semicolon.
- **Enum Column Filtering**: When filtering by columns with enum types, you MUST:
  * Check the schema context to find the exact enum values for that column (the column type will show the enum definition, e.g., Enum8('MutatePart' = 1, 'MergePart' = 2))
  * Use the exact enum literal value as shown in the column type definition - enum values are CASE-SENSITIVE
  * Do NOT guess enum values or use variations - only use values that appear in the enum type definition
${userContextSection}${currentQuerySection}${validationErrorSection}
## Schema Context
${schemaContext.length > 0 ? schemaContext.join("\n") : "No schema context provided. Generate SQL based on the user question."}
${schemaDiscoverySection}${validationSection}`,
    userContextSection,
    currentQuerySection,
  };
}

/**
 * Server-side tool: SQL Generation
 * Calls the SQL sub-agent to generate ClickHouse queries
 * @param inputModel - Model configuration to use for the sub-agent
 * @param context - Database context (user, database, tables, currentQuery) to pass to sub-agent
 */
export function createGenerateSqlTool(inputModel: InputModel, context?: ServerDatabaseContext) {
  return tool({
    description: "Generate ClickHouse SQL query based on user question and schema context",
    inputSchema: z.object({
      userQuestion: z.string().describe("The user's question or data request"),
      previousValidationError: z
        .string()
        .optional()
        .describe(
          "If this is a retry after validation failure, include the validation error message here to help fix the SQL"
        ),
      schemaHints: z
        .object({
          database: z.string().optional().describe("Current database name"),
          tables: z
            .array(
              z.object({
                name: z.string(),
                columns: z.array(
                  z.object({
                    name: z.string(),
                    type: z.string(),
                  })
                ),
              })
            )
            .optional()
            .describe("Available tables and their columns with types"),
        })
        .optional()
        .describe("Schema context to help generate accurate SQL"),
      context: z
        .object({
          currentQuery: z.string().optional(),
          database: z.string().optional(),
          tables: z
            .array(
              z.object({
                name: z.string(),
                columns: z.array(
                  z.object({
                    name: z.string(),
                    type: z.string(),
                  })
                ),
              })
            )
            .optional(),
          clickHouseUser: z.string().optional(),
        })
        .optional()
        .describe("Full database context including user, database, tables, and current query"),
    }),
    execute: async ({
      userQuestion,
      previousValidationError,
      schemaHints,
      context: providedContext,
    }) => {
      // Merge provided context with the one from tool creation (provided context takes precedence)
      // Note: providedContext may have new format with column types, but ServerDatabaseContext expects string[]
      // We'll pass it through and handle the conversion in buildSqlGenerationPrompt
      const mergedContext = providedContext
        ? ({ ...context, ...providedContext } as ServerDatabaseContext)
        : context;
      // Use mock generation agent in mock mode to avoid recursive LLM calls
      const result = isMockMode
        ? await mockSqlGenerationAgent({
            userQuestion,
            previousValidationError,
            schemaHints,
            context: mergedContext,
            inputModel: inputModel,
          })
        : await sqlGenerationAgent({
            userQuestion,
            previousValidationError,
            schemaHints,
            context: mergedContext,
            inputModel: inputModel,
          });
      return result;
    },
  });
}

/**
 * SQL Generation Agent Input
 */
export interface SQLGenerationAgentInput {
  userQuestion: string;
  previousValidationError?: string;
  schemaHints?: {
    database?: string;
    tables?: Array<{
      name: string;
      columns: Array<{ name: string; type: string }>;
    }>;
  };
  context?: ServerDatabaseContext;
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
 *
 * Note: This agent generates SQL without validation. Validation is handled externally
 * by the caller (e.g., when used as a tool via createGenerateSqlTool).
 */
export async function sqlGenerationAgent(
  input: SQLGenerationAgentInput
): Promise<SQLSubAgentOutput> {
  const {
    userQuestion,
    previousValidationError,
    schemaHints,
    context,
    inputModel: modelConfig,
  } = input;

  if (!modelConfig) {
    throw new Error("modelConfig is required for sqlGenerationAgent");
  }

  // Use model-specific default temperature
  const temperature = LanguageModelProviderFactory.getDefaultTemperature(modelConfig.modelId);

  // Build shared system prompt (no validation instructions, no schema discovery)
  // Add JSON output format instructions to the prompt
  const { prompt: basePrompt } = buildSqlGenerationPrompt({
    context,
    schemaHints,
    previousValidationError,
    allowSchemaDiscovery: false,
    includeValidationInstructions: false, // Always generate un-validated SQL
  });

  const systemPrompt = `${basePrompt}

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
    const messages = [{ role: "user" as const, content: userQuestion }];

    // Generate SQL directly without validation (no validate_sql tool)
    const result = streamText({
      model,
      output: Output.object({
        schema: sqlSubAgentOutputSchema,
      }),
      messages: [{ role: "system", content: systemPrompt }, ...messages],
      temperature,
    });

    // Wait for the complete output from the stream
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

/**
 * Streaming SQL Generation Agent
 *
 * For use in the Two-Call Dispatcher pattern.
 */
export async function streamSqlGeneration({
  messages,
  modelConfig,
  context,
}: {
  messages: ModelMessage[];
  modelConfig: InputModel;
  context?: ServerDatabaseContext;
}) {
  const [model] = LanguageModelProviderFactory.createModel(
    modelConfig.provider,
    modelConfig.modelId,
    modelConfig.apiKey
  );

  const temperature = LanguageModelProviderFactory.getDefaultTemperature(modelConfig.modelId);

  // Build shared system prompt (standalone mode: with schema discovery and validation)
  const { prompt: basePrompt } = buildSqlGenerationPrompt({
    context,
    allowSchemaDiscovery: true,
    includeValidationInstructions: true, // Include validation for standalone agent
  });

  // Add output format constraints for markdown output
  const systemPrompt = `${basePrompt}

## Output Format
- Present your final SQL query in a markdown code block with \`\`\`sql syntax highlighting
- Example format:
\`\`\`sql
SELECT * FROM table
WHERE condition = 'value'
LIMIT 10
\`\`\`
- Include a brief explanation before or after the SQL code block
- Use markdown formatting for clarity and readability`;

  return streamText({
    model,
    messages: [{ role: "system", content: systemPrompt }, ...messages],
    tools: {
      get_tables: clientTools.get_tables,
      get_table_columns: clientTools.get_table_columns,
      validate_sql: clientTools.validate_sql,
    },
    temperature,
  });
}
