import type { DatabaseContext } from "../chat/types";

/**
 * Build system prompt for ClickHouse SQL assistance
 * Provides context about available tables, current query, and instructions
 */
export function buildSystemPrompt(context?: DatabaseContext): string {
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
- Format SQL with 2-space indentation
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
      sections.push(`\n## Available Tables`);

      context.tables.forEach((table, index) => {
        try {
          console.log(`🔍 Processing table ${index}:`, { name: table?.name, columnsCount: table?.columns?.length });
          if (table && typeof table.name === "string" && Array.isArray(table.columns)) {
            sections.push(`\n### ${table.name}`);
            sections.push(`Columns: ${table.columns.join(", ")}`);
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
export function buildOrchestratorPrompt(baseSystemPrompt: string): string {
  return `${baseSystemPrompt}
## ClickHouse Orchestrator (Tool-Routing Contract)

You route requests to tools and MUST follow these rules.

### Tools
- generate_sql: generates ClickHouse SQL. This tool performs its own multi-turn logic for schema discovery and validation.
- execute_sql: execute ClickHouse query to fetch data.
- generate_visualization: produce a visualization plan (based on SQL and intent).
- get_tables: list tables.
- get_table_columns: list columns. **IMPORTANT**: When calling this tool, always split fully qualified table names (e.g., "system.metric_log") into separate database and table fields: {database: "system", table: "metric_log"}.

### Routing (STRICT)
1) Visualization intent (any of: "visualize", "chart", "plot", "graph", "time series", "trend", "over time")
   → MUST call generate_visualization.
2) Schema questions
   → get_tables / get_table_columns (no SQL execution unless asked).
3) Data results requests (e.g., "show me", "list", "what are")
   → **WORKFLOW**:
      a) If schema info needed: call get_table_columns or get_tables
      b) Once you have schema: call generate_sql with the schema context
      c) If generate_sql returns 'needs_clarification' with "validating SQL syntax":
         → Call validate_sql with the SQL being validated
      d) After validation passes: call execute_sql
      e) If visualization requested: call generate_visualization

### Constraints (MANDATORY)
- **Schema Discovery**: YOU handle schema discovery (get_tables, get_table_columns).
- **SQL Generation**: Call generate_sql ONLY after you have the necessary schema context.
- **User Information**: When calling generate_sql for user-related queries, ensure the current ClickHouse user from the context is used. Pass the clickHouseUser to generate_sql when the query involves users, permissions, or user-specific data.
- **Validation Support**: If generate_sql needs validation, YOU call validate_sql and pass results back.
- **SQL Execution**: Only execute SQL after successful validation.
- **Visualization Integration**: Call generate_visualization ONLY when SQL is available.
- You MUST NOT describe a visualization without calling generate_visualization.
- If a SQL query is present in context, reuse it (do NOT call generate_sql).
- generate_visualization should be called with the SQL string, NOT wait for execute_sql results.

### Final response format
- Brief explanation of what was run in markdown format.
- Results summary (if executed) in markdown format.
- DO NOT repeat or explain the visualization plan if generate_visualization was called. The UI will render it automatically.

### Self-check
Before final answer: if user asked for visualization and generate_visualization was not called → call generate_visualization.
`;
}

