# Intelligent Visualization

DataStoria's Intelligent Visualization feature allows you to generate stunning visualizations like time series, pie charts, and data tables with simple prompts. Transform your query results into visual insights instantly.

It's an extension of data exploration which greatly saves times to know your data.

## Overview

The Intelligent Visualization feature uses AI to:
- Generate a SQL to meet your need
- Generate visualizations automatically

It does NOT fetch data from your local and sends data to LLM for visualization. Instead, LLM generates the SQL for visualization and visualization UI spec together, it's your client that fetch data and renders data in the browser. This saves lots of token compared to the LLM side visualization output.

## Generating Charts from Prompts

The [ClickHouse Playground](play.clickhouse.com) is used for these example illustration.
You create a connection to this playground to try the following examples.

### Time Series Charts

**Prompt**: "Create a line chart showing number of commit by day in 2021 Feb"

![visualization-example-1](./visualization-example.jpg)

The generated 
```sql
SELECT
  toDate(time) AS day,
  count() AS commits
FROM git_clickhouse.commits
WHERE time >= toDateTime('2021-02-01 00:00:00')
  AND time < toDateTime('2021-03-01 00:00:00')
GROUP BY day
ORDER BY day
LIMIT 1000
```

**Prompt**: "Show me a line chart of added lines, removed lines of commits by day in 2021 Jan"

![visualization-example-2](./visualization-example-2.jpg)


### Bar Charts

**Prompt**: "show me the number of commits by month from 2020 to 2021 in bar chart"

![visualization-example-3](./visualization-example-3.jpg)


#### Pie and Donut Charts

**Prompt**: "Show me a pie chart of market share by product category"

**Result**: A pie chart with each slice representing a product category's market share

**Prompt**: "Create a donut chart showing the distribution of order statuses"

**Result**: A donut chart with different segments for each order status

#### Scatter and Bubble Charts

**Prompt**: "Make a scatter plot of price vs quantity sold"

**Result**: A scatter plot with price on x-axis, quantity on y-axis, and points for each data record

**Prompt**: "Create a bubble chart showing revenue (size) by region (x) and profit margin (y)"

**Result**: A bubble chart with region on x-axis, profit margin on y-axis, and bubble size representing revenue

## Chart Types Available

DataStoria supports a wide variety of chart types:

### Time Series Charts
- **Line Chart**: Perfect for trends over time
- **Area Chart**: Shows cumulative values over time
- **Stacked Area Chart**: Compares multiple series over time
- **Candlestick Chart**: For financial data (open, high, low, close)

### Categorical Charts
- **Bar Chart**: Horizontal bars for category comparison
- **Column Chart**: Vertical columns for category comparison
- **Grouped Bar/Column**: Compare multiple series across categories
- **Stacked Bar/Column**: Show composition within categories

### Distribution Charts
- **Pie Chart**: Show proportions of a whole
- **Donut Chart**: Similar to pie with center space
- **Treemap**: Hierarchical data visualization
- **Sunburst**: Multi-level hierarchical data

### Relationship Charts
- **Scatter Plot**: Relationship between two variables
- **Bubble Chart**: Scatter plot with size dimension
- **Heatmap**: Matrix visualization with color intensity

### Statistical Charts
- **Histogram**: Distribution of a single variable
- **Box Plot**: Statistical distribution with quartiles
- **Violin Plot**: Distribution shape comparison

### Tables
- **Data Table**: Formatted table with sorting and filtering
- **Pivot Table**: Multi-dimensional data analysis

## Customizing Visualizations

### Chart Properties

After generating a chart, you can customize:

#### Colors and Styling
- **Color Palette**: Choose from predefined palettes or custom colors
- **Theme**: Light, dark, or custom theme
- **Line Styles**: Solid, dashed, dotted for line charts
- **Fill Opacity**: Adjust transparency for area charts

#### Axes and Labels
- **Axis Labels**: Customize x-axis and y-axis labels
- **Title**: Add or modify chart title
- **Legend**: Position and customize legend
- **Grid Lines**: Show or hide grid lines

