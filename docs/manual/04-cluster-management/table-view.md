---
title: Table View
description: Comprehensive table information including metadata, data samples, partitions, query history, and dependencies. Explore ClickHouse table details, monitor performance, and understand table relationships.
head:
  - - meta
    - name: keywords
      content: table view, table details, table metadata, table information, ClickHouse table, table statistics, table partitions, table data sample, table query history, table dependencies
---

# Table View

The Table View provides comprehensive information about a ClickHouse table, including metadata, data samples, partition information, query history, and dependencies. It serves as a central hub for understanding table structure, performance, and relationships.

## Overview

The Table View organizes table information into multiple tabs:

- **Overview Tab**: High-level statistics and performance metrics
- **Metadata Tab**: Table structure, columns, and CREATE TABLE statement
- **Dependencies Tab**: Visual graph of table dependencies
- **Data Sample Tab**: Sample rows from the table
- **Partitions Tab**: Partition information and size distribution
- **Query Dashboard Tab**: Query history and performance metrics
- **Part History Tab**: Historical part information and changes

## Accessing the Table View

### From Schema Explorer

1. **Navigate to Table**: Click on a table name in the Schema Explorer sidebar
2. **Table Tab Opens**: The Table View opens automatically in a new tab
3. **View Overview**: The Overview tab is displayed by default (if available)

### From Database View

1. **Open Database View**: Click on a database name
2. **Click Table Name**: Click on any table name in the table list
3. **Table Tab Opens**: The Table View opens in a new tab

## Available Tabs

The tabs available depend on the table engine type. Some engines have limited functionality:

| Table Engine | Overview | Metadata | Dependencies | Data Sample | Partitions | Query Dashboard | Part History |
|--------------|----------|----------|--------------|-------------|------------|------------------|--------------|
| **MergeTree family** | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| **Materialized Views** | ✅ | ✅ | ✅ | ❌ | ✅ | ❌ | ❌ |
| **Distributed Tables** | ❌ | ✅ | ✅ | ✅ | ❌ | ✅ | ❌ |
| **Kafka Tables** | ❌ | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ |
| **URL Tables** | ❌ | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ |
| **System Tables** | ❌ | ✅ | ❌ | ✅ | ❌ | ❌ | ❌ |

### Engine-Specific Notes

- **MergeTree family**: Includes MergeTree, ReplicatedMergeTree, ReplacingMergeTree, SummingMergeTree, AggregatingMergeTree, CollapsingMergeTree, VersionedCollapsingMergeTree, and other MergeTree variants. All tabs are fully supported.
- **Materialized Views**: Support overview, metadata, dependencies, and partitions. Data sample and query history are not available as these are view definitions, not data tables.
- **Distributed Tables**: Support data sampling, metadata, dependencies, and query dashboard. Partitions and part history are not applicable as these tables distribute data across cluster nodes.
- **Kafka Tables**: Only metadata and dependencies are available. These tables read from Kafka streams and don't store data locally.
- **URL Tables**: Only metadata and dependencies are available. These tables read from external URLs and don't store data locally.
- **System Tables**: Support data sample and metadata. Dependencies and other advanced features are not available for system tables.

## Overview Tab

The Overview tab provides high-level statistics and performance metrics for the table.

### Key Metrics

- **Table Size**: Total size on disk
- **Row Count**: Total number of rows
- **Part Count**: Number of data parts
- **Compression Ratio**: Data compression efficiency
- **Last Modified**: Last modification time

### Performance Charts

- **Size Over Time**: Table size trends
- **Row Count Trends**: Row count changes over time
- **Query Performance**: Query execution metrics
- **Part Operations**: Merge and mutation activity

### Quick Actions

- **View Data**: Quick access to data sample
- **View Partitions**: Access partition information
- **View Queries**: Access query history

## Metadata Tab

The Metadata tab displays detailed information about the table structure.

### Table Information

- **Database Name**: The database containing the table
- **Table Name**: The name of the table
- **Engine Type**: ClickHouse engine (MergeTree, ReplicatedMergeTree, etc.)
- **CREATE TABLE Statement**: Complete table definition
- **Metadata Modification Time**: When table metadata was last changed

### Column Information

For each column, view:

- **Column Name**: The name of the column
- **Data Type**: ClickHouse data type
- **Default Expression**: Default value or expression
- **Comment**: Column description (if available)
- **Codec**: Compression codec (if specified)
- **TTL**: Time-to-live expression (if specified)

### Table Properties

- **Partition Key**: Partitioning expression
- **Order By**: Sorting key
- **Primary Key**: Primary key definition
- **Sample By**: Sampling expression (if specified)
- **Settings**: Table-level settings and parameters

### Engine-Specific Information

- **Replication Settings**: For ReplicatedMergeTree tables
- **Distributed Settings**: For Distributed tables
- **Kafka Settings**: For Kafka tables
- **Other Engine Settings**: Engine-specific configuration

