import type { Connection } from "@/lib/connection/connection";
import { QueryUtils } from "@/lib/query-utils";

export const escapeSqlString = QueryUtils.escapeSqlString;

/**
 * Status of a tool execution stage
 */
export type StageStatus = "started" | "success" | "failed" | "skipped";

/**
 * Progress update callback for tools that support progress tracking
 */
export type ToolProgressCallback = (
  stage: string,
  progress: number,
  status: StageStatus,
  error?: string
) => void;

/**
 * Tool executor function type
 * Takes tool input and connection, returns tool output
 * Optionally accepts a progress callback for tools that support progress tracking
 */
export type ToolExecutor<TInput, TOutput> = (
  input: TInput,
  connection: Connection,
  progressCallback?: ToolProgressCallback
) => Promise<TOutput>;
