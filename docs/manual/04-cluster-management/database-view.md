---
title: Database View
description: Comprehensive database overview with statistics, table information, and dependency visualization. Monitor database health, size distribution, ongoing operations, and explore table relationships in ClickHouse.
head:
  - - meta
    - name: keywords
      content: database view, database overview, database statistics, database dashboard, ClickHouse database, database metrics, table statistics, database size, database health, database monitoring
---

# Database View

The Database View provides a comprehensive overview of a ClickHouse database, including statistics, table information, ongoing operations, and dependency visualization. It serves as a central hub for understanding database structure, performance, and health.

## Overview

The Database View combines multiple perspectives into a unified interface:

- **Database Overview Tab**: Statistics, metrics, and table information
- **Database Dependency Tab**: Visual graph of table dependencies within the database
- **Real-time Metrics**: Live statistics about database size, table counts, and operations
- **Table Management**: Quick access to table details and operations

## Accessing the Database View

### From Schema Explorer

1. **Navigate to Database**: Click on a database name in the Schema Explorer sidebar
2. **Database Tab Opens**: The Database View opens automatically in a new tab
3. **View Overview**: The Database Overview tab is displayed by default

## Database Overview Tab

The Database Overview tab provides comprehensive statistics and information about your database.

### Database Metadata

View essential database information:

- **Database Name**: The name of the database
- **Engine Type**: Database engine (if applicable)
- **Metadata**: All metadata fields from `system.databases`

### Key Statistics

The overview displays important metrics:

#### Database Size

- **Total Size**: Combined size of all tables in the database
- **Size on Disk**: Actual disk space used
- **Uncompressed Size**: Size before compression
- **Size Percentage**: Percentage of total disk space used

#### Table Information

- **Number of Tables**: Total count of tables in the database
- **Table List**: Detailed table information with:
  - Table name
  - Engine type
  - Row count
  - Size on disk
  - Uncompressed size
  - Size distribution percentage
  - Part count
  - Metadata modification time
  - Data modification time

#### Size Distribution

- **Size Percentage of All Disks**: How much of total disk space this database uses
- **Size Percentage of All Databases**: How this database compares to others
- **Table Size Distribution**: Visual breakdown of size by table

### Ongoing Operations

Monitor active database operations:

#### Ongoing Merges

- **Merge Count**: Number of active merge operations
- **Merge Details**: Click to see detailed merge information:
  - Table name
  - Result part name
  - Number of parts being merged
  - Elapsed time
  - Progress percentage
  - Memory usage
  - Bytes read/written
  - Rows read/written

#### Ongoing Mutations

- **Mutation Count**: Number of active mutation operations
- **Mutation Details**: Click to see detailed mutation information:
  - Database and table
  - Mutation ID
  - Command being executed
  - Parts remaining
  - Failure information (if any)

### Table Size Analysis

View detailed table size information:

- **Sortable Table**: Sort by size, row count, or modification time
- **Quick Access**: Click table names to open table details
- **Size Visualization**: See size distribution with percentage bars
- **Engine Information**: View table engine types
- **Modification Times**: Track when metadata and data were last modified

### Cluster Mode Features

When connected to a cluster, additional metrics are available:

#### Cluster-wide Statistics

- **Aggregate Database Size**: Total size across all nodes
- **Node Breakdown**: Size distribution by node
- **Compression Ratios**: Compression statistics per node
- **Part Counts**: Part distribution across cluster

#### Node Comparison

Compare database size and statistics across cluster nodes:

- **Hostname**: Each node in the cluster
- **Part Count**: Number of parts per node
- **Row Count**: Total rows per node
- **Disk Size**: Size on disk per node
- **Compressed/Uncompressed Size**: Storage metrics
- **Compression Ratio**: Compression efficiency

## Database Dependency Tab

The Database Dependency tab shows a visual graph of all table dependencies within the database.

### Features

- **Complete Dependency Graph**: All tables and their relationships
- **Interactive Navigation**: Click nodes to view table details
- **Upstream/Downstream View**: See dependency directions
- **Table Details Panel**: View CREATE TABLE statements and metadata

For detailed information about the dependency view, see [Dependency View](./dependency-view.md).

## Time Range Selection

The Database Overview supports time range selection for metrics:

- **Predefined Ranges**: Last 15 minutes, Last hour, Today, This week, etc.
- **Custom Range**: Select specific start and end times
- **Auto-refresh**: Automatically refresh data at intervals

## Refresh Functionality

### Manual Refresh

- **Refresh Button**: Click the refresh icon to update all metrics
- **Time Range Update**: Changing time range automatically refreshes data
- **Real-time Updates**: Get latest statistics on demand

### Auto-refresh

- **Automatic Updates**: Enable auto-refresh for continuous monitoring
- **Configurable Interval**: Set refresh interval as needed
- **Background Updates**: Updates happen without interrupting your work

## Use Cases

### Database Health Monitoring

- **Size Monitoring**: Track database growth over time
- **Operation Monitoring**: Monitor ongoing merges and mutations
- **Performance Tracking**: Identify tables with high activity

### Capacity Planning

- **Size Analysis**: Understand database size distribution
- **Growth Trends**: Track size changes over time
- **Resource Planning**: Plan storage and compute resources

### Table Management

- **Table Discovery**: Find and explore tables in the database
- **Size Optimization**: Identify large tables for optimization
- **Maintenance Planning**: Plan maintenance based on table statistics

### Cluster Management

- **Node Comparison**: Compare database size across cluster nodes
- **Balance Analysis**: Identify size imbalances
- **Cluster Health**: Monitor cluster-wide database metrics

## Limitations

- **System Table Access**: Requires read access to ClickHouse system tables
- **Data Retention**: Metrics depend on ClickHouse's system tables retention
- **Performance Impact**: Querying large databases may be slow
- **Real-time Accuracy**: Some metrics may have slight delays
- **Version Compatibility**: Some features may not be available in older ClickHouse versions

## Best Practices

### Regular Monitoring

- **Schedule Reviews**: Regularly review database statistics
- **Track Trends**: Monitor size and operation trends over time
- **Set Alerts**: Use metrics to identify issues early

### Performance Optimization

- **Identify Large Tables**: Focus optimization on large tables
- **Monitor Operations**: Track merge and mutation performance
- **Balance Resources**: Use cluster metrics to balance load

### Maintenance Planning

- **Plan Maintenance**: Use statistics to plan maintenance windows
- **Track Changes**: Monitor modification times for change tracking
- **Optimize Storage**: Use size information for storage optimization

## Integration with Other Features

- **Schema Explorer**: Navigate to specific tables from the overview
- **Table View**: Open detailed table views from the table list
- **Dependency View**: Access dependency visualization from the dependency tab
- **Cluster Dashboard**: Compare with cluster-wide metrics
- **Query Editor**: Use database information when writing queries

## Next Steps

- **[Dependency View](./dependency-view.md)** — Explore table dependencies and relationships
- **[Table View](./table-view.md)** — View detailed table information
- **[Cluster Dashboard](../05-monitoring-dashboards/cluster-dashboard.md)** — Monitor cluster-wide metrics
- **[Node Dashboard](../05-monitoring-dashboards/node-dashboard.md)** — View individual node performance
- **[Schema Explorer](./schema-explorer.md)** — Navigate database structure
