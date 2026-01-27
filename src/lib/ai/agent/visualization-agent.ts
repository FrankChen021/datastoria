import { Output, streamText, tool, type ModelMessage } from "ai";
import { z } from "zod";
import type { ServerDatabaseContext } from "../common-types";
import { isMockMode, LanguageModelProviderFactory } from "../llm/llm-provider-factory";
import { ClientTools as clientTools } from "../tools/client/client-tools";
import type { InputModel } from "./planner-agent";
import { createGenerateSqlTool, SERVER_TOOL_GENERATE_SQL } from "./sql-generation-agent";
import { mockVisualizationAgent } from "./visualization-agent.mock";

/**
 * Visualization Agent Input
 */
export interface VisualizationAgentInput {
  userQuestion: string;
  sql: string;
  inputModel: InputModel;
}

/**
 * Visualization Agent Output Schema
 *
 * Defines the structure for visualization intent
 * Matches TimeseriesDescriptor and TableDescriptor from dashboard-model.ts
 *
 * The 'query' property is not included as it's included in the following visualizationAgentCompleteOutputSchema
 */
export const visualizationAgentOutputSchema = z.object({
  type: z.enum(["line", "bar", "area", "pie", "table", "none"]).describe("Visualization type"),
  titleOption: z
    .object({
      title: z.string(),
      align: z.enum(["left", "center", "right"]),
    })
    .optional()
    .describe("Chart title configuration"),
  width: z.number().min(1).max(12).optional().describe("Grid width (1-12)"),
  legendOption: z
    .object({
      placement: z.enum(["none", "bottom", "right", "inside"]),
      values: z
        .array(z.enum(["min", "max", "sum", "avg", "count"]))
        .optional()
        .describe('Statistics to show in legend (e.g., ["min", "max", "sum"])'),
    })
    .optional()
    .describe("Legend configuration"),
  labelOption: z
    .object({
      show: z.boolean().optional(),
      format: z.enum(["name", "value", "percent", "name-value", "name-percent"]).optional(),
    })
    .optional()
    .describe("Label configuration for pie charts"),
  valueFormat: z
    .enum([
      "short_number",
      "comma_number",
      "binary_size",
      "percentage",
      "millisecond",
      "microsecond",
    ])
    .optional()
    .describe("Value format for pie charts"),
  yAxis: z
    .array(
      z.object({
        min: z.number().optional(),
        max: z.number().optional(),
        minInterval: z.number().optional(),
      })
    )
    .optional()
    .describe("Y-axis configuration for timeseries"),
});

/**
 * Complete output schema including query field
 * The base visualizationAgentOutputSchema is used by the LLM (without query field)
 * This extended schema is what the visualization agent function returns (with query field added programmatically)
 */
export const visualizationAgentCompleteOutputSchema = visualizationAgentOutputSchema.extend({
  datasource: z
    .object({
      sql: z.string(),
    })
    .describe("SQL query that generated this data"),
});

export type VisualizationAgentOutput = z.infer<typeof visualizationAgentCompleteOutputSchema>;

/**
 * Server-side tool name for visualization generation
 */
export const SERVER_TOOL_GENEREATE_VISUALIZATION = "generate_visualization" as const;

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

/**
 * Visualization Agent
 *
 * Specialized agent for determining appropriate visualizations
 */
