import type { DatabaseContext } from "@/components/chat/chat-context";
import { LanguageModelProviderFactory } from "@/lib/ai/llm/llm-provider-factory";
import { CLIENT_TOOL_NAMES, ClientTools as clientTools } from "@/lib/ai/tools/client/client-tools";
import { convertToModelMessages, streamText } from "ai";
import { createGenerateSqlTool, SERVER_TOOL_GENERATE_SQL } from "./sql-generation-agent";
import { createSqlOptimizationTool, SERVER_TOOL_OPTIMIZE_SQL } from "./sql-optimization-agent";
import {
  createGenerateVisualizationTool,
  SERVER_TOOL_GENEREATE_VISUALIZATION,
} from "./visualization-agent";

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
- collect_sql_optimization_evidence: collect ClickHouse evidence for SQL optimization (preferred; returns EvidenceContext).
- optimize_sql: SQL optimization sub-agent that analyzes evidence and provides recommendations. **CRITICAL**: When this tool returns a result starting with "[DIRECT_OUTPUT_REQUIRED:", you MUST output ONLY the content after this marker, exactly as provided, with no modifications whatsoever. Do NOT add any text before or after the content.

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
5) SQL Optimization intent (keywords: "optimize", "slow", "performance", "timeout", "tuning", "optimization")
   → **OPTIMIZATION LANE (Hard Gate)**:
      - **FIRST: Extract SQL/query_id from user's message:**
        * Look for SQL in code blocks: \`\`\`sql ... \`\`\` or \`\`\` ... \`\`\`
        * Look for SQL in plain text after phrases like "this query:", "the query:", "query:", "SQL:", etc.
        * Look for query_id patterns: "query_id abc123", "query_id='abc123'", etc.
        * SQL may appear on the same line or following lines after the optimization request
        * Extract the FULL SQL query including all clauses (SELECT, FROM, WHERE, ORDER BY, LIMIT, etc.)
      
      - **THEN: Check if SQL or query_id was found:**
        * If SQL found in message → Extract it and proceed (treat as having SQL)
        * If query_id found in message → Extract it and proceed (treat as having query_id)
        * If BOTH are missing after extraction → Ask user for SQL or query_id and STOP. (Do NOT call optimize_sql.)
        * If at least one found → Call optimize_sql with:
          * relevant chat slice (which contains the extracted SQL/query_id)
          * EvidenceContext if present; else empty.
          * When calling collect_sql_optimization_evidence, pass the extracted SQL/query_id in the tool input.
   
   → **EVIDENCE COLLECTION LOOP**:
      - If optimize_sql returns a JSON block with type="EvidenceRequest":
        * Call collect_sql_optimization_evidence with its required/optional fields and the extracted sql/query_id from the user's message.
        * Then call optimize_sql again with the returned EvidenceContext.
      - Else: **CRITICAL - PASS THROUGH VERBATIM**: 
        * If the result starts with "[DIRECT_OUTPUT_REQUIRED:", extract and output ONLY the content after this marker, exactly as shown.
        * Otherwise, output the optimize_sql result EXACTLY as returned. 
        * Do NOT rephrase, summarize, add explanations, introductions, or conclusions. 
        * Do NOT add any text like "Here are the recommendations:" or similar. 
        * The sub-agent's response is complete and ready for the user.

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
- **Optimize SQL Output**: 
  * When optimize_sql returns a result starting with "[DIRECT_OUTPUT_REQUIRED:", extract and output ONLY the content after this marker.
  * When optimize_sql returns a final result (markdown string, not EvidenceRequest), you MUST output it verbatim without any changes.
  * Do NOT add prefixes like "Here are..." or "Based on...".
  * Do NOT add suffixes, explanations, or rephrasing.
  * The sub-agent's response is the complete answer and should be the ONLY text you output.

### Final response format
- Brief explanation of what was run in markdown format.
- Results summary (if executed) in markdown format.
- Table names should be fully qualified with backticks around.
- DO NOT repeat or explain the visualization plan if generate_visualization was called. The UI will render it automatically.
- **CRITICAL for optimize_sql**: 
  * When optimize_sql returns a result starting with "[DIRECT_OUTPUT_REQUIRED:", extract and output ONLY the content after this marker, exactly as provided.
  * When optimize_sql returns a final result (not an EvidenceRequest), output it EXACTLY as returned without any modifications, additions, or rephrasing.
  * Do NOT add introductions like "Here are the recommendations:" or similar.
  * Do NOT add conclusions or explanations.
  * The sub-agent's markdown response is complete and ready for the user.

### Self-check
Before final answer: 
- If user asked for visualization and generate_visualization was not called → call generate_visualization.
- If SQL will be used for visualization and validate_sql was not called → call validate_sql first.
- If user asked for optimization and optimize_sql was not called → extract SQL/query_id from user's message first, then call optimize_sql if found.
- **CRITICAL for optimization**: Always extract SQL from user's message before checking if it's missing. SQL may be in code blocks or plain text.
- Do not invent evidence. Do not run execute_sql for benchmarking unless user explicitly asks.
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
      [SERVER_TOOL_GENERATE_SQL]: createGenerateSqlTool(modelConfig, context),
      [SERVER_TOOL_GENEREATE_VISUALIZATION]: createGenerateVisualizationTool(modelConfig),
      [SERVER_TOOL_OPTIMIZE_SQL]: createSqlOptimizationTool(modelConfig, context),
      // Client-side tools (no execute function)
      [CLIENT_TOOL_NAMES.GET_TABLES]: clientTools.get_tables,
      [CLIENT_TOOL_NAMES.GET_TABLE_COLUMNS]: clientTools.get_table_columns,
      [CLIENT_TOOL_NAMES.VALIDATE_SQL]: clientTools.validate_sql,
      [CLIENT_TOOL_NAMES.EXECUTE_SQL]: clientTools.execute_sql,
      [CLIENT_TOOL_NAMES.COLLECT_SQL_OPTIMIZATION_EVIDENCE]:
        clientTools.collect_sql_optimization_evidence,
    },
  });
}
