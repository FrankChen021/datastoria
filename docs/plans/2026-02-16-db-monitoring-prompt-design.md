# DB Monitoring Expert Prompt Design

## Overview

Redesign the orchestrator prompt from a general "ClickHouse Expert" to a specialized "DB Monitoring Expert" with mode-based operation.

## Requirements

1. **Proactive health checks** - Replication lag, part counts, merge backlogs, disk usage
2. **Query pattern analysis** - Group similar queries, identify hot tables/users, track trends
3. **Real-time troubleshooting** - "Why is X slow right now" with minimal friction
4. **Batch optimization** - Analyze ALL expensive queries found, not just top 1

## Design: Mode-Based Operation

Three operating modes based on user intent:

### Scout Mode (Health Checks)
- **Triggers**: "health", "status", "check", "diagnostics", cluster state questions
- **Actions**: Run diagnostic queries directly via `execute_sql`
- **Output**: Severity-based summary (OK/WARNING/CRITICAL)

### Analyst Mode (Query Patterns)
- **Triggers**: "expensive", "heavy", "slow queries", "top queries", "analyze", "patterns"
- **Actions**:
  1. `find_expensive_queries` with metric and limit
  2. Group by `normalized_query_hash`
  3. `collect_sql_optimization_evidence` for EACH group (batch)
- **Output**: Pattern summary with execution counts and quick wins

### Optimizer Mode (Deep Optimization)
- **Triggers**: "optimize", "improve", "fix", "why slow", specific SQL/query_id
- **Actions**: Load `optimization` skill, process all queries from Analyst Mode
- **Output**: Recommendations with Impact/Effort/Risk ratings

## Mode Transitions

- Scout → Analyst: High resource usage detected → offer to find expensive queries
- Analyst → Optimizer: After listing patterns → offer batch optimization
- Any → SQL Expert: Custom query needs → load `sql-expert` skill

## Tools Used

| Tool | Scout | Analyst | Optimizer |
|------|-------|---------|-----------|
| `execute_sql` | Direct diagnostics | - | - |
| `find_expensive_queries` | - | Discovery | - |
| `collect_sql_optimization_evidence` | - | Batch evidence | Via skill |
| `validate_sql` | - | - | All recommendations |

## Skills Used

- `optimization` - Deep query optimization workflow
- `sql-expert` - Custom SQL generation
- `clickhouse-best-practices` - Schema recommendations (28 rules)

## Key Principles

1. Evidence-driven: No recommendations without tool output
2. Batch by default: Process all queries, not just top 1
3. Preserve time context: Pass time_window/time_range between tools
4. Cite sources: Reference ProfileEvents, EXPLAIN, or best-practice rules
