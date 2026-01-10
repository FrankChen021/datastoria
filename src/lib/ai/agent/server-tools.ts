import { tool } from "ai";
import { z } from "zod";
import type { DatabaseContext } from "../../../components/chat/chat-context";
import { isMockMode } from "../llm/llm-provider-factory";
import type { InputModel } from "./orchestrator-agent";
import { sqlGenerationAgent } from "./sql-generation-agent";
import { mockSqlGenerationAgent } from "./sql-generation-agent.mock";
import { visualizationAgent } from "./visualization-agent";
import { mockVisualizationAgent } from "./visualization-agent.mock";

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
 * @param inputModel - Model configuration to use for the sub-agent
 * @param context - Database context (user, database, tables, currentQuery) to pass to sub-agent
 */
export function createGenerateSqlTool(inputModel: InputModel, context?: DatabaseContext) {
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
      // Merge provided context with the one from tool creation (provided context takes precedence)
      const mergedContext: DatabaseContext | undefined = providedContext
        ? { ...context, ...providedContext }
        : context;
      // Use mock generation agent in mock mode to avoid recursive LLM calls
      const result = isMockMode
        ? await mockSqlGenerationAgent({
            userQuestion,
            schemaHints,
            context: mergedContext,
            history,
            inputModel: inputModel,
          })
        : await sqlGenerationAgent({
            userQuestion,
            schemaHints,
            context: mergedContext,
            history,
            inputModel: inputModel,
          });
      return result;
    },
  });
}

/**
 * Server-side tool: Visualization Planning
 * Calls the visualization agent to determine appropriate visualization
 * @param inputModel - Model configuration to use for the agent
 */
export function createGenerateVisualizationTool(inputModel: InputModel) {
  return tool({
    description: "Analyze query logic and determine the best visualization type",
    inputSchema: z.object({
      userQuestion: z.string().describe("The original user question"),
      sql: z.string().describe("The SQL query to visualize"),
    }),
    execute: async ({ userQuestion, sql }) => {
      const result = isMockMode
        ? await mockVisualizationAgent({ userQuestion, sql, inputModel: inputModel })
        : await visualizationAgent({ userQuestion, sql, inputModel: inputModel });
      return result;
    },
  });
}
