import { generateObject } from "ai";
import { LanguageModelProviderFactory } from "../llm-provider-factory";
import { vizSubAgentOutputSchema, type VizSubAgentInput, type VizSubAgentOutput } from "./types";

/**
 * Visualization Sub-Agent
 *
 * Specialized sub-agent for determining appropriate visualizations
 */
export async function vizSubAgent(input: VizSubAgentInput): Promise<VizSubAgentOutput> {
  const { userQuestion, sql, modelConfig } = input;
  
  if (!modelConfig) {
    throw new Error("modelConfig is required for vizSubAgent");
  }

  const systemPrompt = `You are a data visualization expert. Analyze the provided ClickHouse SQL query and the original user question to determine the best visualization.

## CRITICAL: Legend Values Array
When legendOption.placement is "bottom" or "right", you MUST include a "values" array:
- Base: ["min", "max"]
- Add "sum" if SQL uses SUM() or COUNT()
- Add "avg" if SQL uses AVG()
- Add "count" if SQL uses COUNT()

Examples:
- "commits by day" → type: "line", placement: "none"
- "commits by day and author" → type: "line", placement: "bottom", values: ["min", "max", "count", "sum"]

## Visualization Type Selection
**Priority: Always prefer charts over tables when data has numeric metrics.**

**"line"** - Time-based data with trends
- SQL has DateTime/Date column + GROUP BY time dimension
- User says: "line chart", "trend", "over time", "by day/hour/month"
- Use even with multiple series (e.g., "by day AND status")

**"bar"** - Time-based data comparisons  
- SQL groups by categories or discrete time periods
- User says: "bar chart", "compare", "by category", "distribution"

**"table"** - Only when charts don't fit
- No numeric aggregations (SUM/COUNT/AVG)
- User explicitly asks for "table" or "list"
- More than 4-5 non-metric columns

## Legend Rules
- Use "bottom": GROUP BY with non-time dimensions (status, category, region, etc.)
- Use "none": Single metric or time-only grouping


## Output Format
{
  "type": "line" | "bar" | "table",  // If user says "line chart", use "line" regardless of dimensions
  "titleOption": {
    "title": "Descriptive chart title",
    "align": "center"  // Default to center
  },
  "width": 6,  // Default to half-width
  "legendOption": {
    "placement": "bottom" | "none",  // Use "bottom" when GROUP BY has dimensions
    "values": ["min", "max", "sum"]  // REQUIRED when placement="bottom"
  },
  "query": { "sql": "..." }
}

Legend values rules:
- Always include: ["min", "max"]
- SUM() or COUNT() → add "sum"
- AVG() → add "avg"
- COUNT() also needs "count" + "sum"

For timeseries, you can optionally add:
{
  "yAxis": [{ "min": 0, "minInterval": 1 }]
}
`;

  try {
    // Use provided model config
    const [model] = LanguageModelProviderFactory.createModel(
      modelConfig.provider,
      modelConfig.modelId,
      modelConfig.apiKey
    );

    const { object: validated } = await generateObject({
      model,
      schema: vizSubAgentOutputSchema,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: `User question: ${userQuestion}\n\nSQL to visualize:\n${sql}` },
      ],
      temperature: 0.1,
    });

    return validated;
  } catch (error) {
    console.error("❌ Viz sub-agent execution or validation error:", error);
    return {
      type: "table",
      query: { sql },
    };
  }
}
