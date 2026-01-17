import { streamText } from "ai";
import type { ServerDatabaseContext } from "../common-types";
import { LanguageModelProviderFactory } from "../llm/llm-provider-factory";
import { ClientTools as clientTools } from "../tools/client/client-tools";
import type { InputModel } from "./planner-agent";
import { createGenerateSqlTool, SERVER_TOOL_GENERATE_SQL } from "./sql-generation-agent";

/**
 * General Agent
 *
 * Handles greetings, general ClickHouse questions, and off-topic requests.
 * Does not have tool access by default to keep it simple and safe.
 */
export async function createGeneralAgent({
  messages,
  modelConfig,
  context,
}: {
  messages: any[];
  modelConfig: InputModel;
  context?: ServerDatabaseContext;
}) {
  const [model] = LanguageModelProviderFactory.createModel(
    modelConfig.provider,
    modelConfig.modelId,
    modelConfig.apiKey
  );

  const systemPrompt = `You are a helpful ClickHouse Assistant.
Your goal is to answer questions about ClickHouse, help with greetings, or explain what you can do.

If the user asks about specific tables, the current schema, or requests DATA (counts, lists, specific rows, partition distribution, storage layout), use the tools provided to look up information.

Capabilities:
1. Answer "how-to" questions about ClickHouse features.
2. Explain ClickHouse concepts (MergeTree, Materialized Views, etc.) in the abstract.
3. Discover table schemas using 'get_tables' and 'explore_schema'.
4. Perform Data Retrieval and analyze table state/metadata.
5. Handle greetings and general conversation.

**Data Retrieval Workflow (STRICT)**:
If the user asks for data or metadata (e.g., "how many rows in @table", "partition distribution of @table", "list active queries"):
a) **Schema Discovery**: If you don't know the table schema, call 'explore_schema' or 'get_tables' first.
b) **SQL Generation**: Use the 'generate_sql' tool with the schema context to get a valid ClickHouse query.
c) **Validation**: ALWAYS call 'validate_sql' with the generated SQL before executing it.
d) **Execution**: Call 'execute_sql' with the validated SQL to fetch the results.
e) **Final Answer**: Present the results to the user in a clear markdown format.

Guidelines:
- If a user mentions a table (e.g., @table_name), call 'explore_schema' to see its structure before answering.
- For complex SQL generation (new analytics) or optimization, the orchestrator might route those to specialized agents, but you are the primary entry point for general questions.
- Respond in a professional, helpful tone. Use markdown for formatting.
`;

  return streamText({
    model,
    messages: [
      {
        role: "system",
        content: systemPrompt,
      },
      ...messages,
    ],
    tools: {
      get_tables: clientTools.get_tables,
      explore_schema: clientTools.explore_schema,
      [SERVER_TOOL_GENERATE_SQL]: createGenerateSqlTool(modelConfig, context),
      validate_sql: clientTools.validate_sql,
      execute_sql: clientTools.execute_sql,
    },
  });
}
