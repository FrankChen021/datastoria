import type { DatabaseContext } from "@/components/chat/chat-context";
import { CLIENT_TOOL_NAMES, ClientTools as clientTools } from "@/lib/ai/client-tools";
import { LanguageModelProviderFactory } from "@/lib/ai/llm/llm-provider-factory";
import { convertToModelMessages, streamText } from "ai";
import {
  createGenerateSqlTool,
  createGenerateVisualizationTool,
  SERVER_TOOL_NAMES,
} from "./server-tools";

/**
 * Model Configuration
 */
export interface InputModel {
  provider: string;
  modelId: string;
  apiKey: string;
}

/**
 * Build system prompt for ClickHouse SQL assistance
 * Provides context about available tables, current query, and instructions
 */
function buildSystemPrompt(context?: DatabaseContext): string {
  try {
    const sections: string[] = [];

    // Base instructions
    sections.push(`You are an AI assistant specialized in ClickHouse SQL.

Your role:
- Generate valid ClickHouse SQL queries
- Explain SQL errors and suggest fixes
- Optimize query performance
- Answer questions about ClickHouse features

Requirements:
- Generate syntactically correct ClickHouse SQL only
- Use proper table/column names from the schema
- Include comments for complex queries
- Consider query performance implications
- Answer in markdown with SQL in code blocks`);

    // Add current query context
    if (context?.currentQuery) {
      sections.push(`\n## Current Query\n\`\`\`sql\n${context.currentQuery}\n\`\`\``);
    }

    // Add database context
    if (context?.database) {
      sections.push(`\n## Current Database\n${context.database}`);
    }

    // Add ClickHouse user context with explicit instructions
    if (context?.clickHouseUser) {
      sections.push(`\n## ClickHouse User (CRITICAL)
Current authenticated user: **${context.clickHouseUser}**

**MANDATORY**: When generating queries related to users, user permissions, or user-specific data:
- ALWAYS use the current user "${context.clickHouseUser}" provided above
- DO NOT use placeholder values like "current_user()", "USER()", or hardcoded usernames
- DO NOT ask the user for their username - use "${context.clickHouseUser}" from the context
- When filtering by user, use: WHERE user = '${context.clickHouseUser}' or similar user-specific filters
- This user information is authoritative and must be used for all user-related queries`);
    }

    // Add table schema context
    if (context?.tables && Array.isArray(context.tables) && context.tables.length > 0) {
      console.log("🔍 Processing tables:", context.tables.length);
      sections.push(`\n## Available Tables (AUTHORITATIVE)
The following table schemas are provided for your immediate use. Use these instead of calling tools if the table you need is listed here.`);

      context.tables.forEach((table, index) => {
        try {
          console.log(`🔍 Processing table ${index}:`, {
            name: table?.name,
            columnsCount: table?.columns?.length,
          });
          if (table && typeof table.name === "string" && Array.isArray(table.columns)) {
            sections.push(`\n### ${table.name}`);
            sections.push(`Columns: ${table.columns.join(", ")}`);

            if (table.totalColumns && table.totalColumns > table.columns.length) {
              const remaining = table.totalColumns - table.columns.length;
              sections.push(
                `\n*(Note: This table has ${remaining} more columns available. If you need a column not listed above, call "get_table_columns" for this table.)*`
              );
            }
          } else {
            console.warn(`⚠️ Skipping invalid table ${index}:`, table);
          }
        } catch (tableError) {
          console.error(`❌ Error processing table ${index}:`, tableError, { table });
        }
      });
    }

    // Add current date/time for temporal queries
    sections.push(`\n## Current Date/Time\n${new Date().toISOString()}`);

    const result = sections.join("\n");
    return result;
  } catch (error) {
    console.error("❌ Error in buildSystemPrompt:", error, { context });
    // Return a basic prompt as fallback
    return `You are an AI assistant specialized in ClickHouse SQL.
Generate valid ClickHouse SQL queries and answer questions about ClickHouse features.`;
  }
}

/**
 * Build orchestrator prompt for tool routing
 * Extends the base system prompt with orchestrator-specific routing instructions
 */
