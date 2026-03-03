---
name: diagnose-clickhouse-clusters
description: Diagnose ClickHouse cluster health and provide concrete remediation.
---

# Tool Usage Rules

- Always call `collect_cluster_status` before health conclusions.
- For RCA questions, call `collect_rca_evidence` after status collection.
- Use only supported Phase 1 RCA symptoms: `high_query_latency`, `high_part_count`, `high_partition_count`, and `unknown`.
- For bounded-time questions, use `status_analysis_mode="windowed"` and reuse the same time window in follow-up calls.
- If user asks for a chart, use the `visualization` skill. Do not emit chart specs directly from this skill.
- Do not invent custom health-check SQL. Use tool outputs as the source of truth.

# Workflow (MANDATORY)

1. Determine whether the user asks for status only, or root cause ("why", "root cause", "reason", "caused by", "explain").
2. For RCA questions, pick one supported canonical symptom key based on user wording and worst-severity status findings.
3. Explain from tool output only: top candidates, signal strength, gaps, and prioritized actions.

# Severity Thresholds (Guidance)

- CRITICAL: replication lag > 300s, disk usage > 90%
- WARNING: replication lag > 60s, disk usage > 80%
- OK: metrics within normal ranges

Do not hardcode parts thresholds in responses. Use the thresholds and severities returned by `collect_cluster_status`.

# Output Format (MANDATORY)

Use one of these two formats:

## A) Status-only question

1. Summary table:
   Always print a table title line exactly before the table: `### Summary`.
   | Status | Nodes with Issues | Checks Run | Timestamp |
   |--------|-------------------|------------|-----------|
   | 🟢 OK / 🟠 WARNING / 🔴 CRITICAL | N | categories | ISO8601 |
2. Findings by category:
   Always print a table title line exactly before the table: `### Findings by Category`.
   Use a markdown table (not bullets) with one row per category.
   Required columns:
   | Category | Status | Key Metrics | Top Outlier / Scope | Notes |
   |----------|--------|-------------|----------------------|-------|
   | parts / errors / replication / ... | 🟢 OK / 🟠 WARNING / 🔴 CRITICAL | concise metric values with thresholds | node/table if present, else `-` | one short phrase |

   Table rules:
   - Include all categories returned by `collect_cluster_status` in stable order.
   - Status must include both emoji and text (for example `🟠 WARNING`), never emoji-only.
   - Markdown table cells do not reliably support line breaks in this UI. Do not try to render multi-line bullets in a cell.
   - In `Key Metrics`, put the 1-2 most important metrics only (single-line, semicolon-separated if needed).
   - Put additional metrics in `Notes` as compact key/value items (single-line).
   - Put numeric values first (for example `max_parts_per_table=533 (>500)`), avoid prose-heavy sentences.
   - Always wrap database/table identifiers in backticks (for example `` `db.table` `` or `` `db` ``) in all table cells.
   - If category has sub-findings (for example top errors), keep them in `Notes` as compact comma-separated items.
   - If no outlier exists, set `Top Outlier / Scope` to `-`.

3. Recommendations (max 3 items; each item = title + why + concrete SQL/command if needed).

## B) RCA question ("why", "cause", "reason", "explain")

Use compact structure only:

1. **RCA Verdict**: one sentence, max 30 words.
2. **Top Candidates**: markdown table with max 3 rows: `cause | signal_strength | why`.
3. **Key Evidence**: max 3 bullets, each bullet must include at least one metric/value from tool output.
   When `excluded_candidates` is non-empty, include at least one bullet explaining why a plausible cause was excluded.
4. **Possible Actions**: max 3 numbered items, sorted by impact.
5. **Gaps / Next Checks**: max 2 bullets.

RCA brevity limits:

- Keep total RCA response under 220 words (excluding SQL command blocks).
- Do not add long background/theory paragraphs.
- Use direct statements and numeric evidence.

# Critical Rules

- ALWAYS call `collect_cluster_status` before giving any opinion on current health.
- Use `status_analysis_mode="windowed"` when user asks for a bounded time window or historical context.
- For RCA questions, MUST call `collect_rca_evidence` after status check.
- Do NOT state root causes without RCA evidence output.
- If `gaps[]` is non-empty, explicitly state what evidence is missing.
- If all candidates have `signal_strength < 0.3`, state that the RCA is inconclusive and use candidate `next_checks` plus `gaps` to explain what to inspect next.
- If best candidate is weak (`0.30-0.39`), present it as a possibility with caveats and emphasize candidate `next_checks`.
- If `collect_rca_evidence.related_symptoms` is non-empty, include a line `Related symptoms:` and list them.
- If `related_symptoms` contains `high_partition_count`, explicitly state that partition explosion may be a contributing factor and suggest running RCA with `symptom=high_partition_count`.
- When follow-up questions omit time range, reuse the most recent explicit time window/range from prior turns.
- Never assume schema or table names; use only what tools return.
- Do not invent custom health-check SQL; use tool outputs as source of truth.
- Be concise and focus on remediation, not theory.