## Dependencies Tab

The Dependencies tab shows a visual graph of table dependencies.

### Features

- **Upstream Dependencies**: Tables this table depends on
- **Downstream Dependencies**: Tables that depend on this table
- **Interactive Graph**: Navigate dependencies visually
- **Table Details**: Click nodes to view table information

For detailed information about the dependency view, see [Dependency View](./dependency-view.md).

## Data Sample Tab

The Data Sample tab displays sample rows from the table.

### Features

- **Sample Rows**: View actual data from the table
- **Configurable Sample Size**: Adjust number of rows displayed
- **Column Display**: All columns with proper formatting
- **Sorting**: Sort by any column
- **Filtering**: Filter rows by column values
- **Export**: Export sample data

### Use Cases

- **Data Exploration**: Understand table contents
- **Data Quality**: Verify data correctness
- **Schema Validation**: Confirm column types and values
- **Query Planning**: Understand data structure for queries

## Partitions Tab

The Partitions tab provides detailed partition information.

### Partition Overview

- **Partition List**: All partitions in the table
- **Partition Key Values**: Values used for partitioning
- **Size Information**: Size per partition
- **Row Count**: Rows per partition
- **Part Count**: Number of parts per partition

### Size Distribution

- **Visual Charts**: See size distribution across partitions
- **Sortable Table**: Sort by size, rows, or part count
- **Percentage Breakdown**: See relative partition sizes

### Partition Details

Click on a partition to see:

- **Part Information**: Individual parts within the partition
- **Size Metrics**: Detailed size information
- **Modification Times**: When parts were created/modified
- **Compression**: Compression statistics per part

## Query Dashboard Tab

The Query Dashboard tab shows query history and performance metrics.

### Query History

- **Recent Queries**: Queries executed against this table
- **Query Details**: Full query text, execution time, rows read
- **Performance Metrics**: Query performance statistics
- **Time Range Filter**: Filter queries by time range

### Performance Analysis

- **Query Count**: Number of queries over time
- **Average Execution Time**: Performance trends
- **Rows Read**: Data access patterns
- **Slow Queries**: Identify performance issues

### Use Cases

- **Performance Monitoring**: Track query performance
- **Optimization**: Identify slow queries for optimization
- **Usage Analysis**: Understand how the table is being used
- **Troubleshooting**: Debug query performance issues

## Part History Tab

The Part History tab shows historical information about table parts.

### Part Information

- **Part Names**: All parts in the table
- **Creation Time**: When parts were created
- **Modification Time**: Last modification time
- **Size Information**: Size metrics per part
- **Row Count**: Rows per part

### Historical Tracking

- **Part Lifecycle**: Track part creation and deletion
- **Size Changes**: Monitor part size over time
- **Merge History**: See merge operations
- **Mutation History**: Track mutation operations

## Limitations

### Engine-Specific Limitations

- **System Tables**: Limited functionality for system tables
- **Kafka Tables**: No data sample or partitions
- **URL Tables**: Limited metadata and no data sample
- **External Tables**: May have limited functionality

### General Limitations

- **System Table Access**: Requires read access to ClickHouse system tables
- **Data Retention**: Historical data depends on system table retention
- **Performance Impact**: Querying large tables may be slow
- **Real-time Accuracy**: Some metrics may have slight delays
- **Version Compatibility**: Some features may not be available in older ClickHouse versions

## Best Practices

### Regular Monitoring

- **Monitor Size**: Track table size growth
- **Review Queries**: Regularly review query performance
- **Check Partitions**: Monitor partition distribution
- **Track Dependencies**: Understand table relationships

### Performance Optimization

- **Identify Issues**: Use metrics to find performance problems
- **Optimize Queries**: Use query history to optimize
- **Manage Partitions**: Use partition information for optimization
- **Monitor Operations**: Track merges and mutations

### Data Management

- **Data Quality**: Use data sample to verify quality
- **Schema Understanding**: Review metadata regularly
- **Dependency Tracking**: Understand table relationships
- **Maintenance Planning**: Use metrics for maintenance planning

## Integration with Other Features

- **Schema Explorer**: Navigate to related tables
- **Database View**: Access database-level information
- **Dependency View**: Explore table dependencies
- **Query Editor**: Use table information when writing queries
- **Query Log Inspector**: Analyze query performance in detail

## Next Steps

- **[Dependency View](./dependency-view.md)** — Explore table dependencies and relationships
- **[Database View](./database-view.md)** — View database-level statistics
- **[Query Log Inspector](../03-query-experience/query-log-inspector.md)** — Analyze query performance
- **[Schema Explorer](./schema-explorer.md)** — Navigate database structure
- **[SQL Editor](../03-query-experience/sql-editor.md)** — Query your tables