export async function visualizationAgent(
  input: VisualizationAgentInput
): Promise<VisualizationAgentOutput> {
  const { userQuestion, sql, inputModel: modelConfig } = input;

  if (!modelConfig) {
    throw new Error("modelConfig is required for visualizationAgent");
  }

  // Use model-specific default temperature
  const temperature = LanguageModelProviderFactory.getDefaultTemperature(modelConfig.modelId);

  const systemPrompt = `You are a data visualization expert. Analyze the provided ClickHouse SQL query and the original user question to determine the best visualization. Return your response in JSON format.

## STEP 1: CHECK USER'S EXPLICIT CHART REQUEST (HIGHEST PRIORITY)
**Before analyzing SQL, scan the user question for these keywords:**

If user question contains ANY of these keywords, use the corresponding chart type:
- **"line chart"** → type: "line" (MANDATORY, skip all other rules)
- **"bar chart"** → type: "bar" (MANDATORY, skip all other rules)
- **"pie chart"** → type: "pie" (MANDATORY, skip all other rules)
- **"timeseries"** or **"time series"** → type: "line" (MANDATORY, skip all other rules)
- **"trend"** → type: "line" (MANDATORY, skip all other rules)

**Examples of explicit requests:**
- "show me commits by day in line chart" → type: "line" ✅
- "visualize in bar chart" → type: "bar" ✅
- "create a pie chart of distribution" → type: "pie" ✅
- "render as timeseries" → type: "line" ✅

## STEP 2: ANALYZE SQL (Only if no explicit chart request in Step 1)

**"line"** - Time-based data with trends
- SQL has DateTime/Date column + GROUP BY time dimension
- SQL has time-related grouping: by day/hour/month/year
- User mentions: "over time", "by day", "by month", "by hour"
- Use even with multiple series (e.g., "by day AND status")

**"bar"** - Categorical comparisons
- SQL groups by categories or discrete values
- User mentions: "compare", "by category", "by status"
- No explicit time dimension

**"pie"** - Categorical distribution (proportions of a whole)
- SQL groups by a single categorical dimension (status, type, category, region)
- Shows proportions or percentages
- User mentions: "distribution", "breakdown", "composition", "proportion", "share"
- Query returns 2 columns: category name + numeric value (count/sum)
- Best for 3-15 categories

**"table"** - Raw data listing (LAST RESORT)
- User explicitly asks for "table" or "list" (and NO chart keywords)
- No numeric aggregations (no SUM/COUNT/AVG/etc.)
- More than 4-5 non-metric columns
- **NEVER use "table" if user mentioned any chart type**

## CRITICAL: Legend Values Array
When legendOption.placement is "bottom" or "right", you MUST include a "values" array:
- Base: ["min", "max"]
- Add "sum" if SQL uses SUM() or COUNT()
- Add "avg" if SQL uses AVG()
- Add "count" if SQL uses COUNT()

## Legend Rules
- **Line/Bar charts**: Use "bottom" for GROUP BY with non-time dimensions, "none" for single metric
- **Pie charts**: Use "right" for many categories (>8), "bottom" for few categories (3-8), "inside" for very few (2-3)

## Pie Chart Specific Rules
When type is "pie":
- legendOption.placement: "right" | "bottom" | "inside" (no "none" for pie)
- legendOption.values: NOT NEEDED for pie charts (omit this field)
- labelOption: Configure slice labels
  * show: true (default, show labels on slices)
  * format: "name-percent" (default), "name-value", "percent", "value", or "name"
- valueFormat: Format for values in tooltips and labels
  * "short_number" (default): 1.2K, 3.4M
  * "comma_number": 1,234,567
  * "binary_size": 1.2 KB, 3.4 MB (for bytes)
  * "percentage": 25.5%

## Output Format Examples

### Line/Bar Chart:
{
  "type": "line" | "bar",
  "titleOption": {
    "title": "Descriptive chart title",
    "align": "center"
  },
  "width": 6,
  "legendOption": {
    "placement": "bottom" | "none",
    "values": ["min", "max", "sum"]  // REQUIRED when placement="bottom"
  }
}

### Pie Chart:
{
  "type": "pie",
  "titleOption": {
    "title": "Distribution by Category",
    "align": "center"
  },
  "width": 6,
  "legendOption": {
    "placement": "right"  // or "bottom" or "inside"
    // NO "values" field for pie charts
  },
  "labelOption": {
    "show": true,
    "format": "name-percent"  // or "name-value", "percent", "value", "name"
  },
  "valueFormat": "short_number"  // or "comma_number", "binary_size", etc.
}

## DECISION PROCESS SUMMARY
1. First, check user question for explicit chart keywords ("line chart", "bar chart", "pie chart", "timeseries")
2. If found, use that chart type immediately
3. If not found, analyze SQL structure and user intent
4. Default to charts over tables when there are numeric aggregations
`;

  try {
    // Use provided model config
    const [model] = LanguageModelProviderFactory.createModel(
      modelConfig.provider,
      modelConfig.modelId,
      modelConfig.apiKey
    );

    // Use streamText instead of generateText to avoid proxy timeouts
    const result = streamText({
      model,
      output: Output.object({
        schema: visualizationAgentOutputSchema,
      }),
      messages: [
        { role: "system", content: systemPrompt },
        {
          role: "user",
          content: `User question: "${userQuestion}"

SQL to visualize:
${sql}`,
        },
      ],
      temperature,
    });

    // Wait for the complete validated output from the stream
    const validated = await result.output;

    // Add the SQL back to the output (not generated by LLM to save tokens)
    return {
      ...validated,
      datasource: { sql },
    };
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
        `Visualization agent failed: ${error instanceof Error ? error.message : String(error)}`,
        { cause: error }
      );
      abortError.name = "AbortError";
      throw abortError;
    }

    console.error("❌ Visualization agent failed:", {
      error,
      userQuestion,
      sql: sql.substring(0, 200), // Log first 200 chars of SQL for context
    });

    // Re-throw with additional context
    throw new Error(
      `Visualization agent failed: ${error instanceof Error ? error.message : String(error)}`,
      {
        cause: error,
      }
    );
  }
}

