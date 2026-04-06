import { type InferToolInput, type InferToolOutput } from "ai";
import type { ToolExecutor } from "./client-tool-types";
import { ClientTools, type AskUserQuestionInput, type AskUserQuestionOutput } from "./client-tools";
import { collectSqlOptimizationEvidenceExecutor } from "./collect-sql-optimization-evidence";
import { executeSqlExecutor } from "./execute-sql";
import { exploreSchemaExecutor } from "./explore-schema";
import { getTablesExecutor } from "./get-tables";
import { collectRcaEvidenceExecutor } from "./rca/tool-collect-rca-evidence";
import { searchQueryLogExecutor } from "./search-query-log";
import { getClusterStatusExecutor } from "./status/collect-cluster-status";
import { validateSqlExecutor } from "./validate-sql";

const askUserQuestionExecutor: ToolExecutor<
  AskUserQuestionInput,
  AskUserQuestionOutput
> = async () => {
  throw new Error("ask_user_question is interactive and must not be eagerly executed.");
};

/**
 * Runtime executor registry for client tools.
 *
 * Keep this separate from `client-tools.ts` because the tool schema definitions are imported
 * by both server and client code, while some executors depend on server-only modules.
 */
export const ClientToolExecutors: {
  [K in keyof typeof ClientTools]: ToolExecutor<
    InferToolInput<(typeof ClientTools)[K]>,
    InferToolOutput<(typeof ClientTools)[K]>
  >;
} = {
  ask_user_question: askUserQuestionExecutor,
  explore_schema: exploreSchemaExecutor,
  get_tables: getTablesExecutor,
  execute_sql: executeSqlExecutor,
  validate_sql: validateSqlExecutor,
  collect_sql_optimization_evidence: collectSqlOptimizationEvidenceExecutor,
  search_query_log: searchQueryLogExecutor,
  collect_cluster_status: getClusterStatusExecutor,
  collect_rca_evidence: collectRcaEvidenceExecutor,
};
