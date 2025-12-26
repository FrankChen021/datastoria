import { tool } from "ai";
import { z } from "zod";
import type { DatabaseContext } from "../chat/types";
import { isMockMode } from "./llm-provider-factory";
import { sqlSubAgent } from "./sub-agents/sql-sub-agent";
import { mockSqlSubAgent } from "./sub-agents/sql-sub-agent.mock";
import type { ModelConfig } from "./sub-agents/types";
import { vizSubAgent } from "./sub-agents/viz-sub-agent";
import { mockVizSubAgent } from "./sub-agents/viz-sub-agent.mock";

/**
 * Server-Side Tools
 *
 * These tools are executed on the server and can call sub-agents
 * for complex reasoning tasks.
 */

/**
 * Server-side tool names for easy referencing without hardcoded strings
 */
export const SERVER_TOOL_NAMES = {
  GENERATE_SQL: "generate_sql",
  GENEREATE_VISUALIZATION: "generate_visualization",
} as const;

/**
 * Server-side tool: SQL Generation
 * Calls the SQL sub-agent to generate ClickHouse queries
 * @param modelConfig - Model configuration to use for the sub-agent
 * @param context - Database context (user, database, tables, currentQuery) to pass to sub-agent
 */
export function createGenerateSqlTool(modelConfig: ModelConfig, context?: DatabaseContext) {
  return tool({
    description: "Generate ClickHouse SQL query based on user question and schema context",
    inputSchema: z.object({
      userQuestion: z.string().describe("The user's question or data request"),
      schemaHints: z
        .object({
          database: z.string().optional().describe("Current database name"),
          tables: z
            .array(
              z.object({
                name: z.string(),
                columns: z.array(z.string()),
              })
            )
            .optional()
            .describe("Available tables and their columns"),
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
                columns: z.array(z.string()),
              })
            )
            .optional(),
          clickHouseUser: z.string().optional(),
        })
        .optional()
        .describe("Full database context including user, database, tables, and current query"),
      history: z
        .array(
          z.object({
            role: z.string(),
            content: z.string(),
          })
        )
        .optional()
        .describe("Previous turns of the SQL generation/discovery process"),
    }),
    execute: async ({ userQuestion, schemaHints, history, context: providedContext }) => {
      console.log("🔧 generate_sql tool called:", userQuestion);
      console.log("📚 History received:", history ? `${history.length} messages` : "none");
      if (history && history.length > 0) {
        console.log("📜 Last history item:", JSON.stringify(history[history.length - 1]).substring(0, 300));
      }
      // Merge provided context with the one from tool creation (provided context takes precedence)
      const mergedContext: DatabaseContext | undefined = providedContext
        ? { ...context, ...providedContext }
        : context;
      // Use mock sub-agent in mock mode to avoid recursive LLM calls
      const result = isMockMode
        ? await mockSqlSubAgent({ userQuestion, schemaHints, context: mergedContext, history, modelConfig })
        : await sqlSubAgent({ userQuestion, schemaHints, context: mergedContext, history, modelConfig });
      console.log("✅ generate_sql tool result:", result);
      return result;
    },
  });
}

/**
 * Server-side tool: Visualization Planning
 * Calls the viz sub-agent to determine appropriate visualization
 * @param modelConfig - Model configuration to use for the sub-agent
 */
export function createGenerateVisualizationTool(modelConfig: ModelConfig) {
  return tool({
    description: "Analyze query logic and determine the best visualization type",
    inputSchema: z.object({
      userQuestion: z.string().describe("The original user question"),
      sql: z.string().describe("The SQL query to visualize"),
    }),
    execute: async ({ userQuestion, sql }) => {
      console.log("🔧 generate_visualization tool called for SQL:", sql);
      // Use mock sub-agent in mock mode to avoid recursive LLM calls
      const result = isMockMode
        ? await mockVizSubAgent({ userQuestion, sql, modelConfig })
        : await vizSubAgent({ userQuestion, sql, modelConfig });
      console.log("✅ generate_visualization tool result:", result);
      return result;
    },
  });
}