/**
 * Streaming Visualization Agent
 *
 * For use in the Two-Call Dispatcher pattern.
 */
export async function streamVisualization({
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

  const systemPrompt = `SYSTEM: ClickHouse Visualization Sub-Agent (Expert)
You are an expert at creating data visualizations for ClickHouse data.

**CRITICAL: MANDATORY EXECUTION ORDER - DO NOT SKIP STEPS**

**WORKFLOW** (MUST follow in this exact order):

**a) If schema info needed:**
- **FIRST**: Check if the table schema is already in the "Available Tables" context from previous messages.
- **OPTIMIZATION**: If user mentions specific column names (e.g., "show commits_count by day"), call 'explore_schema' with the 'columns' parameter set to those column names to fetch only what's needed (saves tokens for large tables).
- **ONLY IF NOT FOUND**: call 'explore_schema' or 'get_tables' to discover the schema.

**b) Generate or obtain SQL:**
- **CRITICAL**: You MUST use the 'generate_sql' tool to generate SQL. NEVER write SQL in your text response.
- If SQL exists in context (from previous messages or user input): use it directly.
- Otherwise: **MANDATORY** - call 'generate_sql' with schema context to generate a valid ClickHouse query.
- The 'generate_sql' tool will handle SQL generation with proper schema context.
- **NEVER generate SQL yourself in markdown code blocks or text - ALWAYS use the 'generate_sql' tool**

**c) **VALIDATION (MANDATORY)**:**
- **ALWAYS call 'validate_sql' with the SQL BEFORE calling 'generate_visualization'**
- **NEVER call 'generate_visualization' before validating the SQL**
- **ONLY validate SQL that comes from:**
  - The 'generate_sql' tool output
  - Previous context messages (if SQL was already provided)
- **NEVER validate SQL that you wrote yourself in text - you MUST use 'generate_sql' tool first**
- **RETRY LOGIC**: If validation fails, you MUST retry up to 3 times:
  1. Analyze the validation error message carefully
  2. Call 'generate_sql' again with the validation error in the 'previousValidationError' parameter:
     - Set 'userQuestion' to the original user question
     - Set 'previousValidationError' to the exact error message from validation
     - Example: { userQuestion: "show commits by day", previousValidationError: "Table 'commits' does not exist" }
  3. Validate the newly generated SQL again
  4. Repeat this process up to 3 total attempts
  5. Only if all 3 attempts fail, inform the user about the SQL error and STOP - do not proceed to visualization
- Only proceed to step (d) if validation returns success: true (after any successful attempt within the 3 retries)

**d) After validation passes:**
- Call 'generate_visualization' with the validated SQL to produce the final visualization plan.
- The 'generate_visualization' tool will determine the best chart type (line, bar, pie, etc.).

**e) Optionally:**
- Call 'execute_sql' if data needs to be fetched for preview or verification.

**IMPORTANT RULES:**
- ❌ NEVER call 'generate_visualization' before 'validate_sql'
- ❌ NEVER skip SQL generation if no SQL exists in context
- ❌ NEVER write SQL in your text response - ALWAYS use 'generate_sql' tool
- ❌ NEVER validate SQL that you wrote yourself - only validate SQL from 'generate_sql' tool or context
- ✅ ALWAYS follow the order: Schema Discovery → SQL Generation (via tool) → Validation → Visualization
- ✅ If SQL validation fails, retry up to 3 times by calling 'generate_sql' again with 'previousValidationError' parameter set to the validation error
- ✅ Only after 3 failed validation attempts, explain the error to the user and do not generate visualization
- ✅ Reuse existing SQL from context if available (don't regenerate unnecessarily)
- ✅ When retrying, use the 'previousValidationError' parameter in 'generate_sql' to pass the exact validation error message
- ✅ If you need SQL, you MUST call the 'generate_sql' tool - do not write SQL yourself

**OUTPUT REQUIREMENTS:**
- Output a short summary of the generated SQL in markdown format
- DO NOT output a summary of the chart panel configuration - only summarize the SQL query
`;

  return streamText({
    model,
    messages: [{ role: "system", content: systemPrompt }, ...messages],
    tools: {
      get_tables: clientTools.get_tables,
      explore_schema: clientTools.explore_schema,
      [SERVER_TOOL_GENERATE_SQL]: createGenerateSqlTool(modelConfig, context),
      validate_sql: clientTools.validate_sql,
      execute_sql: clientTools.execute_sql,
      generate_visualization: createGenerateVisualizationTool(modelConfig),
    },
    temperature,
  });
}
