# User Manual

Welcome to the DataStoria user manual. This comprehensive guide will help you master all features of the AI-powered ClickHouse management console.

## Table of Contents

### 1. Getting Started
- [Introduction to DataStoria](./01-getting-started/introduction.md)
- [Installation & Setup](./01-getting-started/installation.md)
  - Building from Source
  - Running with Docker
  - Online Access
- [First Connection](./01-getting-started/first-connection.md)
  - Connecting to ClickHouse
  - Authentication Setup
  - Basic Navigation

### 2. AI-Powered Intelligence
- [Natural Language Data Exploration](./02-ai-features/natural-language-sql.md)
  - How to Use
  - Best Practices
  - Examples and Use Cases
- [Smart Query Optimization](./02-ai-features/query-optimization.md)
  - Understanding AI Recommendations
  - Applying Optimizations
  - Performance Impact Analysis
- [Intelligent Visualization](./02-ai-features/intelligent-visualization.md)
  - Generating Charts from Prompts
  - Chart Types Available
  - Customizing Visualizations
- [Ask AI for Help](./02-ai-features/ask-ai-for-help.md)
  - Getting Instant Error Assistance
  - Understanding Query Errors
  - Receiving AI-Powered Fixes
- [AI Model Configuration](./02-ai-features/ai-model-configuration.md)
  - Setting Up API Keys
  - Supported Providers
  - Privacy and Security

### 3. Query Experience
- [SQL Editor](./03-query-experience/sql-editor.md)
  - Syntax Highlighting
  - Auto-completion
  - Query Formatting
  - Keyboard Shortcuts
- [Error Diagnostics](./03-query-experience/error-diagnostics.md)
  - Understanding Error Messages
  - AI-Powered Fix Suggestions
  - Syntax Error Resolution
- [Query Execution](./03-query-experience/query-execution.md)
  - Running Queries
  - Viewing Results
  - Exporting Data
  - Query History
- [Query Log Inspector](./03-query-experience/query-log-inspector.md)
  - Timeline Views
  - Topology Graphs
  - Performance Analysis
  - Understanding Execution Metrics
- [Query Explain](./03-query-experience/query-explain.md)
  - Visual AST View
  - Pipeline Visualization
  - Understanding Execution Plans
  - Performance Insights
- [Dependency Graph](./03-query-experience/dependency-graph.md)
  - Visualizing Table Relationships
  - Materialized Views
  - Distributed Tables
  - External System Connections

### 4. Cluster Management
- [Multi-Cluster Setup](./04-cluster-management/multi-cluster-setup.md)
  - Adding Clusters
  - Switching Between Clusters
  - Cluster Configuration
- [Multi-Node Dashboard](./04-cluster-management/multi-node-dashboard.md)
  - Real-time Metrics
  - Merge Operations Monitoring
  - Replication Status
  - Node Health Indicators
- [Built-in Dashboards](./04-cluster-management/built-in-dashboards.md)
  - Query Performance Dashboard
  - ZooKeeper Status Dashboard
  - Custom Dashboard Creation
- [Schema Explorer](./04-cluster-management/schema-explorer.md)
  - Navigating Databases
  - Exploring Tables
  - Column Information
  - Table Metadata

### 5. Security & Privacy
- [Privacy Features](./05-security-privacy/privacy-features.md)
  - Local Execution Model
  - Data Privacy Guarantees
  - No Data Collection Policy
- [Authentication](./05-security-privacy/authentication.md)
  - OAuth Setup (Google, GitHub, Microsoft)
  - Credential Management
  - Security Best Practices
- [API Key Management](./05-security-privacy/api-key-management.md)
  - Bring Your Own API Key
  - Secure Storage
  - Key Rotation

### 6. Advanced Features
- [Query Templates](./06-advanced-features/query-templates.md)
  - Creating Templates
  - Using Templates
  - Sharing Templates
- [Data Export](./06-advanced-features/data-export.md)
  - Export Formats
  - Large Dataset Handling
  - Scheduled Exports
- [Performance Tuning](./06-advanced-features/performance-tuning.md)
  - Query Optimization Strategies
  - Index Recommendations
  - Resource Monitoring

### 7. Troubleshooting
- [Common Issues](./07-troubleshooting/common-issues.md)
  - Connection Problems
  - Query Errors
  - Performance Issues
- [Error Messages](./07-troubleshooting/error-messages.md)
  - Understanding Error Codes
  - Resolution Steps
  - Getting Help
- [Debugging Queries](./07-troubleshooting/debugging-queries.md)
  - Using Query Log Inspector
  - Analyzing Execution Plans
  - Performance Profiling

### 8. Best Practices
- [Query Writing](./08-best-practices/query-writing.md)
  - Efficient Query Patterns
  - Avoiding Common Pitfalls
  - Performance Tips
- [AI Feature Usage](./08-best-practices/ai-feature-usage.md)
  - Effective Prompting
  - Natural Language Query Tips
  - Visualization Best Practices
- [Cluster Management](./08-best-practices/cluster-management.md)
  - Monitoring Strategies
  - Resource Planning
  - Maintenance Schedules

### 9. Appendix
- [Keyboard Shortcuts](./09-appendix/keyboard-shortcuts.md)
- [Configuration Reference](./09-appendix/configuration-reference.md)
- [FAQ](./09-appendix/faq.md)
- [Glossary](./09-appendix/glossary.md)

---

## Quick Start Guide

New to DataStoria? Start here:

1. **Installation**: Follow the [Installation & Setup](./01-getting-started/installation.md) guide
2. **First Connection**: Learn how to [connect to your ClickHouse instance](./01-getting-started/first-connection.md)
3. **Try AI Features**: Explore [Natural Language Data Exploration](./02-ai-features/natural-language-sql.md)
4. **Run Your First Query**: Use the [SQL Editor](./03-query-experience/sql-editor.md)

## Need Help?

- Check the [FAQ](./09-appendix/faq.md) for common questions
- Review [Troubleshooting](./07-troubleshooting/common-issues.md) for solutions
- Visit [dataStoria.app](https://datastoria.app) for the online version

---

## For Maintainers

If you're maintaining this documentation and need to publish it:

- **[Deployment Guide](./DEPLOYMENT.md)** - Complete guide for converting markdown to HTML and deploying to Cloudflare Pages
- **[Nextra Setup Guide](./SETUP_NEXTRA.md)** - Quick setup instructions for Nextra (recommended for Next.js projects)

---

*Last updated: [Date will be updated automatically]*
