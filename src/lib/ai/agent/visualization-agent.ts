import { Output, streamText } from "ai";
import { z } from "zod";
import { LanguageModelProviderFactory } from "../llm/llm-provider-factory";
import type { InputModel } from "./orchestrator-agent";

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
  query: z
    .object({
      sql: z.string(),
    })
    .describe("SQL query that generated this data"),
});

export type VisualizationAgentOutput = z.infer<typeof visualizationAgentCompleteOutputSchema>;

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
      query: { sql },
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
