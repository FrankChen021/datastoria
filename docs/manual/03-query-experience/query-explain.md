# Query Explain

The Query Explain feature helps you understand how ClickHouse executes your queries by providing detailed execution plans, pipeline visualizations, and abstract syntax tree (AST) representations. This insight is crucial for optimizing query performance and debugging execution issues.

## Overview

Query Explain provides multiple ways to understand query execution:

- **EXPLAIN SYNTAX**: Displays the result of syntax checking
- **EXPLAIN PLAN**: Shows the unified execution plan with graph, tree, index, and action details
- **EXPLAIN PIPELINE**: Visualizes the execution pipeline
- **EXPLAIN AST**: Displays the abstract syntax tree
- **EXPLAIN ESTIMATE**: Provides simplified statistics about data to be read

The feature integrates graphical views to help you understand the results more intuitively.

## How to Use

### Explaining All Text in the Editor

If the editor contains only one SQL statement:

1. Click the **'Explain SQL'** button from the command bar
2. Select the EXPLAIN function you want to execute from the dropdown menu
3. Click the selected option to run the explanation

The system automatically adds the appropriate `EXPLAIN` statement to your query, so you don't need to manually type it.

### Explaining Part of SQL Text

To explain only a portion of your query:

1. Select the text you want to explain in the editor
2. Click the **'Explain SQL'** button from the command bar
3. Choose the EXPLAIN function from the dropdown menu
4. Click to execute

The selected portion will be explained independently of the rest of the query.

> **Note:** You don't need to manually add `EXPLAIN xxxx` to your SQL statements. The editor handles this automatically.

## EXPLAIN AST

![EXPLAIN AST graphical tree view showing abstract syntax tree structure of a parsed SQL query](./img/explain_ast.jpg)

`EXPLAIN AST` is primarily a database developer tool that displays the abstract syntax tree (AST) format of your parsed SQL query. By default, DataStoria provides a graphical tree view of the AST, making it easier to understand the query structure.

If you prefer, you can switch to **'Text Mode'** to view the traditional text-based AST output.

![EXPLAIN AST text mode displaying traditional text-based abstract syntax tree output](./img/explain-ast-2.jpg)

### Use Cases

- **Syntax Validation**: Verify that your query is parsed correctly
- **Query Structure Analysis**: Understand how ClickHouse interprets your query
- **Debugging**: Identify parsing issues or unexpected query transformations
- **Learning**: Study how SQL statements are structured internally

## EXPLAIN SYNTAX

`EXPLAIN SYNTAX` is another tool primarily used by database developers. It displays the result of syntax checking, showing how ClickHouse interprets and normalizes your SQL query.

This feature is useful for:
- **Syntax Normalization**: See how ClickHouse normalizes your query syntax
- **Query Transformation**: Understand how your query is transformed internally
- **Syntax Validation**: Verify that your query syntax is correct

