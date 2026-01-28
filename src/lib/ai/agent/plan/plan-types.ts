import type { Intent } from "@/lib/ai/agent/plan/agent-registry";
import type { TokenUsage } from "@/lib/ai/common-types";

/**
 * A FAKE server tool used to show progress at client as soon as possible and track identified intent
 */
export const SERVER_TOOL_PLAN = "plan" as const;

export interface PlanToolOutput {
  intent: Intent;
  title: string | undefined;
  usage: TokenUsage | undefined;
  reasoning: string | undefined;
}
