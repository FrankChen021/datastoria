import type { ChatContext } from "../chat/types";

/**
 * Build system prompt for ClickHouse SQL assistance
 * Provides context about available tables, current query, and instructions
 */
export function buildSystemPrompt(context?: ChatContext): string {
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