For more detailed information, refer to the [ClickHouse official documentation](https://clickhouse.com/docs/en/sql-reference/statements/explain#explain-syntax) on this feature.

## EXPLAIN PLAN

The `EXPLAIN PLAN` feature sends the following statement to ClickHouse:

```sql
EXPLAIN PLAN json=1, indexes=1, actions=1
```

This unified plan response combines the information that previously lived in separate indexes and actions views. It helps you analyze:

- **Primary Keys and Indexes**: How the primary key and other indexes affect part and granule selection
- **Read Scope**: How many parts and granules ClickHouse will read
- **Execution Flow**: The logical operators ClickHouse will execute, from read to aggregation, projection, sorting, and more
- **Expression Details**: Inputs, outputs, aliases, and action steps used by expression nodes
- **Aggregation Details**: Keys, aggregate functions, and merge behavior
- **Raw Plan Data**: The exact JSON plan for debugging and supportability

This is a powerful tool for mastering query optimization and writing highly efficient SQL statements.

### Plan Views

The unified renderer provides three complementary ways to inspect the same plan:

- **Graph**: A React Flow diagram that shows the operator tree, scan metrics, and index summaries
- **Text**: A structured tree view that makes it easy to read the plan top-to-bottom while keeping the same node-level details
- **Raw JSON**: A formatted JSON view of the original `EXPLAIN PLAN` payload

Click any node in the graph or text view to open a detail pane with:

- **Overview**: Node type, description, keys, and source information
- **Read Stats**: Parts, granules, read type, and selected vs. initial counts
- **Indexes**: Index type, condition, selected parts, and selected granules
- **Expression**: Inputs, outputs, positions, and actions
- **Aggregation**: Aggregate names, functions, arguments, and merge flags

### Key Insights

- **Index Usage**: Verify that indexes are being used effectively
- **Partition Pruning**: Check if unnecessary partitions are being skipped
- **Optimization Opportunities**: Identify areas where indexes could improve performance
- **Execution Flow**: Understand how ClickHouse transforms the query from storage reads up through final projection

For more information, refer to the [ClickHouse official documentation](https://clickhouse.com/docs/en/sql-reference/statements/explain#explain-plan) on this statement.

## EXPLAIN PIPELINE

The `EXPLAIN PIPELINE` shows the execution plan as a visual pipeline diagram. This tool helps you understand:

- **Pipeline Connections**: How different processing stages connect with each other
- **Parallelism**: Which steps can run in parallel
- **Data Flow**: How data moves through the execution pipeline
- **Processing Stages**: The sequence of transformations applied to your data

![EXPLAIN PIPELINE visual diagram showing execution pipeline stages, parallelism, and data flow connections](./img/explain-pipeline.jpg)

### Visual Benefits

The graphical representation makes it easier to:
- **Identify Bottlenecks**: Spot stages that might slow down execution
- **Understand Parallelism**: See which operations can run concurrently
- **Optimize Queries**: Make informed decisions about query structure

## EXPLAIN ESTIMATE

The `EXPLAIN ESTIMATE` can be seen as a simplified view of `EXPLAIN PLAN`. It provides a concise summary of what your query will read:

- **Data Parts**: Number of data parts to be read
- **Rows**: Estimated number of rows to be processed
- **Marks**: Number of marks (index entries) to be read

> **Performance Tip:** Generally, the smaller these values, the better the query performance.

![EXPLAIN ESTIMATE summary showing data parts, estimated rows, and marks to be read for query performance assessment](./img/explain-estimate.jpg)

### When to Use

This simplified view is useful for:
- **Quick Assessment**: Get a fast overview of query complexity
- **Comparison**: Compare different query approaches at a glance
- **Learning**: Understand query resource requirements without detailed analysis

### Limitations

Since it doesn't provide the full operator tree, node-level actions, or detailed index breakdowns, the results may sometimes be less insightful than the full `EXPLAIN PLAN` output. Use it as a quick reference, but refer to the detailed plan for comprehensive analysis.

## Best Practices

### Regular Analysis

1. **Explain Before Optimizing**: Always explain queries (especially `EXPLAIN PLAN`) before optimizing
2. **Compare Plans**: Compare plans before and after changes
3. **Monitor Changes**: Track how plan changes affect performance
4. **Document Patterns**: Document common plan patterns

### Optimization Workflow

1. **Run EXPLAIN**: Start with EXPLAIN PLAN or PIPELINE
2. **Identify Issues**: Look for full scans, missing indexes, etc.
3. **Make Changes**: Modify query or add indexes
4. **Re-explain**: Verify improvements in the plan
5. **Test Performance**: Measure actual performance improvement

### Understanding Output

1. **Read Top to Bottom**: Execution flows from top to bottom
2. **Look for Scans**: Full table scans are often the bottleneck
3. **Check Index Usage**: Verify indexes are being used
4. **Examine Joins**: Ensure efficient join strategies

## Limitations

- **Estimates**: Plans show estimates, not actual execution
- **Complexity**: Very complex queries may have complex plans
- **Version Differences**: Plan format may vary by ClickHouse version
- **Real-time**: Plans are generated at explain time, not execution time
- **Visualization Access**: The graphical visualization for `EXPLAIN AST` and `EXPLAIN PIPELINE` is only available when accessed through the **'Explain SQL'** dropdown menu in the command bar. Direct SQL execution of these commands will show text output only.

## Next Steps

- **[Query Optimization](../02-ai-features/query-optimization.md)** — Use AI to optimize your queries
- **[Query Log Inspector](./query-log-inspector.md)** — Analyze actual query performance
