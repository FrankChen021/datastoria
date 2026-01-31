---
name: visualization
description: Rules for charts and visualization. Use when the user asks for charts, graphs, plots, or visual representations (line, bar, pie, timeseries).
---

# Visualization Skill

When the user asks for charts, graphs, or visual representations, follow this workflow and rules.

## WORKFLOW (MANDATORY ORDER)

**a) If schema info needed:**
- **FIRST**: Check if the table schema is already in the "Available Tables" context from previous messages.
- **OPTIMIZATION**: If user mentions specific column names (e.g., "show commits_count by day"), call `explore_schema` with the `columns` parameter set to those column names to fetch only what's needed (saves tokens for large tables).
- **ONLY IF NOT FOUND**: call `explore_schema` or `get_tables` to discover the schema.

**b) Generate or obtain SQL:**
- **CRITICAL**: You MUST use the `generate_sql` tool to generate SQL. NEVER write SQL in your text response.
- If SQL exists in context (from previous messages or user input): use it directly.
- Otherwise: **MANDATORY** - call `generate_sql` with schema context to generate a valid ClickHouse query.
- **NEVER generate SQL yourself in markdown code blocks or text - ALWAYS use the generate_sql tool**

**c) VALIDATION (MANDATORY):**
- **ALWAYS call `validate_sql` with the SQL before including the chart spec in your response.**
- **RETRY LOGIC**: If validation fails, retry up to 3 times by calling `generate_sql` again with `previousValidationError` set to the exact error message, then validate again.
- Only proceed to step (d) if validation returns success: true.

**d) After validation passes:**
- **Include the full chart spec in your response** using a markdown code block with language `chart-spec`. The content must be valid JSON matching the OUTPUT FORMAT below, and **must include** `datasource: { "sql": "<the validated SQL>" }`. Derive type, titleOption, legendOption, etc. from the CHART TYPE RULES and OUTPUT FORMAT above. Do not call any tool for this—put the complete spec in your reply.

**e) Optionally:**
- Call `execute_sql` if data needs to be fetched for preview or verification.

## CHART TYPE RULES

### STEP 1: CHECK USER'S EXPLICIT CHART REQUEST (HIGHEST PRIORITY)

If user question contains ANY of these keywords, use the corresponding chart type:
- **"line chart"** → type: "line" (MANDATORY)
- **"bar chart"** → type: "bar" (MANDATORY)
- **"pie chart"** → type: "pie" (MANDATORY)
- **"timeseries"** or **"time series"** → type: "line" (MANDATORY)
- **"trend"** → type: "line" (MANDATORY)

### STEP 2: ANALYZE SQL (Only if no explicit chart request in Step 1)

- **"line"** - Time-based data with trends (DateTime/Date + GROUP BY time dimension; "over time", "by day/month/hour").
- **"bar"** - Categorical comparisons (GROUP BY categories; "compare", "by category").
- **"pie"** - Categorical distribution, proportions (single categorical dimension; "distribution", "breakdown", "proportion"; 2 columns: category + numeric value; best for 3-15 categories).
- **"table"** - Raw data listing (LAST RESORT): user asks for "table" or "list" with NO chart keywords; no numeric aggregations.

## CRITICAL RULES

- When legendOption.placement is "bottom" or "right", you MUST include a "values" array: base ["min", "max"]; add "sum"/"count" if SQL uses SUM/COUNT; add "avg" if SQL uses AVG.
- **Line/Bar**: Use "bottom" for GROUP BY with non-time dimensions, "none" for single metric.
- **Pie**: legendOption.placement "right"|"bottom"|"inside" (no "none"); omit legendOption.values; use labelOption (show, format) and valueFormat as needed.

## OUTPUT FORMAT (include in your response as a \`chart-spec\` code block)

Put the full chart spec in a markdown code block with language **chart-spec**. The JSON **must** include `datasource.sql` (the validated SQL). The client parses this block to render the chart.

### Line/Bar Chart example:
\`\`\`chart-spec
{
  "type": "line",
  "titleOption": { "title": "Descriptive chart title", "align": "center" },
  "width": 6,
  "legendOption": { "placement": "bottom", "values": ["min", "max", "sum"] },
  "datasource": { "sql": "SELECT ..." }
}
\`\`\`

### Pie Chart example:
\`\`\`chart-spec
{
  "type": "pie",
  "titleOption": { "title": "Distribution by Category", "align": "center" },
  "width": 6,
  "legendOption": { "placement": "right" },
  "labelOption": { "show": true, "format": "name-percent" },
  "valueFormat": "short_number",
  "datasource": { "sql": "SELECT ..." }
}
\`\`\`

- ❌ NEVER include a chart spec before validate_sql has succeeded.
- ❌ NEVER skip SQL generation if no SQL exists in context.
- ❌ NEVER write SQL in your text response—ALWAYS use the generate_sql tool.
- ✅ ALWAYS follow: Schema Discovery → SQL Generation (via tool) → Validation → Include chart spec in response.
- ✅ If validation fails, retry up to 3 times with previousValidationError in generate_sql.
