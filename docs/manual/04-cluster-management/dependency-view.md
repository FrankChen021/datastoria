---
title: Dependency View
description: Visualize ClickHouse table dependencies with interactive graph visualization. Explore upstream and downstream relationships between tables, materialized views, and other database objects. Understand data lineage and table relationships.
head:
  - - meta
    - name: keywords
      content: dependency view, table dependencies, ClickHouse dependencies, data lineage, dependency graph, table relationships, upstream dependencies, downstream dependencies, materialized view dependencies, database dependencies
---

# Dependency View

The Dependency View provides an interactive graph visualization of table dependencies in your ClickHouse database. It helps you understand how tables relate to each other, track data lineage, and identify dependencies for materialized views, views, and other database objects.

## Overview

The Dependency View automatically analyzes your ClickHouse schema to build a comprehensive dependency graph showing:

- **Table Dependencies**: Which tables depend on other tables
- **Materialized View Dependencies**: Relationships between materialized views and their source tables
- **View Dependencies**: Dependencies for regular views
- **Upstream Dependencies**: Tables that a specific table depends on
- **Downstream Dependencies**: Tables that depend on a specific table
- **Interactive Navigation**: Click on nodes to view detailed table information

## Accessing the Dependency View

The Dependency View is accessible in two ways:

### From Database Tab

1. **Open Database Tab**: Click on a database name in the Schema Explorer
2. **Select Dependency Tab**: Click on the "Database Dependency" tab
3. **View Graph**: The dependency graph for all tables in the database is displayed

### From Table Tab

1. **Open Table Tab**: Click on a table name in the Schema Explorer
2. **Select Dependencies Tab**: Click on the "Dependencies" tab
3. **View Focused Graph**: The dependency graph is filtered to show only dependencies related to the selected table

## Features

### Interactive Graph Visualization

The dependency graph displays:

- **Nodes**: Represent tables, materialized views, and other database objects
- **Edges**: Represent dependency relationships (arrows show direction)
- **Node Categories**: Different colors or styles for different table types
- **Zoom and Pan**: Navigate large dependency graphs easily
- **Node Highlighting**: Hover or click nodes to see details

### Upstream and Downstream Analysis

When viewing dependencies for a specific table:

- **Upstream Dependencies**: Shows all tables that the selected table depends on (what feeds into it)
- **Downstream Dependencies**: Shows all tables that depend on the selected table (what it feeds into)
- **Complete Context**: Includes both upstream and downstream in a single view

### Table Details Panel

Click on any node in the graph to open a detailed panel showing:

- **Table Metadata**: Database, table name, engine type
- **Table Query**: The CREATE TABLE statement
- **Dependencies**: List of tables this table depends on
- **Metadata Information**: Last modification time and other metadata

### Automatic Dependency Detection

The Dependency View automatically:

- **Parses CREATE TABLE Queries**: Extracts dependencies from table definitions
- **Handles Inner Tables**: Correctly identifies dependencies for materialized view inner tables
- **Caches Results**: Stores dependency data for faster subsequent loads
- **Updates on Refresh**: Refreshes when schema changes are detected

## How Dependencies Are Detected

Dependencies are extracted from:

1. **CREATE TABLE Statements**: Parsed from `system.tables.create_table_query`
2. **FROM Clauses**: Tables referenced in SELECT statements
3. **JOIN Clauses**: Tables joined in queries
4. **Subqueries**: Tables used in nested queries
5. **Materialized Views**: Source tables for materialized views

## Use Cases

### Understanding Data Lineage

- **Track Data Flow**: See how data flows from source tables to materialized views
- **Impact Analysis**: Understand what will be affected if you modify a table
- **Documentation**: Visualize your database architecture

### Schema Refactoring

- **Safe Changes**: Identify all dependencies before modifying or dropping tables
- **Migration Planning**: Understand relationships when restructuring schemas
- **Risk Assessment**: See downstream impact of schema changes

### Performance Optimization

- **Bottleneck Identification**: Find tables with many downstream dependencies
- **Optimization Targets**: Identify frequently used tables that might benefit from optimization
- **Materialized View Analysis**: Understand materialized view dependencies for optimization

### Troubleshooting

- **Error Investigation**: Trace dependencies when queries fail
- **Data Quality**: Understand data lineage for quality issues
- **Debugging**: Visualize relationships when debugging complex queries

## Graph Navigation

### Zoom Controls

- **Zoom In**: Use mouse wheel or zoom controls
- **Zoom Out**: Scroll out or use zoom controls
- **Fit to View**: Automatically adjust to show all nodes

### Node Interaction

- **Click Node**: Opens detailed table information panel
- **Hover**: Highlights connected edges
- **Select**: Focuses on specific table dependencies

### Panel Management

- **Resize Panel**: Drag the panel border to adjust size
- **Close Panel**: Click the close button to hide the panel
- **Panel Content**: View table metadata, query, and dependencies

## Limitations

- **System Tables**: Some system tables may not show dependencies correctly
- **Kafka Tables**: Kafka engine tables may have limited dependency information
- **External Tables**: URL and other external table engines may not show dependencies
- **Complex Queries**: Very complex CREATE TABLE queries may not parse all dependencies
- **Performance**: Large databases with many tables may take time to build the graph
- **Real-time Updates**: Dependency graph reflects schema at the time of loading

## Best Practices

### Regular Updates

- **Refresh After Changes**: Refresh the dependency view after schema changes
- **Monitor Changes**: Use dependency view to track schema evolution
- **Documentation**: Use dependency graphs for architecture documentation

### Performance Considerations

- **Large Databases**: For databases with many tables, consider viewing dependencies for specific tables
- **Caching**: Dependency data is cached for performance
- **Selective Viewing**: Use table-specific dependency view for focused analysis

## Integration with Other Features

- **Schema Explorer**: Navigate to tables from the dependency graph
- **Table Tab**: View detailed table information from dependency nodes
- **Database Tab**: Access database-level dependency overview
- **Query Editor**: Use dependency information when writing queries

## Next Steps

- **[Database View](./database-view.md)** — Explore database overview and statistics
- **[Table View](./table-view.md)** — View detailed table information and metadata
- **[Schema Explorer](./schema-explorer.md)** — Navigate your database structure
- **[Cluster Dashboard](../05-monitoring-dashboards/cluster-dashboard.md)** — Monitor cluster-wide metrics
