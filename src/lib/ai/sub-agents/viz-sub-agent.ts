import { generateObject } from 'ai';
import { getLanguageModel } from '../provider';
import { vizSubAgentOutputSchema, type VizSubAgentInput, type VizSubAgentOutput } from './types';

/**
 * Visualization Sub-Agent
 * 
 * Specialized sub-agent for determining appropriate visualizations
 */
export async function vizSubAgent(input: VizSubAgentInput): Promise<VizSubAgentOutput> {
  const { userQuestion, sql } = input;

  const systemPrompt = `You are a data visualization expert. Analyze the provided ClickHouse SQL query and the original user question to determine the best visualization.

## CRITICAL: Legend Values Array
When legendOption.placement is "bottom" or "right", you MUST include a "values" array:
- Base: ["min", "max"]
- Add "sum" if SQL uses SUM() or COUNT()
- Add "avg" if SQL uses AVG()
- Add "count" if SQL uses COUNT()

Example: SELECT date, SUM(amount) GROUP BY date → legendOption: { placement: "bottom", values: ["min", "max", "sum"] }

## Visualization Rules
1. **Timeseries Charts** (line, bar, area):
   - Use when: SQL contains time-based columns (DateTime, Date) in the SELECT or GROUP BY clauses + numeric metrics.
2. **Table**:
   - Use when: simple tabular data, text columns, or complex multi-column results without a clear time dimension.
3. **None**:
   - Use when: single value results (e.g., COUNT(*)), or non-visualizable data.

## Legend Rules
- **Show legend** ("bottom"):
  - When SQL has GROUP BY with non-time dimensions (e.g., status, category, user_type, region)
  - When multiple series need differentiation
  - When the chart shows breakdown by a categorical dimension
- **Hide legend** ("none"):
  - Single metric queries without grouping
  - Only time-based grouping without other dimensions
  - Simple aggregate queries

## Legend Values Configuration (CRITICAL)
The "values" array in legendOption controls which aggregate statistics are shown in the legend.
ALWAYS analyze the SQL aggregation function and include the corresponding value:

- If SQL uses **SUM(...)** → MUST include "sum" in values array
- If SQL uses **AVG(...)** → MUST include "avg" in values array  
- If SQL uses **COUNT(...)** → MUST include "count" and "sum" in values array

**Default baseline:** Always include ["min", "max"]
**Add aggregation type:** Append the function used (sum/avg/count)

Examples:
- SELECT date, SUM(amount) ... → values: ["min", "max", "sum"]
- SELECT date, AVG(duration) ... → values: ["min", "max", "avg"]
- SELECT date, COUNT(*) ... → values: ["min", "max", "count", "sum"]
- SELECT date, status, SUM(revenue) ... → values: ["min", "max", "sum"]

## Output Format
Return ONLY valid JSON matching this schema:
{
  "type": "line" | "bar" | "area" | "table" | "none",
  "titleOption": {
    "title": "Descriptive chart title",
    "align": "left" | "center" | "right"
  },
  "width": 1-12,
  "legendOption": {
    "placement": "none" | "bottom" | "right",
    "values": ["min", "max", ...] // REQUIRED: Add "sum"/"avg"/"count" based on SQL aggregation function
  },
  "query": {
    "sql": "The SQL query being visualized"
  }
}

IMPORTANT: The "values" array is MANDATORY when placement is "bottom" or "right".
- Start with ["min", "max"]
- Add the aggregation type from the SQL query ("sum", "avg", or "count")

For timeseries, you can optionally add:
{
  "yAxis": [{ "min": 0, "minInterval": 1 }]
}
`;

  try {
    const model = getLanguageModel();

    const { object: validated } = await generateObject({
      model,
      schema: vizSubAgentOutputSchema,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: `User question: ${userQuestion}\n\nSQL to visualize:\n${sql}` },
      ],
      temperature: 0.1,
    });

    console.log('✅ Viz sub-agent output received and validated:', validated);
    return validated;

  } catch (error) {
    console.error('❌ Viz sub-agent execution or validation error:', error);
    return {
      type: 'table',
      query: { sql },
    };
  }
}
