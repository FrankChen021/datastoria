import type { PlannerMetadata } from "@/lib/ai/agent/plan/planning-types";
import type { ReasoningLevel } from "@/lib/ai/reasoning-levels";
import type { InferUITools, LanguageModelUsage, UIDataTypes, UIMessage } from "ai";

export interface AgentContext {
  /** Whether to prune successful validate_sql tool calls from history. Default: true. */
  pruneValidateSql?: boolean;
  /** Optional response language (BCP-47) enforced by system prompt for this chat flow only. */
  responseLanguage?: string;
  /** Whether to request model reasoning summaries when the selected model supports them. */
  outputReasoning?: boolean;
  /** Preferred reasoning level for models that expose configurable reasoning. */
  reasoningLevel?: ReasoningLevel;
}

export type MessageRole = "user" | "assistant" | "system" | "data" | "tool";
export type SessionRepositoryType = "local" | "remote";

export type MessagePartType = "text" | "file" | "tool-call" | "tool-result";

export interface TextPart {
  type: "text";
  text: string;
}

export interface FilePart {
  type: "file";
  mediaType: string;
  url: string;
  filename?: string;
}

export interface ToolCallPart {
  type: "tool-call";
  toolCallId: string;
  toolName: string;
  args: Record<string, unknown>;
}

export interface ToolResultPart {
  type: "tool-result";
  toolCallId: string;
  toolName: string;
  result: unknown;
}

export type MessagePart = TextPart | FilePart | ToolCallPart | ToolResultPart;

export type Mention = DatabaseMention | TableMention | SettingMention;

export interface DatabaseMention {
  kind: "database";
  name: string;
  engine: string;
  comment?: string;
}

export interface TableMention {
  kind: "table";
  name: string;
  engine: string;
}

export interface SettingMention {
  kind: "setting";
  name: string;
  type: string;
}

export interface MentionMetadata {
  version: 1;
  mentions: Mention[];
}

/**
 * Shared metadata bag for chat messages.
 *
 * This is:
 * - Used as the `metadata` generic for `UIMessage<MessageMetadata>`
 * - Persisted on the client in the `Message.metadata` field
 *
 * It intentionally allows arbitrary extra keys to match the `ai` SDK contract.
 */
export type MessageMetadata = {
  planner?: PlannerMetadata;
  usage?: LanguageModelUsage;
  model?: {
    provider: string;
    modelId: string;
  };
  /** Client-captured submit time for stable user-message display. */
  createdAt?: number;
  /** LLM-generated chat title (v2 skill-based chat). */
  title?: {
    text: string;
    usage: LanguageModelUsage;
  };
  mentionMetadata?: MentionMetadata;
  // Allow arbitrary extra metadata fields coming from the SDK or future agents
  [key: string]: unknown;
};

/**
 * Has the SAME shape as AppUIMessage which is mainly for UI rendering
 * This type is mainly for storage layer
 */
export interface Message {
  id: string;
  role: MessageRole;
  parts: MessagePart[];
  /**
   * Metadata attached to the message, coming from the server stream.
   *
   * This mirrors the `metadata` bag used by the `ai` SDK messages, and is where
   * we persist planner information and token usage coming from the server.
   * The UI reads fields like `metadata.usage` and `metadata.planner`.
   */
  metadata?: MessageMetadata;
  /**
   * Explicit sequence number for deterministic message ordering.
   * Immune to client/server clock skew. Optional for backward compatibility with
   * existing messages that were saved before this field was introduced.
   */
  sequence?: number;
  createdAt: Date;
  updatedAt: Date;
}

export interface Chat {
  chatId: string;
  databaseId?: string;
  title?: string;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * App UI message: UIMessage with MessageMetadata plus UI timestamps.
 * Single source of truth for message metadata (usage, planner) shared with Message.
 */
type AppTools = typeof import("@/lib/ai/tools/client/client-tools").ClientTools &
  typeof import("@/lib/ai/tools/clickhouse/clickhouse-tools").ClickHouseTools;

export type AppUIMessage = UIMessage<MessageMetadata, UIDataTypes, InferUITools<AppTools>> & {
  updatedAt?: Date;
  createdAt?: Date;
};

/**
 * Type for tool parts that have input, output, and state properties.
 *
 * This is based on the first element of `AppUIMessage["parts"]` and then
 * extended with strongly typed tool-specific fields.
 */
export type ToolPart = AppUIMessage["parts"][0] & {
  input?: unknown;
  output?: unknown;
  state?: string;
  toolName?: string;
  toolCallId?: string;
};

/**
 * Request payload for the "skill" tool — loads one or more skill manuals (SKILL.md).
 */
export type SkillToolInput = {
  names: string[];
};

/**
 * Request payload for the "skill_resource" tool — loads additional reference files
 * (e.g. AGENTS.md, rules/*.md) for skills whose manuals are already in context.
 */
export type SkillResourceToolInput = {
  resources: {
    /** Skill name (frontmatter `name` or folder name). */
    skill: string;
    /** Relative paths within that skill, e.g. ["AGENTS.md", "rules/schema-pk-plan-before-creation.md"]. */
    paths: string[];
  }[];
};
