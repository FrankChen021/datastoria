import type { ServerDatabaseContext } from "@/lib/ai/agent/common-types";
import { createGeneralAgent } from "@/lib/ai/agent/general-agent";
import { streamSqlGeneration } from "@/lib/ai/agent/sql-generation-agent";
import { streamSqlOptimization } from "@/lib/ai/agent/sql-optimization-agent";
import { streamVisualization } from "@/lib/ai/agent/visualization-agent";
import type { ModelMessage } from "ai";

/**
 * Model configuration for sub-agents and orchestrator
 */
export interface InputModel {
  provider: string;
  modelId: string;
  apiKey: string;
}

/**
 * Sub-Agent Registry Item
 */
export interface SubAgent {
  id: string;
  description: string;
  keyword: string;
  stream: (args: {
    messages: ModelMessage[];
    modelConfig: InputModel;
    context?: ServerDatabaseContext;
  }) => Promise<unknown>;
  heuristics?: RegExp;
}

/**
 * Centralized registry for all expert sub-agents.
 * Each entry defines how the dispatcher should identify and call an expert.
 */
export const SUB_AGENTS: Record<string, SubAgent> = {
  generator: {
    id: "generator",
    description:
      "Use this for requests that explicitly ask to 'write SQL', 'generate query', or 'show example SQL'.",
    keyword: "@generator ",
    stream: streamSqlGeneration,
  },
  optimizer: {
    id: "optimizer",
    description:
      "Use this for analyzing slow queries, explaining SQL errors, or tuning performance. Key signals: 'slow', 'optimize', 'performance'.",
    keyword: "@optimizer ",
    stream: streamSqlOptimization,
  },
  visualizer: {
    id: "visualizer",
    description:
      "Use this for ANY request to create charts, graphs, or visual representations (pie, bar, line, etc.). If the user says 'visualize', 'plot', or mentions a chart type, ALWAYS use this.",
    keyword: "@visualizer ",
    stream: streamVisualization as SubAgent["stream"],
    heuristics: /\b(visualize|chart|graph|plot|pie|bar|line|histogram|scatter)\b/i,
  },
  general: {
    id: "general",
    description:
      "Use this for greetings, questions about Clickhouse concepts (MergeTree, etc.), and ANY request to 'show', 'list', 'get', 'calculate', or 'find' ACTUAL data/metadata. NOTE: If they ask to VISUALIZE that data, you MUST use 'visualizer' instead.",
    keyword: "@general ",
    stream: createGeneralAgent as SubAgent["stream"],
  },
};

/**
 * Pre-computed agent descriptions for planner prompt building.
 */
export const AGENT_LIST = Object.values(SUB_AGENTS)
  .map((agent) => `- '${agent.id}': ${agent.description}`)
  .join("\n");

/**
 * Pre-computed intent options for planner prompt building.
 */
export const AGENT_ID_LIST = Object.values(SUB_AGENTS)
  .map((agent) => agent.id)
  .join('" | "');

export type Intent = "generator" | "optimizer" | "visualizer" | "general";

/**
 * Resolves a string key (e.g. from metadata or tool output) to a valid Intent, or undefined.
 */
export function intentFromKey(key: string): Intent | undefined {
  const k = key.toLowerCase();
  if (k in SUB_AGENTS) return k as Intent;
  return undefined;
}
