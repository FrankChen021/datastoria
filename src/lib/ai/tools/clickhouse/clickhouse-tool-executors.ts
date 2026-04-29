import { type InferToolInput, type InferToolOutput } from "ai";
import type { ToolExecutor } from "./clickhouse-tool-types";
import type { ClickHouseTools } from "./clickhouse-tools";
import { collectSqlOptimizationEvidenceExecutor } from "./collect-sql-optimization-evidence";
import { executeSqlExecutor } from "./execute-sql";
import { exploreSchemaExecutor } from "./explore-schema";
import { getTablesExecutor } from "./get-tables";
import { collectRcaEvidenceExecutor } from "./rca/tool-collect-rca-evidence";
import { searchQueryLogExecutor } from "./search-query-log";
import { getClusterStatusExecutor } from "./status/collect-cluster-status";
import { validateSqlExecutor } from "./validate-sql";

/**
 * Runtime executor registry for ClickHouse tools.
 *
 * Keep this separate from `clickhouse-tools.ts` because tool schemas are imported by both server
 * and client code, while executors depend on the shared ClickHouse Connection implementation.
 */
export const ClickHouseToolExecutors: {
  [K in keyof typeof ClickHouseTools]: ToolExecutor<
    InferToolInput<(typeof ClickHouseTools)[K]>,
    InferToolOutput<(typeof ClickHouseTools)[K]>
  >;
} = {
  explore_schema: exploreSchemaExecutor,
  get_tables: getTablesExecutor,
  execute_sql: executeSqlExecutor,
  validate_sql: validateSqlExecutor,
  collect_sql_optimization_evidence: collectSqlOptimizationEvidenceExecutor,
  search_query_log: searchQueryLogExecutor,
  collect_cluster_status: getClusterStatusExecutor,
  collect_rca_evidence: collectRcaEvidenceExecutor,
};
