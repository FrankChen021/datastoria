import type { DatabaseContext } from "@/components/chat/chat-context";
import type { InferUITools, UIDataTypes, UIMessage } from "ai";
import type { ClientTools } from "./tools/client/client-tools";

export type TokenUsage = {
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  reasoningTokens: number;
  cachedInputTokens: number;
};

export type AppUIMessage = UIMessage<
  {
    updatedAt?: Date;
    createdAt?: Date;
    usage?: TokenUsage;
  },
  UIDataTypes,
  InferUITools<typeof ClientTools>
> & {
  usage?: TokenUsage;
};

/**
 * Evidence Context - Evidence payload structure returned by collect_sql_optimization_evidence tool
 */
export interface EvidenceContext {
  goal: string;
  sql?: string;
  query_id?: string;
  symptoms?: {
    latency_ms?: number;
    read_rows?: number;
    read_bytes?: number;
    result_rows?: number;
    peak_memory_bytes?: number;
    spilled?: boolean;
    errors?: string | null;
  };
  tables?: Array<{ database: string; table: string; engine: string }>;
  table_schema?: Record<
    string,
    {
      columns: Array<[string, string]>;
      engine?: string;
      partition_key?: string | null;
      primary_key?: string | null;
      sorting_key?: string | null;
    }
  >;
  table_stats?: Record<
    string,
    {
      rows?: number;
      bytes?: number;
      parts?: number;
      partitions?: number;
    }
  >;
  explain_index?: string;
  explain_pipeline?: string;
  query_log?: {
    duration_ms?: number;
    read_rows?: number;
    read_bytes?: number;
    memory_usage?: number;
    result_rows?: number;
    exception?: string | null;
  };
  settings?: Record<string, string | number>;
  constraints?: string[];
  cluster?: {
    mode?: string;
    shards?: number;
    replicas?: number;
  };
  evidence_score?: number;
}

/**
 * Evidence Request - Structured request format from SQL optimization sub-agent
 */
export interface EvidenceRequest {
  type: "EvidenceRequest";
  mode: "light" | "full";
  required: string[];
  optional: string[];
  notes?: string;
}

/**
 * Server-side database context that extends DatabaseContext with server-specific fields
 */
export interface ServerDatabaseContext extends DatabaseContext {
  /**
   * User email from authentication session
   */
  userEmail: string;
}
