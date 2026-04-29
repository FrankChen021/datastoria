import { describe, expect, it } from "vitest";
import {
  buildQueryLogResourceSummary,
  parseDistributedTableTarget,
  parseExplainIndexText,
  parseExplainPipelineText,
  shouldCollectExplainPipeline,
} from "./collect-sql-optimization-evidence";

describe("collect_sql_optimization_evidence helpers", () => {
  it("parses distributed local table target from create_table_query", () => {
    const ddl = `
CREATE TABLE bithon.bithon_trace_span
(
  timestamp DateTime64(3)
)
ENGINE = Distributed('bithon_cluster', 'bithon', 'bithon_trace_span_local', cityHash64(traceId))
`;

    expect(parseDistributedTableTarget(ddl)).toEqual({
      cluster: "bithon_cluster",
      database: "bithon",
      table: "bithon_trace_span_local",
    });
  });

  it("extracts only index analysis details from EXPLAIN indexes output", () => {
    const explainText = `
Expression ((Projection names))
  Expression
    ReadFromMergeTree (bithon.bithon_trace_span_local)
    Indexes:
      MinMax
        Keys:
          timestamp
        Condition: and((timestamp in (-Inf, '1772705603')), (timestamp in ['1772704703', +Inf)))
        Parts: 46/2116
        Granules: 2579511/257007998
      Partition
        Keys:
          toYYYYMMDD(timestamp)
        Condition: and((toYYYYMMDD(timestamp) in (-Inf, 20260305]), (toYYYYMMDD(timestamp) in [20260305, +Inf)))
        Parts: 46/46
        Granules: 2579511/2579511
      PrimaryKey
        Keys:
          toStartOfMinute(timestamp)
        Condition: and((toStartOfMinute(timestamp) in (-Inf, '1772705580')), (toStartOfMinute(timestamp) in [1772704680, +Inf)))
        Parts: 46/46
        Granules: 2309075/2579511
        Search Algorithm: generic exclusion search
`;

    const evidence = parseExplainIndexText(explainText);

    expect(evidence.table).toBe("bithon.bithon_trace_span_local");
    expect(evidence.indexes).toHaveLength(3);
    expect(evidence.indexes[0]).toMatchObject({
      name: "MinMax",
      keys: ["timestamp"],
      parts: { selected: 46, total: 2116 },
    });
    expect(evidence.indexes[2]).toMatchObject({
      name: "PrimaryKey",
      keys: ["toStartOfMinute(timestamp)"],
      search_algorithm: "generic exclusion search",
    });
    expect(evidence.summary[0]).toContain("Read from bithon.bithon_trace_span_local");
    expect(evidence.summary[1]).toContain("MinMax");
    expect(evidence.raw_text).toBeUndefined();
  });

  it("captures skip index name and description from EXPLAIN indexes output", () => {
    const explainText = `
ReadFromMergeTree (bithon.bithon_trace_span_summary_local_v4)
Indexes:
  MinMax
    Keys:
      startTimeUs
    Condition: and((startTimeUs in (-Inf, '1772758874')), (startTimeUs in ['1772758874', +Inf)))
    Parts: 31/693
    Granules: 1077111/46959155
  Skip
    Name: idx_normalizedUrl_token
    Description: tokenbf_v1 GRANULARITY 1
    Parts: 9/27
    Granules: 62/63940
`;

    const evidence = parseExplainIndexText(explainText);

    expect(evidence.indexes).toHaveLength(2);
    expect(evidence.indexes[1]).toMatchObject({
      name: "Skip",
      index_name: "idx_normalizedUrl_token",
      description: "tokenbf_v1 GRANULARITY 1",
      parts: { selected: 9, total: 27 },
      granules: { selected: 62, total: 63940 },
    });
    expect(evidence.summary[2]).toContain("Skip (idx_normalizedUrl_token)");
    expect(evidence.summary[2]).toContain("description tokenbf_v1 GRANULARITY 1");
  });

  it("collects pipeline only when light mode sees a complex query shape", () => {
    expect(shouldCollectExplainPipeline("SELECT * FROM system.query_log", "light")).toBe(false);
    expect(
      shouldCollectExplainPipeline(
        "SELECT user_id, count() FROM events GROUP BY user_id ORDER BY count() DESC",
        "light"
      )
    ).toBe(true);
    expect(shouldCollectExplainPipeline("SELECT * FROM events", "full")).toBe(true);
  });

  it("summarizes explain pipeline parallelism and operators", () => {
    const pipelineText = `
(Expression)
ExpressionTransform
(Limit)
Limit
  (Sorting)
  MergingSortedTransform 32 → 1
    MergeSortingTransform × 32
      LimitsCheckingTransform × 32
        PartialSortingTransform × 32
          (Expression)
          ExpressionTransform × 32
            (ReadFromMergeTree)
            MergeTreeSelect(pool: ReadPool, algorithm: Thread) × 32 0 → 1
`;

    const evidence = parseExplainPipelineText(pipelineText);

    expect(evidence.max_parallelism).toBe(32);
    expect(evidence.operators).toContain("MergeSortingTransform");
    expect(evidence.summary).toContain("Pipeline fan-out reaches 32 parallel streams.");
    expect(evidence.summary).toContain("Sorting stages are present in the execution pipeline.");
  });

  it("keeps original ProfileEvents names in resource summary", () => {
    expect(
      buildQueryLogResourceSummary({
        OSCPUVirtualTimeMicroseconds: 1373426648,
        OSCPUWaitMicroseconds: 439838912,
        OSReadBytes: 1741291520,
        NetworkSendBytes: 14327,
      })
    ).toEqual({
      OSCPUVirtualTimeMicroseconds: 1373426648,
      OSCPUWaitMicroseconds: 439838912,
      OSReadBytes: 1741291520,
      NetworkSendBytes: 14327,
    });
  });
});
