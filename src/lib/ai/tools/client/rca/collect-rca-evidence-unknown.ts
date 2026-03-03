import {
  asNumber,
  type CauseCandidate,
  type PossibleAction,
  type SymptomContext,
  type SymptomEvidence,
} from "./collect-rca-evidence-common";

function mapSymptomTextToDimensions(symptomText: string): string[] {
  const lower = symptomText.toLowerCase();
  const dimensions = new Set<string>();

  if (/(slow|latency|timeout|duration|lag)/.test(lower)) dimensions.add("latency");
  if (/(error|fail|exception)/.test(lower)) dimensions.add("errors");
  if (/(insert|ingest|batch|part)/.test(lower)) dimensions.add("ingestion");
  if (/(replica|replication|readonly)/.test(lower)) dimensions.add("replication");
  if (/(disk|storage|space|partition)/.test(lower)) dimensions.add("storage");
  if (/(cpu|memory|resource|pressure)/.test(lower)) dimensions.add("resources");
  if (/(query|workload|throughput|qps)/.test(lower)) dimensions.add("workload");

  if (dimensions.size === 0) dimensions.add("workload");
  return Array.from(dimensions);
}

export async function collectUnknownEvidence(context: SymptomContext): Promise<SymptomEvidence> {
  const dimensions = mapSymptomTextToDimensions(context.symptomText || "");
  const observations: SymptomEvidence["observations"] = [];

  if (dimensions.includes("workload") || dimensions.includes("latency")) {
    const processes = await context.connection.queryJsonCompact(`
SELECT
  count() AS active_queries,
  max(now() - query_start_time) AS max_running_seconds
FROM {clusterAllReplicas:system.processes}`
    );
    const row = processes.data?.[0] as (number | null)[] | undefined;
    observations.push({
      source: "system.processes",
      description: "Active query pressure snapshot",
      metrics: {
        active_queries: asNumber(row?.[0]),
        max_running_seconds: asNumber(row?.[1]),
      },
    });
  }

  if (dimensions.includes("errors")) {
    const errors = await context.connection.queryJsonCompact(`
SELECT
  sum(value) AS error_count
FROM {clusterAllReplicas:system.errors}`
    );
    const row = errors.data?.[0] as (number | null)[] | undefined;
    observations.push({
      source: "system.errors",
      description: "Error counter snapshot",
      metrics: {
        error_count: asNumber(row?.[0]),
      },
    });
  }

  if (dimensions.includes("storage") || dimensions.includes("ingestion")) {
    const parts = await context.connection.queryJsonCompact(`
SELECT
  count() AS active_parts,
  uniqExact(concat(database, '.', table)) AS tables_with_parts
FROM {clusterAllReplicas:system.parts}
WHERE active`
    );
    const row = parts.data?.[0] as (number | null)[] | undefined;
    observations.push({
      source: "system.parts",
      description: "Global part inventory snapshot",
      metrics: {
        active_parts: asNumber(row?.[0]),
        tables_with_parts: asNumber(row?.[1]),
      },
    });
  }

  const candidates: CauseCandidate[] = [
    {
      cause: "insufficient_specific_signal",
      signal_strength: 0.25,
      indicators_matched: 1,
      indicators_checked: 4,
      evidence_for: ["generic probes detected broad pressure signals"],
      evidence_against: ["symptom did not map cleanly to a canonical RCA module"],
      next_checks: [
        "refine symptom using one of: high_query_latency, high_part_count, high_partition_count",
        "run collect_cluster_status with focused checks before RCA",
      ],
    },
  ];

  const possibleActions: PossibleAction[] = [
    {
      title: "Run focused RCA with a canonical symptom key",
      risk: "low",
      tied_to: "insufficient_specific_signal",
    },
  ];

  return {
    observations,
    candidates,
    possible_actions: possibleActions,
  };
}