function buildOrchestratorPrompt(baseSystemPrompt: string): string {
  return `${baseSystemPrompt}
## ClickHouse Orchestrator (Tool-Routing Contract)

You route requests to tools and MUST follow these rules.

### Tools
- generate_sql: generates ClickHouse SQL. This tool performs its own multi-turn logic for schema discovery and validation.
- validate_sql: validate syntax and correctness of a SQL query.
- execute_sql: execute ClickHouse query to fetch data.
- generate_visualization: produce a visualization plan (based on SQL and intent).
- get_tables: list tables.
- get_table_columns: list columns. **IMPORTANT**: When calling this tool, always split fully qualified table names (e.g., "system.metric_log") into separate database and table fields: {database: "system", table: "metric_log"}.

### Routing (STRICT)
1) Visualization intent (any of: "visualize", "chart", "plot", "graph", "timeseries", "timeseries chart", "time series", "time series chart", "trend", "over time")
   → **WORKFLOW**:
      a) If schema info needed: 
         - **FIRST**: Check if the table schema is already in the "Available Tables" context.
         - **ONLY IF NOT FOUND**: call get_table_columns or get_tables.
      b) Generate or obtain SQL:
         - If SQL exists in context: use it
         - Otherwise: call generate_sql with schema context
      c) **VALIDATION (MANDATORY)**: Call validate_sql with the SQL before visualization
      d) After validation passes: call generate_visualization with the validated SQL
      e) Optionally: call execute_sql if data needs to be fetched
2) Schema questions
   → **FIRST**: Check "Available Tables" in context. If found, Answer using context.
   → **OTHERWISE**: get_tables / get_table_columns (no SQL execution unless asked).
3) "How-to" / SQL Examples (e.g., "how can I...", "write a query to...", "what is the syntax for...")
   → **WORKFLOW**:
      a) Identify schema if needed:
         - **FIRST**: Check if the table schema is already in the "Available Tables" context.
         - **ONLY IF NOT FOUND**: call get_tables/get_table_columns.
      b) generate_sql
      c) **VALIDATION (MANDATORY)**: validate_sql
      d) **STOP**: Present the validated SQL. DO NOT execute_sql unless the user explicitly added "and run it" or "fetch the results".
4) Data Retrieval (e.g., "show me...", "list...", "get...", "run...", "fetch...", "what are...")
   → **WORKFLOW**:
      a) If schema info needed:
         - **FIRST**: Check if the table schema is already in the "Available Tables" context.
         - **ONLY IF NOT FOUND**: call get_table_columns or get_tables.
      b) Once you have schema: call generate_sql with the schema context
      c) **VALIDATION (MANDATORY)**: Call validate_sql with the generated SQL (whether from generate_sql or yourself)
      d) After validation passes: call execute_sql
      e) If visualization requested: call generate_visualization with the validated SQL

### Constraints (MANDATORY)
- **Schema Discovery**: ALWAYS check "Available Tables" context before calling "get_table_columns" or "get_tables".
- **SQL Generation**: Call generate_sql ONLY after you have the necessary schema context (either from "Available Tables" or from tools).
- **User Information**: When calling generate_sql for user-related queries, ensure the current ClickHouse user from the context is used. Pass the clickHouseUser to generate_sql when the query involves users, permissions, or user-specific data.
- **Validation**: Any SQL query intended for execution or presentation MUST be validated using validate_sql first.
- **SQL Execution**: Only execute SQL after validate_sql returns success.
- **Visualization Integration**: 
  * Call validate_sql BEFORE generate_visualization (MANDATORY)
  * Call generate_visualization ONLY after SQL validation succeeds
  * Pass the validated SQL string to generate_visualization
- You MUST NOT describe a visualization without calling generate_visualization.
- If a SQL query is present in context, you MUST still validate it before using it for visualization.
- generate_visualization should be called with the SQL string, NOT wait for execute_sql results.

### Final response format
- Brief explanation of what was run in markdown format.
- Results summary (if executed) in markdown format.
- Table names should be fully qualified with backticks around.
- DO NOT repeat or explain the visualization plan if generate_visualization was called. The UI will render it automatically.

### Self-check
Before final answer: 
- If user asked for visualization and generate_visualization was not called → call generate_visualization.
- If SQL will be used for visualization and validate_sql was not called → call validate_sql first.
`;
}

/**
 * Orchestrator Agent
 *
 * Creates and configures the main orchestrator agent that coordinates
 * between SQL generation, visualization planning, and client-side tools.
 *
 * @param messages - The conversation messages (UI format)
 * @param modelConfig - Model configuration to use for the orchestrator and sub-agents
 * @param context - Database context (user, database, tables, currentQuery)
 * @returns The streamText result for further processing
 */
export async function createOrchestratorAgent({
  messages,
  modelConfig,
  context,
}: {
  messages: unknown[];
  modelConfig: InputModel;
  context: DatabaseContext | undefined;
}) {
  // Create the model instance
  const [model, modelProps] = LanguageModelProviderFactory.createModel(
    modelConfig.provider,
    modelConfig.modelId,
    modelConfig.apiKey
  );

  // Check if we're using a free model (more likely to hit 429 rate limits)
  // For free models, set maxRetries to 0 to prevent retries on 429 errors
  const maxRetries = modelProps.free === true ? 0 : undefined; // undefined uses default (2), 0 disables retries

  // Build orchestrator system prompt
  const baseSystemPrompt = buildSystemPrompt(context);
  const orchestratorPrompt = buildOrchestratorPrompt(baseSystemPrompt);

  // Convert UIMessages to ModelMessages
  const modelMessages = await convertToModelMessages(messages);

  // Use streamText with all tools (both server-side and client-side)
  // For free models, maxRetries is set to 0 to prevent retries on 429 rate limit errors
  return streamText({
    model,
    maxRetries,
    messages: [
      {
        role: "system",
        content: orchestratorPrompt,
      },
      ...modelMessages,
    ],
    tools: {
      // Server-side tools (created with model config to ensure sub-agents use the same model)
      // Pass full context to ensure all context information (user, database, tables, currentQuery) is available
      [SERVER_TOOL_NAMES.GENERATE_SQL]: createGenerateSqlTool(modelConfig, context),
      [SERVER_TOOL_NAMES.GENEREATE_VISUALIZATION]: createGenerateVisualizationTool(modelConfig),
      // Client-side tools (no execute function)
      [CLIENT_TOOL_NAMES.GET_TABLES]: clientTools.get_tables,
      [CLIENT_TOOL_NAMES.GET_TABLE_COLUMNS]: clientTools.get_table_columns,
      [CLIENT_TOOL_NAMES.VALIDATE_SQL]: clientTools.validate_sql,
      [CLIENT_TOOL_NAMES.EXECUTE_SQL]: clientTools.execute_sql,
    },
  });
}