#### Data Formatting
- **Number Format**: Currency, percentage, decimal places
- **Date Format**: Customize date/time display
- **Tooltips**: Customize hover information

### Advanced Customization

#### Multiple Series
- Add multiple data series to the same chart
- Compare different metrics side by side
- Use different chart types for different series

#### Filters and Interactions
- **Interactive Filters**: Filter data directly from the chart
- **Zoom and Pan**: Zoom into specific time ranges
- **Drill-down**: Click to see detailed data

#### Annotations
- Add text annotations
- Highlight specific data points
- Mark important events or thresholds

## Best Practices

### Choosing the Right Chart Type

1. **Time Series Data**: Use line or area charts
2. **Categories**: Use bar or column charts
3. **Proportions**: Use pie or donut charts
4. **Relationships**: Use scatter or bubble charts
5. **Distributions**: Use histograms or box plots

### Writing Effective Visualization Prompts

1. **Be Specific**: Mention chart type, axes, and data to include
   - ✅ Good: "Create a line chart with dates on x-axis and revenue on y-axis, grouped by product category"
   - ❌ Vague: "Show me a chart"

2. **Specify Time Ranges**: Include date ranges for time series
   - ✅ Good: "Show monthly sales from January to December 2024"
   - ❌ Less clear: "Show sales"

3. **Mention Aggregations**: Specify how data should be aggregated
   - ✅ Good: "Bar chart showing average order value by region"
   - ❌ Ambiguous: "Show orders by region"

4. **Request Multiple Series**: Ask for comparisons when needed
   - ✅ Good: "Compare this year's revenue vs last year's on the same chart"
   - ❌ Single series: "Show revenue"

### Data Preparation

- **Clean Data**: Ensure your query returns clean, well-structured data
- **Appropriate Aggregations**: Aggregate data appropriately for the chart type
- **Time Formatting**: Use proper date/time formats for time series
- **Null Handling**: Consider how null values should be displayed

## Examples and Use Cases

### Business Dashboards

**Use Case**: Executive dashboard with key metrics

**Prompts**:
- "Create a line chart showing monthly revenue trend"
- "Make a pie chart of sales by product category"
- "Show a bar chart comparing regional performance"

### Performance Monitoring

**Use Case**: System performance visualization

**Prompts**:
- "Create a time series area chart of CPU usage over the last 24 hours"
- "Make a heatmap showing query performance by hour and day of week"
- "Show a scatter plot of query duration vs data scanned"

### Data Analysis

**Use Case**: Exploratory data analysis

**Prompts**:
- "Create a histogram of order values"
- "Make a box plot comparing revenue across different customer segments"
- "Show a bubble chart of customer lifetime value vs acquisition cost"

## Integration with Other Features

### Natural Language to SQL

1. Generate a query using Natural Language to SQL
2. Execute the query
3. Request visualization of the results
4. The AI understands the query context for better visualizations

### Query Optimization

Visualize query performance improvements:
1. Run original and optimized queries
2. Create side-by-side visualizations
3. Compare performance metrics visually

### Dashboards

Save visualizations to dashboards:
1. Create a visualization
2. Add to dashboard
3. Share with team
4. Update automatically as data changes

## Tips for Better Visualizations

1. **Start Simple**: Begin with basic charts and add complexity
2. **Use Appropriate Scales**: Ensure axes scales make sense for your data
3. **Limit Series**: Too many series can make charts hard to read
4. **Choose Colors Wisely**: Use color palettes that are accessible and meaningful
5. **Add Context**: Include titles, labels, and legends for clarity

## Limitations

- Chart quality depends on query result structure
- Very large datasets may need aggregation before visualization
- Some complex visualizations may require manual refinement
- Custom styling options may vary by chart type

## Next Steps

- **[Natural Language to SQL](./natural-language-sql.md)** — Generate queries to visualize
- **[Query Optimization](./query-optimization.md)** — Optimize queries before visualizing
- **[Built-in Dashboards](../04-cluster-management/built-in-dashboards.md)** — Create comprehensive dashboards

---

*For more visualization tips, see [Best Practices](../08-best-practices/ai-feature-usage.md).*
